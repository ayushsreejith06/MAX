const { startDiscussion } = require('../agents/discussion/discussionLifecycle');
const { loadDiscussions, findDiscussionById, saveDiscussion } = require('../utils/discussionStorage');
const DiscussionEngine = require('./DiscussionEngine');
const DiscussionRoom = require('../models/DiscussionRoom');
const { loadAgents, updateAgent } = require('../utils/agentStorage');
const { updateSector, getSectorById } = require('../utils/sectorStorage');
const ExecutionEngine = require('./ExecutionEngine');
const { saveRejectedItems } = require('../utils/rejectedItemsStorage');
const { getAllSectors } = require('../utils/sectorStorage');
const { managerAddToExecutionList, getManagerBySectorId } = require('../utils/executionListStorage');
const { extractConfidence } = require('../utils/confidenceUtils');
const { validateTrade, checkRiskAppetite, loadRules } = require('../simulation/rules');
const ConfidenceEngine = require('./ConfidenceEngine');
const fs = require('fs');
const path = require('path');
const { readDataFile, writeDataFile } = require('../utils/persistence');
const { transitionStatus, STATUS } = require('../utils/discussionStatusService');

const EXECUTION_LOGS_FILE = 'executionLogs.json';

/**
 * ManagerEngine - Handles manager-level decisions including discussion creation
 */
class ManagerEngine {
  constructor() {
    this.tickCounter = 0;
    this.discussionEngine = new DiscussionEngine();
    this.confidenceEngine = new ConfidenceEngine();
    this.confidenceThreshold = 65; // Default threshold for discussion readiness
    this.approvalConfidenceThreshold = 65; // Threshold for auto-approving checklist items
    this.APPROVAL_THRESHOLD = 70; // Minimum score (0-100) for checklist item approval
    this.MAX_ROUNDS = 2; // Maximum number of discussion rounds before force resolution
    // Track recent discussion creation times per sector to prevent discussion storms
    // Format: sectorId -> timestamp of last discussion creation
    this.lastDiscussionCreation = new Map();
    // Minimum time between discussion creations (5 seconds)
    this.minDiscussionIntervalMs = 5000;
    // Debug log file path
    this.debugLogPath = path.join(__dirname, '../../debug-manager-evaluation.log');
  }

  /**
   * Write debug log to both console and file
   * @private
   */
  _writeDebugLog(message, data = null) {
    const timestamp = new Date().toISOString();
    const logLine = `[${timestamp}] ${message}`;
    const fullLog = data ? `${logLine}\n${JSON.stringify(data, null, 2)}\n` : `${logLine}\n`;
    
    // Print to console
    console.log(logLine);
    if (data) {
      console.log(JSON.stringify(data, null, 2));
    }
    
    // Write to file (append mode)
    try {
      fs.appendFileSync(this.debugLogPath, fullLog + '\n', 'utf8');
    } catch (error) {
      console.error(`[ManagerEngine] Failed to write to debug log file: ${error.message}`);
    }
  }

  /**
   * Evaluate a single checklist item based on scoring criteria and constraints
   * @param {Object} manager - Manager agent object
   * @param {Object} item - Checklist item to evaluate
   * @param {Object} sectorState - Sector state object (includes sector data)
   * @returns {Promise<Object>} Evaluation result with status, managerReason, and item
   */
  async evaluateChecklistItem(manager, item, sectorState) {
    if (!item || !sectorState) {
      throw new Error('item and sectorState are required');
    }

    const sector = sectorState;
    const sectorId = sector.id || sector.sectorId;

    // Hard constraint 1: Check sector rules violations
    let isHardConstraintViolated = false;
    let hardConstraintReason = null;
    try {
      const tradeDecision = {
        quantity: item.amount || 0,
        assetId: sectorId,
        sectorId: sectorId,
        action: item.action,
        leverage: item.leverage
      };
      
      const validation = await validateTrade(sectorId, tradeDecision);
      if (!validation.valid) {
        isHardConstraintViolated = true;
        hardConstraintReason = `Violates sector rules: ${validation.errors.join(', ')}`;
        
        // DEBUG LOG: Hard constraint violation
        const debugData = {
          itemId: item.id,
          rawItemContent: JSON.parse(JSON.stringify(item)),
          computedExpectedImpact: null,
          computedConfidence: null,
          computedRiskLevel: null,
          alignmentWithSectorGoal: null,
          finalDecisionScore: null,
          approvalThreshold: this.APPROVAL_THRESHOLD,
          isHardConstraintViolated: true,
          hardConstraintReason: hardConstraintReason,
          finalDecision: 'REJECTED'
        };
        this._writeDebugLog(`[evaluateChecklistItem] Item ${item.id} REJECTED - Hard constraint violation`, debugData);
        
        return {
          status: 'REJECTED',
          managerReason: hardConstraintReason,
          item: item
        };
      }
    } catch (error) {
      console.warn(`[ManagerEngine] Error validating trade rules for item ${item.id}:`, error.message);
      // Continue evaluation if validation fails (non-critical)
    }

    // Hard constraint 2: Check risk level
    try {
      const itemRiskLevel = this._calculateItemRiskLevel(item, sector);
      const riskWithinAppetite = await checkRiskAppetite(sectorId, itemRiskLevel);
      
      if (!riskWithinAppetite) {
        isHardConstraintViolated = true;
        hardConstraintReason = `Risk level (${itemRiskLevel.toFixed(1)}) exceeds sector risk appetite`;
        
        // DEBUG LOG: Hard constraint violation (risk)
        const debugData = {
          itemId: item.id,
          rawItemContent: JSON.parse(JSON.stringify(item)),
          computedExpectedImpact: null,
          computedConfidence: null,
          computedRiskLevel: itemRiskLevel,
          alignmentWithSectorGoal: null,
          finalDecisionScore: null,
          approvalThreshold: this.APPROVAL_THRESHOLD,
          isHardConstraintViolated: true,
          hardConstraintReason: hardConstraintReason,
          finalDecision: 'REJECTED'
        };
        this._writeDebugLog(`[evaluateChecklistItem] Item ${item.id} REJECTED - Risk constraint violation`, debugData);
        
        return {
          status: 'REJECTED',
          managerReason: hardConstraintReason,
          item: item
        };
      }
    } catch (error) {
      console.warn(`[ManagerEngine] Error checking risk appetite for item ${item.id}:`, error.message);
      // Continue evaluation if risk check fails (non-critical)
    }

    // Calculate scoring components
    const workerConfidence = this._getWorkerConfidence(item);
    const expectedImpact = this._calculateExpectedImpact(item, sector);
    const riskLevel = this._calculateItemRiskLevel(item, sector);
    const alignmentWithSectorGoal = this._calculateAlignmentWithSectorGoal(item, sector);

    // Calculate composite score (weighted average)
    // Weights can be adjusted based on manager preferences
    const weights = {
      workerConfidence: 0.35,
      expectedImpact: 0.30,
      riskLevel: 0.20, // Lower risk = higher score (inverted)
      alignmentWithSectorGoal: 0.15
    };

    // Normalize risk level (lower risk = higher score)
    const normalizedRiskScore = 100 - riskLevel;

    const compositeScore = 
      (workerConfidence * weights.workerConfidence) +
      (expectedImpact * weights.expectedImpact) +
      (normalizedRiskScore * weights.riskLevel) +
      (alignmentWithSectorGoal * weights.alignmentWithSectorGoal);

    // Apply scoring threshold - but be lenient: only reject if score is significantly below threshold
    // Default to approval unless there's a clear reason to reject
    // Only reject if score is well below threshold (more than 20 points) OR if there are other red flags
    const scoreGap = this.APPROVAL_THRESHOLD - compositeScore;
    const shouldReject = scoreGap > 20 || // Score is significantly below threshold
      workerConfidence < 10 || // Worker has very low confidence (< 10%)
      (riskLevel > 80 && workerConfidence < 50); // High risk AND low confidence
    
    const status = shouldReject ? 'REJECTED' : 'APPROVED';
    
    const managerReason = status === 'APPROVED'
      ? `Approved: Score ${compositeScore.toFixed(1)}/${100} (Confidence: ${workerConfidence.toFixed(1)}, Impact: ${expectedImpact.toFixed(1)}, Risk: ${riskLevel.toFixed(1)}, Alignment: ${alignmentWithSectorGoal.toFixed(1)})`
      : shouldReject && scoreGap > 20
        ? `Rejected: Score ${compositeScore.toFixed(1)}/${100} is significantly below threshold ${this.APPROVAL_THRESHOLD} (gap: ${scoreGap.toFixed(1)}). Confidence: ${workerConfidence.toFixed(1)}, Impact: ${expectedImpact.toFixed(1)}, Risk: ${riskLevel.toFixed(1)}, Alignment: ${alignmentWithSectorGoal.toFixed(1)}`
        : shouldReject && workerConfidence < 10
          ? `Rejected: Worker confidence (${workerConfidence.toFixed(1)}%) is too low (< 10%). Score: ${compositeScore.toFixed(1)}/${100}`
          : `Rejected: High risk (${riskLevel.toFixed(1)}) combined with low confidence (${workerConfidence.toFixed(1)}%). Score: ${compositeScore.toFixed(1)}/${100}`;

    // DEBUG LOG: Final evaluation result
    const debugData = {
      itemId: item.id,
      rawItemContent: JSON.parse(JSON.stringify(item)),
      computedExpectedImpact: expectedImpact,
      computedConfidence: workerConfidence,
      computedRiskLevel: riskLevel,
      alignmentWithSectorGoal: alignmentWithSectorGoal,
      finalDecisionScore: compositeScore,
      approvalThreshold: this.APPROVAL_THRESHOLD,
      isHardConstraintViolated: isHardConstraintViolated,
      hardConstraintReason: hardConstraintReason,
      finalDecision: status,
      scoreBreakdown: {
        workerConfidence,
        expectedImpact,
        riskLevel,
        alignmentWithSectorGoal,
        normalizedRiskScore,
        weights
      }
    };
    this._writeDebugLog(`[evaluateChecklistItem] Item ${item.id} evaluation complete: ${status}`, debugData);

    return {
      status: status,
      managerReason: managerReason,
      item: item,
      score: compositeScore,
      scoreBreakdown: {
        workerConfidence,
        expectedImpact,
        riskLevel,
        alignmentWithSectorGoal
      }
    };
  }

  /**
   * Get worker confidence from checklist item
   * @private
   */
  _getWorkerConfidence(item) {
    // Use item.confidence if available (0-100 scale)
    if (typeof item.confidence === 'number') {
      return Math.max(0, Math.min(100, item.confidence));
    }
    
    // Default to 50 if no confidence provided
    return 50;
  }

  /**
   * Calculate expected impact based on item amount and action
   * @private
   */
  _calculateExpectedImpact(item, sector) {
    const amount = typeof item.amount === 'number' ? item.amount : 0;
    const action = (item.action || '').toLowerCase();
    
    // Base impact on amount (normalized to 0-100)
    // Assume max impact at 10000 units = 100 points
    const amountScore = Math.min(100, (amount / 10000) * 100);
    
    // Adjust based on action type
    let actionMultiplier = 1.0;
    if (action.includes('buy') || action.includes('deploy')) {
      actionMultiplier = 1.2; // Buying/deploying has higher impact
    } else if (action.includes('sell') || action.includes('withdraw')) {
      actionMultiplier = 0.9; // Selling has lower impact
    } else if (action.includes('rebalance')) {
      actionMultiplier = 1.1; // Rebalancing has moderate-high impact
    }
    
    return Math.min(100, amountScore * actionMultiplier);
  }

  /**
   * Calculate risk level for checklist item (0-100 scale)
   * @private
   */
  _calculateItemRiskLevel(item, sector) {
    // Base risk from sector
    const sectorRisk = typeof sector.riskScore === 'number' ? sector.riskScore : 50;
    
    // Adjust based on amount (larger amounts = higher risk)
    const amount = typeof item.amount === 'number' ? item.amount : 0;
    const amountRisk = Math.min(30, (amount / 10000) * 30); // Max 30 points from amount
    
    // Adjust based on action type
    const action = (item.action || '').toLowerCase();
    let actionRisk = 0;
    if (action.includes('buy') || action.includes('deploy')) {
      actionRisk = 10; // Buying has moderate risk
    } else if (action.includes('sell')) {
      actionRisk = 5; // Selling has lower risk
    } else if (action.includes('rebalance')) {
      actionRisk = 15; // Rebalancing has higher risk
    }
    
    // Adjust based on confidence (lower confidence = higher risk)
    const confidence = this._getWorkerConfidence(item);
    const confidenceRisk = (100 - confidence) * 0.2; // Max 20 points from low confidence
    
    const totalRisk = Math.min(100, sectorRisk * 0.4 + amountRisk + actionRisk + confidenceRisk);
    
    return totalRisk;
  }

  /**
   * Calculate alignment with sector goals
   * @private
   */
  _calculateAlignmentWithSectorGoal(item, sector) {
    // Base alignment score
    let alignment = 60; // Default moderate alignment
    
    // Check if item action aligns with sector description/goals
    const sectorDescription = (sector.description || '').toLowerCase();
    const itemReason = ((item.reason || item.reasoning || '') + ' ' + (item.action || '')).toLowerCase();
    
    // Simple keyword matching (can be enhanced with NLP)
    const keywords = sectorDescription.split(/\s+/).filter(w => w.length > 3);
    const matches = keywords.filter(keyword => itemReason.includes(keyword)).length;
    
    if (keywords.length > 0) {
      const matchRatio = matches / keywords.length;
      alignment = 40 + (matchRatio * 60); // 40-100 range based on keyword matches
    }
    
    // Boost alignment if confidence is high
    const confidence = this._getWorkerConfidence(item);
    alignment = alignment * 0.7 + (confidence * 0.3);
    
    return Math.min(100, Math.max(0, alignment));
  }

  /**
   * Evaluate all PENDING checklist items for a discussion
   * @param {string} discussionId - Discussion ID
   * @returns {Promise<Object>} Updated discussion with manager decisions
   */
  async managerEvaluateChecklist(discussionId) {
    if (!discussionId) {
      throw new Error('discussionId is required');
    }

    const discussionData = await findDiscussionById(discussionId);
    if (!discussionData) {
      throw new Error(`Discussion ${discussionId} not found`);
    }

    const discussionRoom = DiscussionRoom.fromData(discussionData);

    // Ensure discussion is in_progress (not decided/closed)
    if (discussionRoom.status === 'decided' || discussionRoom.status === 'CLOSED' || discussionRoom.status === 'closed') {
      throw new Error(`Cannot evaluate checklist: Discussion ${discussionId} is already decided/closed. Current status: ${discussionRoom.status}`);
    }

    // Get sector state
    const sector = await getSectorById(discussionRoom.sectorId);
    if (!sector) {
      throw new Error(`Sector ${discussionRoom.sectorId} not found`);
    }

    // Get manager agent
    const manager = await getManagerBySectorId(discussionRoom.sectorId);
    if (!manager) {
      throw new Error(`Manager agent not found for sector ${discussionRoom.sectorId}`);
    }

    // Ensure checklist exists
    if (!Array.isArray(discussionRoom.checklist) || discussionRoom.checklist.length === 0) {
      console.warn(`[ManagerEngine] Discussion ${discussionId} has no checklist items to evaluate`);
      
      // DEBUG LOG: No checklist items
      const debugData = {
        discussionId: discussionId,
        checklistLength: 0,
        pendingItemsCount: 0,
        reason: 'No checklist items to evaluate'
      };
      this._writeDebugLog(`[managerEvaluateChecklist] Discussion ${discussionId} - No checklist items`, debugData);
      
      return discussionRoom;
    }

    // FAILSAFE: Check for items that have been stuck too long and force-resolve them
    const now = Date.now();
    const ITEM_TIMEOUT_MS = 5 * 60 * 1000; // 5 minutes timeout for items
    const REVISE_TIMEOUT_MS = 10 * 60 * 1000; // 10 minutes timeout for REVISE_REQUIRED items
    
    let forceResolvedCount = 0;
    for (const item of discussionRoom.checklist) {
      const status = (item.status || '').toUpperCase();
      const itemCreatedAt = item.createdAt ? new Date(item.createdAt).getTime() : now;
      const itemUpdatedAt = item.updatedAt ? new Date(item.updatedAt).getTime() : itemCreatedAt;
      const timeSinceUpdate = now - itemUpdatedAt;
      const timeSinceCreation = now - itemCreatedAt;
      
      // Force-resolve PENDING items that have been stuck too long
      if ((!item.status || status === 'PENDING') && timeSinceCreation > ITEM_TIMEOUT_MS) {
        console.warn(`[ManagerEngine] FAILSAFE: Force-resolving PENDING item ${item.id} that has been stuck for ${Math.round(timeSinceCreation / 1000)}s`);
        item.status = 'REJECTED';
        item.managerReason = `Auto-rejected: Item remained PENDING for too long (${Math.round(timeSinceCreation / 1000)}s). Manager score threshold not met.`;
        item.evaluatedAt = new Date().toISOString();
        forceResolvedCount++;
      }
      
      // Force-resolve REVISE_REQUIRED items that have been stuck too long (convert to terminal REJECTED)
      if (status === 'REVISE_REQUIRED' && timeSinceUpdate > REVISE_TIMEOUT_MS) {
        console.warn(`[ManagerEngine] FAILSAFE: Force-resolving REVISE_REQUIRED item ${item.id} that has been stuck for ${Math.round(timeSinceUpdate / 1000)}s`);
        item.status = 'REJECTED'; // Convert to terminal state
        item.requiresRevision = false;
        item.managerReason = (item.managerReason || '') + ` Auto-rejected: No revision received within timeout (${Math.round(timeSinceUpdate / 1000)}s).`;
        item.evaluatedAt = new Date().toISOString();
        forceResolvedCount++;
      }
    }
    
    if (forceResolvedCount > 0) {
      console.log(`[ManagerEngine] FAILSAFE: Force-resolved ${forceResolvedCount} stuck items in discussion ${discussionId}`);
      discussionRoom.updatedAt = new Date().toISOString();
      await saveDiscussion(discussionRoom);
    }

    // Filter for PENDING and RESUBMITTED items (RESUBMITTED items need re-evaluation after worker revision)
    // Also include items without status (should be treated as PENDING)
    const pendingItems = discussionRoom.checklist.filter(item => {
      const status = (item.status || '').toUpperCase();
      return !item.status || 
             status === 'PENDING' || 
             status === 'RESUBMITTED' ||
             (status === 'REVISE_REQUIRED' && !item.requiresRevision); // Items that were REVISE_REQUIRED but worker hasn't responded yet
    });

    // CRITICAL: If no pending items but discussion has items, check if any need evaluation
    // This ensures we don't skip items that should be evaluated
    if (pendingItems.length === 0) {
      // Check if there are any items that might need re-evaluation
      const allItems = discussionRoom.checklist || [];
      const hasUnevaluatedItems = allItems.some(item => {
        const status = (item.status || '').toUpperCase();
        // Items without status, or items that were auto-evaluated but might need manager review
        return !item.status || !item.evaluatedAt || !item.managerReason;
      });
      
      if (!hasUnevaluatedItems) {
        console.log(`[ManagerEngine] No PENDING items to evaluate for discussion ${discussionId}`);
        
        // DEBUG LOG: No pending items
        const debugData = {
          discussionId: discussionId,
          checklistLength: discussionRoom.checklist.length,
          pendingItemsCount: 0,
          reason: 'No PENDING items to evaluate',
          allItemStatuses: discussionRoom.checklist.map(item => ({ id: item.id, status: item.status }))
        };
        this._writeDebugLog(`[managerEvaluateChecklist] Discussion ${discussionId} - No pending items`, debugData);
        
        // Even if no pending items, check if discussion can close
        if (this.canDiscussionClose(discussionRoom)) {
          console.log(`[ManagerEngine] Discussion ${discussionId} can close - all items resolved. Auto-closing...`);
          return await this.closeDiscussion(discussionId);
        }
        
        return discussionRoom;
      }
    }

    console.log(`[ManagerEngine] Evaluating ${pendingItems.length} PENDING checklist items for discussion ${discussionId}`);

    // DEBUG LOG: Start of evaluation
    this._writeDebugLog(`[managerEvaluateChecklist] Starting evaluation for discussion ${discussionId}`, {
      discussionId: discussionId,
      totalChecklistItems: discussionRoom.checklist.length,
      pendingItemsCount: pendingItems.length,
      sectorId: discussionRoom.sectorId,
      managerId: manager?.id
    });

    // Ensure managerDecisions array exists
    if (!Array.isArray(discussionRoom.managerDecisions)) {
      discussionRoom.managerDecisions = [];
    }

    // Evaluate each PENDING item
    const managerDecisions = [];
    const updatedChecklist = [];
    const evaluationResults = [];

    for (const item of discussionRoom.checklist) {
      // Skip items that are not PENDING or RESUBMITTED
      const itemStatus = (item.status || '').toUpperCase();
      const shouldEvaluate = !item.status || 
                            itemStatus === 'PENDING' || 
                            itemStatus === 'RESUBMITTED' ||
                            (itemStatus === 'REVISE_REQUIRED' && !item.requiresRevision);
      
      if (!shouldEvaluate) {
        // Keep existing decision if any
        const existingDecision = discussionRoom.managerDecisions.find(
          decision => decision.item && decision.item.id === item.id
        );
        if (existingDecision) {
          managerDecisions.push(existingDecision);
        }
        updatedChecklist.push(item);
        continue;
      }

      // Evaluate the item
      const evaluation = await this.evaluateChecklistItem(manager, item, sector);

      // FAILSAFE: If score is below threshold, ensure it's rejected
      // This is a double-check to ensure low-scoring items are never approved
      if (evaluation.score !== undefined && evaluation.score < this.APPROVAL_THRESHOLD && evaluation.status === 'APPROVED') {
        console.warn(`[ManagerEngine] FAILSAFE: Item ${item.id} was approved but score (${evaluation.score}) is below threshold (${this.APPROVAL_THRESHOLD}). Auto-rejecting.`);
        evaluation.status = 'REJECTED';
        evaluation.managerReason = `Auto-rejected: Score ${evaluation.score.toFixed(1)} below threshold ${this.APPROVAL_THRESHOLD}. ${evaluation.managerReason || ''}`;
      }

      // Store evaluation result for summary log
      evaluationResults.push({
        itemId: item.id,
        status: evaluation.status,
        score: evaluation.score,
        scoreBreakdown: evaluation.scoreBreakdown,
        managerReason: evaluation.managerReason
      });

      // Update item status - follow lifecycle: REJECTED -> REVISE_REQUIRED
      // Step 1: Set status to REJECTED and add managerReason
      item.status = evaluation.status;
      item.managerReason = evaluation.managerReason;
      item.evaluatedAt = new Date().toISOString();
      if (!item.createdAt) {
        item.createdAt = item.evaluatedAt;
      }
      item.updatedAt = item.evaluatedAt;

      // Step 2: If rejected, immediately convert to REVISE_REQUIRED (but track for timeout)
      if (evaluation.status === 'REJECTED') {
        item.status = 'REVISE_REQUIRED';
        item.requiresRevision = true;
        if (!item.revisionCount) {
          item.revisionCount = 0;
        }
        // Track when revision was required for timeout handling
        item.revisionRequiredAt = item.evaluatedAt;
        // Don't increment revisionCount here - it will be incremented when worker revises
      }

      // Create manager decision
      const managerDecision = {
        item: { ...item },
        approved: evaluation.status === 'APPROVED',
        status: item.status,
        reason: evaluation.managerReason,
        score: evaluation.score,
        scoreBreakdown: evaluation.scoreBreakdown
      };

      managerDecisions.push(managerDecision);
      updatedChecklist.push(item);

      console.log(`[ManagerEngine] Item ${item.id}: ${evaluation.status} - ${evaluation.managerReason}`);
    }

    // DEBUG LOG: Summary of all evaluations
    const approvedCount = evaluationResults.filter(r => r.status === 'APPROVED').length;
    const rejectedCount = evaluationResults.filter(r => r.status === 'REJECTED').length;
    const summaryDebugData = {
      discussionId: discussionId,
      totalItemsEvaluated: evaluationResults.length,
      approvedCount: approvedCount,
      rejectedCount: rejectedCount,
      approvalThreshold: this.APPROVAL_THRESHOLD,
      evaluationResults: evaluationResults,
      averageScore: evaluationResults.length > 0 
        ? evaluationResults.reduce((sum, r) => sum + (r.score || 0), 0) / evaluationResults.length 
        : 0
    };
    this._writeDebugLog(`[managerEvaluateChecklist] Evaluation summary for discussion ${discussionId}`, summaryDebugData);

    // Update discussion with manager decisions and updated checklist
    discussionRoom.managerDecisions = managerDecisions;
    discussionRoom.checklist = updatedChecklist;

    // Extract approved items for finalizedChecklist
    const approvedItems = managerDecisions
      .filter(decision => decision.approved === true && decision.item)
      .map(decision => {
        const item = decision.item;
        return {
          id: item.id,
          action: item.action,
          amount: item.amount,
          reason: item.reason || item.reasoning || '',
          confidence: item.confidence,
          round: item.round || discussionRoom.currentRound,
          agentId: item.agentId,
          agentName: item.agentName,
          approved: true,
          approvedAt: new Date().toISOString()
        };
      });

    // Update finalizedChecklist (append approved items, don't replace)
    if (!Array.isArray(discussionRoom.finalizedChecklist)) {
      discussionRoom.finalizedChecklist = [];
    }
    
    // Only add items that aren't already in finalizedChecklist
    const existingApprovedIds = new Set(discussionRoom.finalizedChecklist.map(item => item.id));
    const newApprovedItems = approvedItems.filter(item => !existingApprovedIds.has(item.id));
    discussionRoom.finalizedChecklist = [...discussionRoom.finalizedChecklist, ...newApprovedItems];

    // Save updated discussion
    await saveDiscussion(discussionRoom);
    
    // Keep discussion status as IN_PROGRESS when checklist items exist
    const currentStatus = (discussionRoom.status || '').toUpperCase();
    if (currentStatus !== 'IN_PROGRESS' && currentStatus !== 'DECIDED' && currentStatus !== 'CLOSED') {
      await transitionStatus(discussionRoom.id, STATUS.IN_PROGRESS, 'Checklist items exist');
    }

    // Extract rejected items and store them globally (for rejected items count)
    const rejectedDecisions = managerDecisions.filter(decision => decision.approved === false && decision.item);
    if (rejectedDecisions.length > 0) {
      try {
        // Get sector info for rejected items
        const sectors = await getAllSectors();
        const sectorInfo = sectors.find(s => s.id === discussionRoom.sectorId);
        const sectorSymbol = sectorInfo?.symbol || sectorInfo?.sectorSymbol || 'N/A';
        
        // Create rejected items with required metadata
        const rejectedItems = rejectedDecisions.map(decision => {
          const item = decision.item;
          const itemText = item.reason || item.reasoning || item.text || item.description || '';
          
          return {
            id: `rejected-${discussionRoom.id}-${item.id || Date.now()}`,
            text: itemText,
            discussionId: discussionRoom.id,
            discussionTitle: discussionRoom.title || 'Untitled Discussion',
            sectorId: discussionRoom.sectorId,
            sectorSymbol: sectorSymbol,
            timestamp: Date.now()
          };
        });
        
        // Save rejected items to global storage
        await saveRejectedItems(rejectedItems);
        console.log(`[ManagerEngine] Stored ${rejectedItems.length} rejected items to global storage`);
        
        // DEBUG LOG: Rejected items saved
        this._writeDebugLog(`[managerEvaluateChecklist] Saved ${rejectedItems.length} rejected items to storage`, {
          discussionId: discussionId,
          rejectedItemsCount: rejectedItems.length,
          rejectedItemIds: rejectedItems.map(item => item.id)
        });
      } catch (error) {
        console.error(`[ManagerEngine] Error storing rejected items:`, error);
        // Don't throw - continue with discussion processing even if rejected items storage fails
      }
    }

    // Trigger worker responses for all REVISE_REQUIRED items
    const reviseRequiredItems = updatedChecklist.filter(item => 
      item.status === 'REVISE_REQUIRED' || item.requiresRevision === true
    );
    
    if (reviseRequiredItems.length > 0) {
      console.log(`[ManagerEngine] Triggering worker responses for ${reviseRequiredItems.length} REVISE_REQUIRED items`);
      const discussionEngine = new DiscussionEngine();
      
      // Process worker responses for each rejected item
      for (const item of reviseRequiredItems) {
        try {
          await discussionEngine.workerRespondToRejection(discussionId, item.id);
          console.log(`[ManagerEngine] Worker responded to rejection for item ${item.id}`);
        } catch (error) {
          console.error(`[ManagerEngine] Error processing worker response for item ${item.id}:`, error);
          // Continue processing other items even if one fails
        }
      }
      
      // Reload discussion after worker responses to get updated state
      const updatedAfterWorkerResponse = await findDiscussionById(discussionId);
      if (updatedAfterWorkerResponse) {
        discussionRoom = DiscussionRoom.fromData(updatedAfterWorkerResponse);
        // Update our local checklist reference
        updatedChecklist = discussionRoom.checklist || [];
      }
    }

    // FAILSAFE: After worker responses, check for any REVISE_REQUIRED items that are still stuck
    // Convert them to terminal REJECTED state so discussion can close
    const stillReviseRequired = updatedChecklist.filter(item => {
      const status = (item.status || '').toUpperCase();
      return status === 'REVISE_REQUIRED' && item.requiresRevision === true;
    });
    
    if (stillReviseRequired.length > 0) {
      const currentTime = Date.now();
      let convertedCount = 0;
      
      for (const item of stillReviseRequired) {
        const revisionRequiredAt = item.revisionRequiredAt ? new Date(item.revisionRequiredAt).getTime() : currentTime;
        const timeSinceRevisionRequired = currentTime - revisionRequiredAt;
        
        // If revision was required more than 10 minutes ago and no revision received, convert to REJECTED
        if (timeSinceRevisionRequired > REVISE_TIMEOUT_MS) {
          console.warn(`[ManagerEngine] FAILSAFE: Converting stuck REVISE_REQUIRED item ${item.id} to terminal REJECTED state (no revision received for ${Math.round(timeSinceRevisionRequired / 1000)}s)`);
          item.status = 'REJECTED';
          item.requiresRevision = false;
          item.managerReason = (item.managerReason || '') + ` Auto-rejected: No revision received within timeout.`;
          item.evaluatedAt = new Date().toISOString();
          item.updatedAt = item.evaluatedAt;
          convertedCount++;
        }
      }
      
      if (convertedCount > 0) {
        console.log(`[ManagerEngine] FAILSAFE: Converted ${convertedCount} stuck REVISE_REQUIRED items to REJECTED in discussion ${discussionId}`);
        discussionRoom.checklist = updatedChecklist;
        discussionRoom.updatedAt = new Date().toISOString();
        await saveDiscussion(discussionRoom);
      }
    }

    console.log(`[ManagerEngine] Completed evaluation for discussion ${discussionId}: ${approvedItems.length} approved, ${pendingItems.length - approvedItems.length} rejected`);

    // CRITICAL: Check if discussion can be closed after evaluation
    // Reload discussion to get latest state after all updates
    const reloadedData = await findDiscussionById(discussionId);
    if (reloadedData) {
      const reloadedRoom = DiscussionRoom.fromData(reloadedData);
      
      // Ensure all items are in terminal states
      const allItems = Array.isArray(reloadedRoom.checklist) ? reloadedRoom.checklist : [];
      const nonTerminalItems = allItems.filter(item => {
        const status = (item.status || '').toUpperCase();
        return !['APPROVED', 'REJECTED', 'ACCEPT_REJECTION'].includes(status);
      });
      
      if (nonTerminalItems.length > 0) {
        console.warn(`[ManagerEngine] Discussion ${discussionId} has ${nonTerminalItems.length} non-terminal items:`, 
          nonTerminalItems.map(item => ({ id: item.id, status: item.status })));
      }
      
      if (this.canDiscussionClose(reloadedRoom)) {
        console.log(`[ManagerEngine] Discussion ${discussionId} is ready to close after managerEvaluateChecklist. All items resolved. Auto-closing...`);
        
        // DEBUG LOG: Discussion closing
        const closeDebugData = {
          discussionId: discussionId,
          approvedItemsCount: approvedItems.length,
          rejectedItemsCount: pendingItems.length - approvedItems.length,
          canClose: true,
          reason: 'All items resolved',
          totalItems: allItems.length,
          terminalItems: allItems.length - nonTerminalItems.length
        };
        this._writeDebugLog(`[managerEvaluateChecklist] Discussion ${discussionId} - Closing discussion`, closeDebugData);
        
        // Close discussion (marks as DECIDED then CLOSED)
        return await this.closeDiscussion(discussionId);
      } else {
        // Log why discussion cannot close
        const blockingItems = allItems.filter(item => {
          const status = (item.status || '').toUpperCase();
          return ['PENDING', 'REVISE_REQUIRED', 'RESUBMITTED'].includes(status) || item.requiresRevision === true;
        });
        console.log(`[ManagerEngine] Discussion ${discussionId} cannot close yet: ${blockingItems.length} blocking items, ${nonTerminalItems.length} non-terminal items`);
      }
    }

    // DEBUG LOG: Final return (discussion not closing)
    const finalDebugData = {
      discussionId: discussionId,
      approvedItemsCount: approvedItems.length,
      rejectedItemsCount: pendingItems.length - approvedItems.length,
      canClose: false,
      discussionStatus: discussionRoom.status,
      reviseRequiredCount: reviseRequiredItems.length
    };
    this._writeDebugLog(`[managerEvaluateChecklist] Discussion ${discussionId} - Evaluation complete, discussion remains open`, finalDebugData);

    return discussionRoom;
  }

  /**
   * Handle discussion ready flag and create discussion if needed
   * @param {string} sectorId - Sector ID
   * @param {boolean} discussionReady - Whether discussion should be triggered
   * @param {Object} sector - Sector object with agents
   * @returns {Promise<{created: boolean, discussionId: string|null, checklistState: Object|null}>}
   */
  async handleDiscussionReady(sectorId, discussionReady, sector) {
    // DEBUG: Log when receiving discussionReady = true
    if (discussionReady) {
      console.log(`[ManagerEngine] Received discussionReady = true for sector ${sectorId}`);
    }

    if (!discussionReady) {
      return { created: false, discussionId: null, checklistState: null };
    }

    try {
      // Check if there are any non-closed discussions for this sector
      // A new discussion is allowed only when ALL previous discussions are DECIDED or CLOSED
      const { hasNonClosedDiscussions } = require('../utils/discussionStorage');
      const hasActive = await hasNonClosedDiscussions(sectorId);
      
      if (hasActive) {
        // Find the active discussion for logging
        const existingDiscussions = await loadDiscussions();
        const openDiscussion = existingDiscussions.find(d => 
          d.sectorId === sectorId && 
          !['DECIDED', 'decided', 'CLOSED', 'closed', 'finalized', 'archived', 'accepted', 'completed'].includes((d.status || '').toUpperCase())
        );
        
        if (openDiscussion) {
          // DEBUG: Log that discussion already exists
          console.log(`[ManagerEngine] Non-closed discussion already exists for sector ${sectorId}: ${openDiscussion.id} (status: ${openDiscussion.status})`);
          const checklistState = this._getChecklistState(openDiscussion);
          console.log(`[ManagerEngine] Discussion ID: ${openDiscussion.id}, Checklist State:`, JSON.stringify(checklistState, null, 2));
          return { 
            created: false, 
            discussionId: openDiscussion.id, 
            checklistState 
          };
        }
      }

      // Safeguard: Check for at least 1 non-manager agent before creating discussion
      const allAgents = Array.isArray(sector.agents) ? sector.agents.filter(a => a && a.id) : [];
      const nonManagerAgents = allAgents.filter(agent => {
        const role = (agent.role || '').toLowerCase();
        return role !== 'manager' && !role.includes('manager');
      });
      
      if (nonManagerAgents.length < 1) {
        console.log(`[ManagerEngine] Cannot create discussion for sector ${sectorId}: requires at least 1 non-manager agent, found ${nonManagerAgents.length}`);
        return { created: false, discussionId: null, checklistState: null };
      }

      // VALIDATION: STRICT CONFIDENCE GATE - Check ALL participating agents (non-manager) have confidence >= 65
      // Manager confidence alone is insufficient - only participating agents are checked
      const { loadAgents } = require('../utils/agentStorage');
      const { extractConfidence } = require('../utils/confidenceUtils');
      const allAgentsFromStorage = await loadAgents();
      
      // Get participating agents from storage (non-manager agents only)
      const participatingAgents = allAgentsFromStorage.filter(a => 
        a && a.id && 
        a.sectorId === sectorId && 
        a.role !== 'manager' && 
        !(a.role || '').toLowerCase().includes('manager')
      );
      
      if (participatingAgents.length > 0) {
        const allAboveThreshold = participatingAgents.every(agent => extractConfidence(agent) >= 65);
        
        if (!allAboveThreshold) {
          const agentDetails = participatingAgents.map(a => `${a.name || a.id}: ${extractConfidence(a)}`).join(', ');
          console.log(`[ManagerEngine] DISCUSSION_SKIPPED - reason: LOW_CONFIDENCE - Not all participating agents meet threshold (>= 65) for sector ${sectorId}. Agents: ${agentDetails}`);
          return { created: false, discussionId: null, checklistState: null };
        }
      } else {
        // No participating agents found
        console.log(`[ManagerEngine] DISCUSSION_SKIPPED - reason: LOW_CONFIDENCE - No participating agents found for sector ${sectorId}`);
        return { created: false, discussionId: null, checklistState: null };
      }

      // Safeguard: Prevent discussion storms - check if a discussion was created recently
      const lastCreationTime = this.lastDiscussionCreation.get(sectorId);
      if (lastCreationTime !== undefined) {
        const timeSinceLastCreation = Date.now() - lastCreationTime;
        if (timeSinceLastCreation < this.minDiscussionIntervalMs) {
          const remainingMs = this.minDiscussionIntervalMs - timeSinceLastCreation;
          console.log(`[ManagerEngine] Cannot create discussion for sector ${sectorId}: discussion created ${Math.round(timeSinceLastCreation / 1000)}s ago, waiting ${Math.round(remainingMs / 1000)}s more to prevent discussion storm`);
          return { created: false, discussionId: null, checklistState: null };
        }
      }

      // Create new discussion
      const sectorName = sector.sectorName || sector.name || sectorId;
      const title = `Discussion triggered - All agents confident (${sectorName})`;
      
      // Get agent IDs from sector (non-manager agents only)
      const agentIds = nonManagerAgents.map(a => a.id);

      const discussionRoom = await startDiscussion(sectorId, title, agentIds);
      
      // Update last creation time to prevent discussion storms
      this.lastDiscussionCreation.set(sectorId, Date.now());
      
      // DEBUG: Log when creating a new discussion
      console.log(`[ManagerEngine] Created new discussion: ID = ${discussionRoom.id}`);
      
      const checklistState = this._getChecklistState(discussionRoom);
      
      // DEBUG: Log discussion ID and checklist state
      console.log(`[ManagerEngine] Discussion ID: ${discussionRoom.id}, Checklist State:`, JSON.stringify(checklistState, null, 2));

      return { 
        created: true, 
        discussionId: discussionRoom.id, 
        checklistState 
      };
    } catch (error) {
      console.error(`[ManagerEngine] Error handling discussion ready:`, error);
      return { created: false, discussionId: null, checklistState: null };
    }
  }

  /**
   * Get checklist state from discussion
   * @private
   */
  _getChecklistState(discussion) {
    if (!discussion) return null;
    
    return {
      id: discussion.id,
      status: discussion.status,
      hasMessages: Array.isArray(discussion.messages) && discussion.messages.length > 0,
      messageCount: Array.isArray(discussion.messages) ? discussion.messages.length : 0,
      hasDecision: !!discussion.finalDecision,
      agentCount: Array.isArray(discussion.agentIds) ? discussion.agentIds.length : 0,
      createdAt: discussion.createdAt,
      updatedAt: discussion.updatedAt
    };
  }

  /**
   * Start discussion if confidence threshold is met and no active discussion exists
   * STRICT THRESHOLD: ALL agents (manager + generals) must have confidence >= 65
   * Manager confidence = average(confidence of all agents) AND >= 65
   * @param {string} sectorId - Sector ID
   * @param {Object} sector - Sector object with agents
   * @returns {Promise<{started: boolean, discussionId: string|null}>}
   */
  async startDiscussionIfReady(sectorId, sector) {
    try {
      // GUARD: Reload agents from storage to prevent stale confidence values
      // This ensures we read confidence AFTER it was updated with monotonic rule
      // Flow order: LLM reasoning → extract confidence → apply monotonic rule → discussion check
      const allAgents = await loadAgents();
      const agents = allAgents
        .filter(agent => agent && agent.id && agent.sectorId === sectorId);
      
      if (agents.length === 0) {
        console.log(`[DISCUSSION BLOCKED] No agents found in sector ${sectorId}`);
        return { started: false, discussionId: null };
      }

      // VALIDATION 1: Check ALL agents (manager + generals) have confidence >= 65
      // Hard constraint: Agents with confidence < 65 cannot trigger or continue discussions
      // extractConfidence reads from agent.llmAction.confidence (if LLM reasoning happened)
      // or agent.confidence (which is now LLM-derived)
      const allAboveThreshold = agents.every(agent => extractConfidence(agent) >= 65);

      if (!allAboveThreshold) {
        console.log(`[DISCUSSION BLOCKED] Not all agents meet threshold (>= 65)`);
        console.log(`[DISCUSSION CHECK]`, {
          sectorId,
          agentConfidences: agents.map(a => `${a.name || a.id}: ${extractConfidence(a)}`),
          allAboveThreshold: false
        });
        return { started: false, discussionId: null };
      }

      // VALIDATION 2: Check if there are any non-closed discussions for this sector
      const { hasNonClosedDiscussions } = require('../utils/discussionStorage');
      const hasActive = await hasNonClosedDiscussions(sectorId);
      
      if (hasActive) {
        // Find the active discussion for logging
        const existingDiscussions = await loadDiscussions();
        const activeDiscussion = existingDiscussions.find(d => {
          if (d.sectorId !== sectorId) return false;
          const status = (d.status || '').toUpperCase();
          const closedStatuses = ['DECIDED', 'CLOSED', 'FINALIZED', 'ARCHIVED', 'ACCEPTED', 'COMPLETED'];
          return !closedStatuses.includes(status);
        });
        
        if (activeDiscussion) {
          console.log(`[DISCUSSION BLOCKED] Non-closed discussion exists: ${activeDiscussion.id} (status: ${activeDiscussion.status})`);
          return { started: false, discussionId: activeDiscussion.id };
        }
      }

      // VALIDATION 3: Check sector balance > 0
      const sectorBalance = typeof sector.balance === 'number' ? sector.balance : 0;
      if (sectorBalance <= 0) {
        console.log(`[DISCUSSION BLOCKED] Sector balance (${sectorBalance}) must be greater than 0`);
        return { started: false, discussionId: null };
      }

      // Safeguard: Check for at least 1 non-manager agent before creating discussion
      const nonManagerAgents = agents.filter(agent => {
        const role = (agent.role || '').toLowerCase();
        return role !== 'manager' && !role.includes('manager');
      });
      
      if (nonManagerAgents.length < 1) {
        console.log(`[DISCUSSION BLOCKED] Requires at least 1 non-manager agent, found ${nonManagerAgents.length}`);
        return { started: false, discussionId: null };
      }

      // All checks passed - log and start discussion
      console.log(`[DISCUSSION CHECK]`, {
        sectorId,
        agentConfidences: agents.map(a => `${a.name || a.id}: ${extractConfidence(a)}`),
        allAboveThreshold: true,
        sectorBalance: sectorBalance
      });

      // Start new discussion
      const sectorName = sector.sectorName || sector.name || sectorId;
      const title = `Discussion triggered - All agents confident (${sectorName})`;
      
      // Get agent IDs from sector (non-manager agents only)
      const agentIds = nonManagerAgents.map(a => a.id);

      const discussionRoom = await startDiscussion(sectorId, title, agentIds);
      
      console.log(`[ManagerEngine] Started new discussion: ID = ${discussionRoom.id}`);

      return { 
        started: true, 
        discussionId: discussionRoom.id 
      };
    } catch (error) {
      console.error(`[ManagerEngine] Error starting discussion:`, error);
      return { started: false, discussionId: null };
    }
  }

  /**
   * Finalize checklist when discussion reaches max rounds
   * @param {string} sectorId - Sector ID
   * @param {Object} sector - Sector object
   * @returns {Promise<{finalized: boolean, discussionId: string|null}>}
   */
  async finalizeChecklist(sectorId, sector) {
    try {
      // Find the active discussion for this sector
      const discussions = Array.isArray(sector.discussions) ? sector.discussions : [];
      if (discussions.length === 0) {
        return { finalized: false, discussionId: null };
      }

      // Get the most recent discussion
      const discussionId = discussions[discussions.length - 1];
      const discussionData = await findDiscussionById(discussionId);

      if (!discussionData) {
        return { finalized: false, discussionId: null };
      }

      // Use DiscussionEngine to finalize
      const updatedSector = await this.discussionEngine.finalizeDiscussion(sector);
      
      console.log(`[ManagerEngine] Finalized checklist for discussion: ID = ${discussionId}`);

      return { 
        finalized: true, 
        discussionId: discussionId 
      };
    } catch (error) {
      console.error(`[ManagerEngine] Error finalizing checklist:`, error);
      return { finalized: false, discussionId: null };
    }
  }

  /**
   * Start a discussion for a sector (alias for createDiscussion for consistency)
   * @param {string} sectorId - Sector ID
   * @returns {Promise<{created: boolean, discussion: Object|null}>}
   */
  async startDiscussion(sectorId) {
    return this.createDiscussion(sectorId);
  }

  /**
   * Create a new discussion for a sector
   * @param {string} sectorId - Sector ID
   * @returns {Promise<{created: boolean, discussion: Object|null}>}
   */
  async createDiscussion(sectorId) {
    try {
      console.log(`[ManagerEngine] createDiscussion called for sector ${sectorId}`);
      
      // Load sector to get sector name and agents
      const { getSectorById } = require('../utils/sectorStorage');
      let sector = await getSectorById(sectorId);
      
      if (!sector) {
        throw new Error(`Sector ${sectorId} not found`);
      }

      // VALIDATION 0: Validate and auto-fill market data before starting discussion
      const { validateMarketDataForDiscussion } = require('../utils/marketDataValidation');
      sector = await validateMarketDataForDiscussion(sector);

      // VALIDATION 1: Check if there are any non-closed discussions for this sector
      // A new discussion is allowed only when ALL previous discussions are DECIDED or CLOSED
      const { hasNonClosedDiscussions, loadDiscussions } = require('../utils/discussionStorage');
      const hasActive = await hasNonClosedDiscussions(sectorId);
      
      if (hasActive) {
        // Find the active discussion for logging
        const existingDiscussions = await loadDiscussions();
        const activeDiscussion = existingDiscussions.find(d => {
          if (d.sectorId !== sectorId) return false;
          const status = (d.status || '').toUpperCase();
          const closedStatuses = ['DECIDED', 'CLOSED', 'FINALIZED', 'ARCHIVED', 'ACCEPTED', 'COMPLETED'];
          return !closedStatuses.includes(status);
        });
        
        if (activeDiscussion) {
          console.log(`[ManagerEngine] Cannot create discussion - Non-closed discussion exists for sector ${sectorId}: ${activeDiscussion.id} (status: ${activeDiscussion.status})`);
          return { 
            created: false, 
            discussion: DiscussionRoom.fromData(activeDiscussion) 
          };
        }
      } else {
        console.log(`[ManagerEngine] ✓ No non-closed discussions found for sector ${sectorId}, proceeding with creation...`);
      }

      // VALIDATION 2: Check sector balance > 0
      const sectorBalance = typeof sector.balance === 'number' ? sector.balance : 0;
      if (sectorBalance <= 0) {
        console.log(`[ManagerEngine] Cannot create discussion for sector ${sectorId}: balance must be greater than 0. Current balance: ${sectorBalance}`);
        return { created: false, discussion: null };
      }

      // VALIDATION 3: STRICT CONFIDENCE GATE - Check ALL participating agents (non-manager) have confidence >= 65
      // Manager confidence alone is insufficient - only participating agents are checked
      const { loadAgents } = require('../utils/agentStorage');
      const allAgents = await loadAgents();
      
      // Get participating agents (non-manager agents only)
      const participatingAgents = allAgents.filter(a => 
        a && a.id && 
        a.sectorId === sectorId && 
        a.role !== 'manager' && 
        !(a.role || '').toLowerCase().includes('manager')
      );
      
      if (participatingAgents.length > 0) {
        const allAboveThreshold = participatingAgents.every(agent => extractConfidence(agent) >= 65);
        
        if (!allAboveThreshold) {
          const agentDetails = participatingAgents.map(a => `${a.name || a.id}: ${extractConfidence(a)}`).join(', ');
          console.log(`[ManagerEngine] DISCUSSION_SKIPPED - reason: LOW_CONFIDENCE - Not all participating agents meet threshold (>= 65) for sector ${sectorId}. Agents: ${agentDetails}`);
          return { created: false, discussion: null };
        }
      } else {
        // No participating agents found
        console.log(`[ManagerEngine] DISCUSSION_SKIPPED - reason: LOW_CONFIDENCE - No participating agents found for sector ${sectorId}`);
        return { created: false, discussion: null };
      }

      // Get agent IDs from sector (non-manager agents only)
      const sectorAgents = Array.isArray(sector.agents) ? sector.agents.filter(a => a && a.id) : [];
      const nonManagerAgents = sectorAgents.filter(agent => {
        const role = (agent.role || '').toLowerCase();
        return role !== 'manager' && !role.includes('manager');
      });
      const agentIds = nonManagerAgents.map(a => a.id);

      console.log(`[ManagerEngine] Sector ${sectorId} has ${sectorAgents.length} total agents, ${nonManagerAgents.length} non-manager agents`);

      // Safeguard: Require at least 1 non-manager agent for discussion
      // (Changed from 2 to 1 to allow discussions with manager + 1 general)
      if (agentIds.length < 1) {
        console.log(`[ManagerEngine] Cannot create discussion for sector ${sectorId}: requires at least 1 non-manager agent, found ${agentIds.length}`);
        return { created: false, discussion: null };
      }

      // Note: Removed minDiscussionIntervalMs check - unlimited sequential discussions are allowed
      // as long as all previous discussions are DECIDED or CLOSED

      // Create new discussion using DiscussionEngine
      console.log(`[ManagerEngine] Calling discussionEngine.startDiscussion for sector ${sectorId}...`);
      const updatedSector = await this.discussionEngine.startDiscussion(sector);
      console.log(`[ManagerEngine] discussionEngine.startDiscussion completed, discussions array length: ${updatedSector.discussions?.length || 0}`);
      
      // Get the newly created discussion
      const discussions = Array.isArray(updatedSector.discussions) ? updatedSector.discussions : [];
      console.log(`[ManagerEngine] Updated sector discussions array:`, discussions);
      
      if (discussions.length === 0) {
        // Try to find the most recent discussion for this sector as fallback
        const allDiscussions = await loadDiscussions();
        const sectorDiscussions = allDiscussions
          .filter(d => d.sectorId === sectorId)
          .sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt));
        
        if (sectorDiscussions.length > 0) {
          const latestDiscussion = DiscussionRoom.fromData(sectorDiscussions[0]);
          console.log(`[ManagerEngine] Found discussion via fallback: ID = ${latestDiscussion.id}`);
          this.lastDiscussionCreation.set(sectorId, Date.now());
          return { 
            created: true, 
            discussion: latestDiscussion 
          };
        }
        
        throw new Error('Discussion was created but not found in sector or discussions storage');
      }

      const discussionId = discussions[discussions.length - 1];
      console.log(`[ManagerEngine] Looking up discussion ID: ${discussionId}`);
      const discussionData = await findDiscussionById(discussionId);
      
      if (!discussionData) {
        throw new Error(`Discussion ${discussionId} not found in storage`);
      }

      const discussion = DiscussionRoom.fromData(discussionData);
      
      // Update last creation time to prevent discussion storms
      this.lastDiscussionCreation.set(sectorId, Date.now());
      
      console.log(`[ManagerEngine] ✓ Created new discussion: ID = ${discussion.id} for sector ${sectorId}`);
      
      return { 
        created: true, 
        discussion: discussion 
      };
    } catch (error) {
      console.error(`[ManagerEngine] Error creating discussion for sector ${sectorId}:`, error);
      console.error(`[ManagerEngine] Error stack:`, error.stack);
      return { created: false, discussion: null };
    }
  }

  /**
   * Handle checklist after finalization - approve items and mark discussion as finalized
   * @param {Object} discussion - Discussion object (DiscussionRoom instance)
   * @returns {Promise<{handled: boolean, discussionId: string|null}>}
   */
  async handleChecklist(discussion) {
    try {
      if (!discussion || !discussion.id) {
        throw new Error('Invalid discussion: discussion and discussion.id are required');
      }

      // Reload discussion to get latest state
      const discussionData = await findDiscussionById(discussion.id);
      if (!discussionData) {
        throw new Error(`Discussion ${discussion.id} not found`);
      }

      const discussionRoom = DiscussionRoom.fromData(discussionData);

      // If discussion is already decided, skip
      if (discussionRoom.status === 'decided') {
        console.log(`[ManagerEngine] Discussion ${discussion.id} already decided`);
        return { handled: true, discussionId: discussion.id };
      }

      // Load sector to use approveOrRejectChecklist
      const { getSectorById } = require('../utils/sectorStorage');
      const sector = await getSectorById(discussionRoom.sectorId);
      
      if (!sector) {
        throw new Error(`Sector ${discussionRoom.sectorId} not found`);
      }

      // Ensure sector has discussions array
      sector.discussions = Array.isArray(sector.discussions) ? sector.discussions : [];
      if (!sector.discussions.includes(discussion.id)) {
        sector.discussions.push(discussion.id);
      }

      // Approve checklist items (auto-approve all)
      const updatedSector = await this.approveOrRejectChecklist(sector);

      // Reload discussion after approval
      const updatedDiscussionData = await findDiscussionById(discussion.id);
      if (!updatedDiscussionData) {
        throw new Error(`Discussion ${discussion.id} not found after approval`);
      }

      const updatedDiscussionRoom = DiscussionRoom.fromData(updatedDiscussionData);

      // NOTE: Discussion status is NOT automatically changed here.
      // The discussion remains in 'in_progress' until the manager explicitly calls closeDiscussion().
      const finalizedChecklist = Array.isArray(updatedDiscussionRoom.finalizedChecklist) ? updatedDiscussionRoom.finalizedChecklist : [];
      
      // Keep discussion in progress - manager will close when ready
      if (updatedDiscussionRoom.status !== 'CLOSED' && updatedDiscussionRoom.status !== 'closed') {
        updatedDiscussionRoom.status = 'in_progress';
      }
      updatedDiscussionRoom.updatedAt = new Date().toISOString();
      await saveDiscussion(updatedDiscussionRoom);
      
      if (finalizedChecklist.length > 0) {
        console.log(`[ManagerEngine] Handled checklist for discussion: ID = ${discussion.id} with ${finalizedChecklist.length} approved items. Manager should call closeDiscussion() when ready.`);
      } else {
        console.warn(`[ManagerEngine] Discussion ${discussion.id} has no approved checklist items. Manager should evaluate and close when ready.`);
      }

      return { 
        handled: finalizedChecklist.length > 0, 
        discussionId: discussion.id 
      };
    } catch (error) {
      console.error(`[ManagerEngine] Error handling checklist:`, error);
      return { handled: false, discussionId: null };
    }
  }

  /**
   * Increment and get tick counter
   */
  getNextTick() {
    this.tickCounter++;
    return this.tickCounter;
  }

  /**
   * Evaluate checklist items for multi-round discussion
   * Multi-round: Manager evaluates items and marks them with statuses
   * @param {string} discussionId - Discussion ID
   * @param {Array<Object>} itemEvaluations - Array of {itemId, status, reason?}
   *   status: 'APPROVED' | 'REJECTED' | 'PENDING' | 'REVISE_REQUIRED' | 'ACCEPT_REJECTION'
   * @returns {Promise<Object>} Updated discussion
   */
  async evaluateChecklistRound(discussionId, itemEvaluations) {
    if (!discussionId) {
      throw new Error('discussionId is required');
    }

    if (!Array.isArray(itemEvaluations)) {
      throw new Error('itemEvaluations must be an array');
    }

    const discussionData = await findDiscussionById(discussionId);
    if (!discussionData) {
      throw new Error(`Discussion ${discussionId} not found`);
    }

    const discussionRoom = DiscussionRoom.fromData(discussionData);

    // Ensure discussion is in_progress (not decided/closed)
    if (discussionRoom.status === 'decided' || discussionRoom.status === 'CLOSED' || discussionRoom.status === 'closed') {
      throw new Error(`Cannot evaluate checklist: Discussion ${discussionId} is already decided/closed. Current status: ${discussionRoom.status}`);
    }

    // Ensure checklist exists
    if (!Array.isArray(discussionRoom.checklist) || discussionRoom.checklist.length === 0) {
      throw new Error(`Discussion ${discussionId} has no checklist items to evaluate`);
    }

    // Ensure managerDecisions array exists
    if (!Array.isArray(discussionRoom.managerDecisions)) {
      discussionRoom.managerDecisions = [];
    }

    const validStatuses = ['APPROVED', 'REJECTED', 'PENDING', 'REVISE_REQUIRED', 'ACCEPT_REJECTION'];
    const evaluationMap = new Map();
    itemEvaluations.forEach(evaluation => {
      if (!validStatuses.includes(evaluation.status)) {
        throw new Error(`Invalid status: ${evaluation.status}. Must be one of: ${validStatuses.join(', ')}`);
      }
      evaluationMap.set(evaluation.itemId, evaluation);
    });

    // Process each checklist item
    const managerDecisions = [];
    const updatedChecklist = [];

    for (const item of discussionRoom.checklist) {
      const evaluation = evaluationMap.get(item.id);
      
      if (!evaluation) {
        // No evaluation provided for this item - keep existing status or set to PENDING
        const existingDecision = discussionRoom.managerDecisions.find(
          decision => decision.item && decision.item.id === item.id
        );
        if (existingDecision) {
          managerDecisions.push(existingDecision);
          updatedChecklist.push(item);
        } else {
          // New item without evaluation - set to PENDING
          item.status = item.status || 'PENDING';
          updatedChecklist.push(item);
          managerDecisions.push({
            item: item,
            approved: false,
            reason: 'No evaluation provided - set to PENDING'
          });
        }
        continue;
      }

      // Update item status based on evaluation - follow lifecycle: REJECTED -> REVISE_REQUIRED
      const status = evaluation.status;
      
      // Step 1: Set status to evaluation status (could be REJECTED) and add managerReason
      item.status = status;
      item.managerReason = evaluation.reason || `Manager evaluation: ${status}`;

      // Step 2: If rejected, immediately convert to REVISE_REQUIRED
      if (status === 'REJECTED') {
        item.status = 'REVISE_REQUIRED';
        item.requiresRevision = true;
        if (!item.revisionCount) {
          item.revisionCount = 0;
        }
        // Don't increment revisionCount here - it will be incremented when worker revises
      }

      // Determine approved flag for manager decision
      const approved = status === 'APPROVED' || status === 'ACCEPT_REJECTION';

      // Create manager decision
      const managerDecision = {
        item: { ...item },
        approved: approved,
        status: item.status,
        reason: evaluation.reason || `Manager evaluation: ${status}`
      };

      managerDecisions.push(managerDecision);
      updatedChecklist.push(item);
    }

    // Update discussion with manager decisions and updated checklist
    discussionRoom.managerDecisions = managerDecisions;
    discussionRoom.checklist = updatedChecklist;

    // Extract approved items for finalizedChecklist
    const approvedItems = managerDecisions
      .filter(decision => (decision.approved === true || decision.status === 'APPROVED') && decision.item)
      .map(decision => {
        const item = decision.item;
        return {
          id: item.id,
          action: item.action,
          amount: item.amount,
          reason: item.reason || item.reasoning || '',
          confidence: item.confidence,
          round: item.round || discussionRoom.currentRound,
          agentId: item.agentId,
          agentName: item.agentName,
          approved: true,
          approvedAt: new Date().toISOString()
        };
      });

    // Update finalizedChecklist (append approved items, don't replace)
    if (!Array.isArray(discussionRoom.finalizedChecklist)) {
      discussionRoom.finalizedChecklist = [];
    }
    discussionRoom.finalizedChecklist = [...discussionRoom.finalizedChecklist, ...approvedItems];

    // Save updated discussion
    await saveDiscussion(discussionRoom);
    
    // Discussion must stay IN_PROGRESS (don't change status to DECIDED yet)
    const currentStatus = (discussionRoom.status || '').toUpperCase();
    if (currentStatus !== 'DECIDED' && currentStatus !== 'CLOSED') {
      await transitionStatus(discussionId, STATUS.IN_PROGRESS, 'Manager evaluation in progress');
    }

    // Trigger worker responses for all REVISE_REQUIRED items
    const discussionEngine = new DiscussionEngine();
    
    const reviseRequiredItems = updatedChecklist.filter(item => 
      item.status === 'REVISE_REQUIRED' || item.requiresRevision === true
    );
    
    // Process worker responses for each rejected item
    for (const item of reviseRequiredItems) {
      try {
        await discussionEngine.workerRespondToRejection(discussionId, item.id);
      } catch (error) {
        console.error(`[ManagerEngine] Error processing worker response for item ${item.id}:`, error);
        // Continue processing other items even if one fails
      }
    }

    // Reload discussion after worker responses to get updated state
    const updatedDiscussionData = await findDiscussionById(discussionId);
    if (updatedDiscussionData) {
      discussionRoom = DiscussionRoom.fromData(updatedDiscussionData);
    }

    // Check if discussion can be closed after this evaluation
    if (this.canDiscussionClose(discussionRoom)) {
      console.log(`[ManagerEngine] Discussion ${discussionId} is ready to close after evaluation. All items resolved. Auto-closing...`);
      
      // Save final round snapshot to roundHistory
      const roundCount = discussionRoom.currentRound || discussionRoom.round || 1;
      if (!Array.isArray(discussionRoom.roundHistory)) {
        discussionRoom.roundHistory = [];
      }
      
      const finalRoundSnapshot = {
        round: roundCount,
        checklist: JSON.parse(JSON.stringify(discussionRoom.checklist || [])),
        finalizedChecklist: JSON.parse(JSON.stringify(discussionRoom.finalizedChecklist || [])),
        managerDecisions: JSON.parse(JSON.stringify(discussionRoom.managerDecisions || [])),
        messages: JSON.parse(JSON.stringify(discussionRoom.messages || [])),
        timestamp: new Date().toISOString()
      };
      
      discussionRoom.roundHistory.push(finalRoundSnapshot);
      
      // Set discussionClosedAt timestamp
      discussionRoom.discussionClosedAt = new Date().toISOString();
      
      await saveDiscussion(discussionRoom);
      
      console.log(`[ManagerEngine] Discussion ${discussionId} auto-closed and marked as 'decided' after ${roundCount} rounds.`);
      // Do not advance to next round if discussion can close
      return discussionRoom;
    }

    // Check if we've reached max rounds - if so, force resolve all pending items
    const currentRound = discussionRoom.currentRound || discussionRoom.round || 1;
    if (currentRound >= this.MAX_ROUNDS) {
      console.log(`[ManagerEngine] Discussion ${discussionId} reached max rounds (${this.MAX_ROUNDS}). Force resolving all pending items...`);
      await this.forceResolvePendingItems(discussionId);
      
      // Reload discussion after force resolution
      const reloadedData = await findDiscussionById(discussionId);
      if (reloadedData) {
        discussionRoom = DiscussionRoom.fromData(reloadedData);
        
        // Check if discussion can now close
        if (this.canDiscussionClose(discussionRoom)) {
          console.log(`[ManagerEngine] Discussion ${discussionId} can now close after force resolution. Auto-closing...`);
          discussionRoom.status = 'decided';
          discussionRoom.updatedAt = new Date().toISOString();
          
          // Save final round snapshot
          const roundCount = discussionRoom.currentRound || discussionRoom.round || 1;
          if (!Array.isArray(discussionRoom.roundHistory)) {
            discussionRoom.roundHistory = [];
          }
          
          const finalRoundSnapshot = {
            round: roundCount,
            checklist: JSON.parse(JSON.stringify(discussionRoom.checklist || [])),
            finalizedChecklist: JSON.parse(JSON.stringify(discussionRoom.finalizedChecklist || [])),
            managerDecisions: JSON.parse(JSON.stringify(discussionRoom.managerDecisions || [])),
            messages: JSON.parse(JSON.stringify(discussionRoom.messages || [])),
            timestamp: new Date().toISOString()
          };
          
          discussionRoom.roundHistory.push(finalRoundSnapshot);
          await saveDiscussion(discussionRoom);
          
          // Transition to DECIDED status
          await transitionStatus(discussionId, STATUS.DECIDED, `Auto-closed after max rounds (${this.MAX_ROUNDS})`);
          
          console.log(`[ManagerEngine] Discussion ${discussionId} auto-closed after max rounds (${this.MAX_ROUNDS}).`);
          return discussionRoom;
        }
      }
      
      // If discussion still can't close, don't advance to next round
      console.warn(`[ManagerEngine] Discussion ${discussionId} reached max rounds but cannot close. Items may need manual resolution.`);
      return discussionRoom;
    }

    // Advance to next round only if discussion cannot close yet and hasn't reached max rounds
    // (increments currentRound, saves snapshot to roundHistory)
    const advancedDiscussion = await discussionEngine.advanceDiscussionRound(discussionId);

    return advancedDiscussion;
  }

  /**
   * Handle checklist approval/rejection after DiscussionEngine finalizes checklist
   * @param {Object|string} discussion - Discussion object or discussion ID
   * @returns {Promise<Object>} Updated discussion with manager decisions
   */
  async handleChecklist(discussion) {
    // Load discussion if ID is provided
    let discussionRoom;
    if (typeof discussion === 'string') {
      const discussionData = await findDiscussionById(discussion);
      if (!discussionData) {
        throw new Error(`Discussion ${discussion} not found`);
      }
      discussionRoom = DiscussionRoom.fromData(discussionData);
    } else if (discussion instanceof DiscussionRoom) {
      discussionRoom = discussion;
    } else {
      // Assume it's a plain object
      discussionRoom = DiscussionRoom.fromData(discussion);
    }

    // Ensure checklist exists
    if (!Array.isArray(discussionRoom.checklist) || discussionRoom.checklist.length === 0) {
      console.warn(`[ManagerEngine] Discussion ${discussionRoom.id} has no checklist items to process`);
      return discussionRoom;
    }

    // Ensure managerDecisions array exists
    if (!Array.isArray(discussionRoom.managerDecisions)) {
      discussionRoom.managerDecisions = [];
    }

    // Get confidence value - use discussion confidence if available, otherwise calculate average from agents
    let confidence = discussionRoom.confidence;
    if (confidence === null || confidence === undefined) {
      // Calculate average confidence from agents in the discussion
      const allAgents = await loadAgents();
      const discussionAgents = allAgents.filter(agent => 
        agent && agent.id && discussionRoom.agentIds.includes(agent.id)
      );
      
      if (discussionAgents.length > 0) {
        const totalConfidence = discussionAgents.reduce((sum, agent) => {
          const agentConfidence = typeof agent.confidence === 'number' ? agent.confidence : 0;
          return sum + agentConfidence;
        }, 0);
        confidence = totalConfidence / discussionAgents.length;
      } else {
        confidence = 0; // Default to 0 if no agents found
      }
    }

    // Process each checklist item
    const managerDecisions = [];
    for (const item of discussionRoom.checklist) {
      // Check if this item already has a manager decision
      const existingDecision = discussionRoom.managerDecisions.find(
        decision => decision.item && decision.item.id === item.id
      );

      if (existingDecision) {
        // Skip items that already have decisions
        managerDecisions.push(existingDecision);
        continue;
      }

      // Determine approval based on confidence threshold
      // For BUY actions, be more lenient if there's available balance
      const isBuyAction = item.action && item.action.toUpperCase().includes('BUY');
      const sector = await getSectorById(discussionRoom.sectorId);
      const hasBalance = sector && typeof sector.balance === 'number' && sector.balance > 0;
      
      // Lower threshold for BUY actions when balance is available to encourage trading
      const effectiveThreshold = (isBuyAction && hasBalance) 
        ? Math.max(0, this.approvalConfidenceThreshold - 10) // 10 points lower for BUY with balance
        : this.approvalConfidenceThreshold;
      
      const approved = confidence > effectiveThreshold;
      const reason = approved 
        ? `Auto-approved: confidence (${confidence.toFixed(2)}) exceeds threshold (${effectiveThreshold.toFixed(2)})`
        : `Auto-rejected: confidence (${confidence.toFixed(2)}) below threshold (${effectiveThreshold.toFixed(2)}). Needs refinement.`;

      // If rejected, update the item with revision metadata
      if (!approved) {
        // Initialize revision metadata if not present
        if (!item.revisionCount) {
          item.revisionCount = 0;
        }
        if (!item.previousVersions) {
          item.previousVersions = [];
        }
        
        // Store current version in previousVersions before marking for revision
        item.previousVersions.push({
          action: item.action,
          amount: item.amount,
          reason: item.reason || item.reasoning || '',
          confidence: item.confidence,
          timestamp: new Date().toISOString()
        });
        
        // Set revision status and metadata
        item.status = 'REVISE_REQUIRED';
        item.managerReason = reason;
        item.requiresRevision = true;
      } else {
        // Approved items should have status 'PENDING' or 'APPROVED'
        if (!item.status || item.status === 'REVISE_REQUIRED') {
          item.status = 'PENDING';
        }
        item.requiresRevision = false;
      }

      // Create manager decision object
      const managerDecision = {
        item: item,
        approved: approved,
        reason: reason
      };

      managerDecisions.push(managerDecision);
    }

    // Update discussion with manager decisions
    discussionRoom.managerDecisions = managerDecisions;
    
    // Update checklist items with their new status and revision metadata
    discussionRoom.checklist = discussionRoom.checklist.map(item => {
      const decision = managerDecisions.find(d => d.item && d.item.id === item.id);
      if (decision) {
        // Merge the updated item from the decision back into the checklist
        return decision.item;
      }
      return item;
    });
    
    // Extract approved items and store in finalizedChecklist
    const approvedItems = managerDecisions
      .filter(decision => decision.approved === true && decision.item)
      .map(decision => {
        const item = decision.item;
        // Mark item as APPROVED in the discussion
        item.status = 'APPROVED';
        return {
          id: item.id || `finalized-${discussionRoom.id}-${Date.now()}`,
          action: item.action,
          amount: item.amount,
          reason: item.reason || item.reasoning || '',
          confidence: item.confidence,
          round: item.round,
          agentId: item.agentId,
          agentName: item.agentName,
          approved: true,
          approvedAt: new Date().toISOString()
        };
      });
    
    discussionRoom.finalizedChecklist = approvedItems;

    // Add approved items to manager's execution list (instead of executing immediately)
    if (approvedItems.length > 0) {
      try {
        // Get manager for this sector
        const manager = await getManagerBySectorId(discussionRoom.sectorId);
        if (!manager) {
          console.warn(`[ManagerEngine] No manager found for sector ${discussionRoom.sectorId}. Cannot add items to execution list.`);
        } else {
          // Get sector to extract symbol
          const sector = await getSectorById(discussionRoom.sectorId);
          const symbol = sector?.symbol || sector?.sectorSymbol || 'UNKNOWN';

          // Add each approved item to the manager's execution list
          for (const item of approvedItems) {
            try {
              // Extract action type from item.action (convert to uppercase)
              let actionType = 'HOLD'; // Default
              if (item.action) {
                const actionUpper = item.action.toUpperCase();
                if (['BUY', 'SELL', 'HOLD', 'REBALANCE'].includes(actionUpper)) {
                  actionType = actionUpper;
                } else if (actionUpper.includes('BUY') || actionUpper.includes('DEPLOY')) {
                  actionType = 'BUY';
                } else if (actionUpper.includes('SELL') || actionUpper.includes('WITHDRAW')) {
                  actionType = 'SELL';
                } else if (actionUpper.includes('REBALANCE') || actionUpper.includes('ALLOCATE')) {
                  actionType = 'REBALANCE';
                }
              }

              // Extract allocation amount
              const allocation = typeof item.amount === 'number' && item.amount > 0 
                ? item.amount 
                : (item.confidence ? Math.floor(1000 * item.confidence) : 1000);

              // Add to execution list
              await managerAddToExecutionList(manager.id, {
                actionType,
                symbol,
                allocation,
                generatedFromDiscussion: discussionRoom.id
              });

              await this._appendDecisionLogEntry({
                id: `decision-${discussionRoom.id}-${item.id || actionType}-${Date.now()}`,
                sectorId: discussionRoom.sectorId,
                checklistId: discussionRoom.id,
                timestamp: Date.now(),
                managerId: manager.id,
                results: [{
                  itemId: item.id || `${discussionRoom.id}-${actionType}`,
                  action: actionType,
                  actionType,
                  amount: allocation,
                  allocation,
                  symbol,
                  success: true,
                  reason: item.managerReason || item.reason || null,
                  impact: null,
                  managerImpact: null
                }]
              });
            } catch (error) {
              console.error(`[ManagerEngine] Error adding item ${item.id} to execution list:`, error);
              // Continue with other items even if one fails
            }
          }
        }
      } catch (error) {
        console.error(`[ManagerEngine] Error adding approved items to execution list:`, error);
        // Don't throw - continue with discussion processing even if execution list update fails
      }
    }
    
    // Extract rejected items and store them globally
    const rejectedDecisions = managerDecisions.filter(decision => decision.approved === false && decision.item);
    if (rejectedDecisions.length > 0) {
      try {
        // Get sector info for rejected items
        const sectors = await getAllSectors();
        const sector = sectors.find(s => s.id === discussionRoom.sectorId);
        const sectorSymbol = sector?.symbol || sector?.sectorSymbol || 'N/A';
        
        // Create rejected items with required metadata
        const rejectedItems = rejectedDecisions.map(decision => {
          const item = decision.item;
          const itemText = item.reason || item.reasoning || item.text || item.description || '';
          
          return {
            id: `rejected-${discussionRoom.id}-${item.id || Date.now()}`,
            text: itemText,
            discussionId: discussionRoom.id,
            discussionTitle: discussionRoom.title || 'Untitled Discussion',
            sectorId: discussionRoom.sectorId,
            sectorSymbol: sectorSymbol,
            timestamp: Date.now()
          };
        });
        
        // Save rejected items to global storage
        await saveRejectedItems(rejectedItems);
        console.log(`[ManagerEngine] Stored ${rejectedItems.length} rejected items to global storage`);
      } catch (error) {
        console.error(`[ManagerEngine] Error storing rejected items:`, error);
        // Don't throw - continue with discussion processing even if rejected items storage fails
      }
    }
    
    // NOTE: Discussion status is NOT automatically changed here.
    // The discussion remains in 'in_progress' (or 'OPEN') until the manager explicitly
    // calls closeDiscussion() after evaluating that all items are resolved.
    // 
    // Discussion closure conditions (checked in closeDiscussion):
    // 1. No items in 'PENDING' or 'REVISE_REQUIRED'
    // 2. All items are either 'APPROVED' or 'ACCEPT_REJECTION'
    
    const allItems = discussionRoom.checklist || [];
    const hasRevisionsRequired = allItems.some(item => 
      item.status === 'REVISE_REQUIRED' || item.requiresRevision === true
    );
    const hasPendingItems = allItems.some(item => 
      item.status === 'PENDING' || (!item.status && !item.requiresRevision)
    );
    const rejectedCount = managerDecisions.filter(d => !d.approved).length;
    
    // Save discussion first
    await saveDiscussion(discussionRoom);
    
    // Keep discussion in progress - manager will close when ready
    const currentStatus = (discussionRoom.status || '').toUpperCase();
    if (currentStatus !== 'CLOSED') {
      await transitionStatus(discussionRoom.id, STATUS.IN_PROGRESS, 'Manager processing items');
    }
    
    // Log current state for manager evaluation
    console.log(`[ManagerEngine] Processed ${managerDecisions.length} checklist items for discussion ${discussionRoom.id}. Approved: ${approvedItems.length}, Rejected: ${rejectedCount}`);
    if (hasRevisionsRequired) {
      console.log(`[ManagerEngine] Discussion ${discussionRoom.id} remains in progress: Items require revision.`);
    } else if (hasPendingItems) {
      console.log(`[ManagerEngine] Discussion ${discussionRoom.id} remains in progress: Items still pending.`);
    } else if (rejectedCount > 0 && approvedItems.length === 0) {
      console.log(`[ManagerEngine] Discussion ${discussionRoom.id} remains in progress: All items rejected. No approved items for execution.`);
    } else {
      console.log(`[ManagerEngine] Discussion ${discussionRoom.id} ready for manager evaluation. Manager should call closeDiscussion() when ready.`);
    }
    
    discussionRoom.updatedAt = new Date().toISOString();

    // Save updated discussion
    await saveDiscussion(discussionRoom);

    // Check if discussion can be closed after handling checklist
    // Reload discussion to get latest state after save
    const reloadedData = await findDiscussionById(discussionRoom.id);
    if (reloadedData) {
      const reloadedRoom = DiscussionRoom.fromData(reloadedData);
      if (this.canDiscussionClose(reloadedRoom)) {
        console.log(`[ManagerEngine] Discussion ${discussionRoom.id} is ready to close after handleChecklist. All items resolved. Auto-closing...`);
        return await this.closeDiscussion(discussionRoom.id);
      }
    }

    return discussionRoom;
  }

  /**
   * Start discussion if confidence >= threshold and no active discussion exists
   * STRICT THRESHOLD: ALL agents (manager + generals) must have confidence >= 65
   * Manager confidence = average(confidence of all agents) AND >= 65
   * @param {Object} sector - Sector object with agents
   * @returns {Promise<Object|null>} Updated sector with new discussion, or null if not started
   */
  async startDiscussionIfReady(sector) {
    if (!sector || !sector.id) {
      throw new Error('Invalid sector: sector and sector.id are required');
    }

    // Get all agents for the sector (manager + generals)
    const agents = Array.isArray(sector.agents) ? sector.agents.filter(a => a && a.id) : [];
    if (agents.length === 0) {
      console.log(`[DISCUSSION BLOCKED] No agents found in sector ${sector.id}`);
      return null;
    }

    // Check ALL agents (manager + generals) have confidence >= 65
    const allAboveThreshold = agents.every(agent => extractConfidence(agent) >= 65);

    if (!allAboveThreshold) {
      console.log(`[DISCUSSION BLOCKED] Not all agents meet threshold (>= 65)`);
      console.log(`[DISCUSSION CHECK]`, {
        sectorId: sector.id,
        agentConfidences: agents.map(a => `${a.name || a.id}: ${extractConfidence(a)}`),
        allAboveThreshold: false
      });
      return null;
    }

    // Calculate manager confidence as average of ALL agents
    const totalConfidence = agents.reduce((sum, agent) => sum + extractConfidence(agent), 0);
    const managerConfidence = totalConfidence / agents.length;

    // Check manager confidence >= 65
    if (managerConfidence < 65) {
      console.log(`[DISCUSSION BLOCKED] Manager confidence (${managerConfidence.toFixed(2)}) < 65`);
      console.log(`[DISCUSSION CHECK]`, {
        sectorId: sector.id,
        agentConfidences: agents.map(a => `${a.name || a.id}: ${extractConfidence(a)}`),
        allAboveThreshold: true,
        managerConfidence: managerConfidence.toFixed(2)
      });
      return null;
    }

    // Check if there are any non-closed discussions for this sector
    const { hasNonClosedDiscussions } = require('../utils/discussionStorage');
    const hasActive = await hasNonClosedDiscussions(sector.id);
    
    if (hasActive) {
      // Find the active discussion for logging
      const existingDiscussions = await loadDiscussions();
      const activeDiscussion = existingDiscussions.find(d => {
        if (d.sectorId !== sector.id) return false;
        const status = (d.status || '').toUpperCase();
        const closedStatuses = ['DECIDED', 'CLOSED', 'FINALIZED', 'ARCHIVED', 'ACCEPTED', 'COMPLETED'];
        return !closedStatuses.includes(status);
      });
      
      if (activeDiscussion) {
        console.log(`[DISCUSSION BLOCKED] Non-closed discussion exists: ${activeDiscussion.id} (status: ${activeDiscussion.status})`);
        return null;
      }
    }

      // Safeguard: Check for at least 1 non-manager agent before creating discussion
      const nonManagerAgents = agents.filter(agent => {
        const role = (agent.role || '').toLowerCase();
        return role !== 'manager' && !role.includes('manager');
      });
      
      if (nonManagerAgents.length < 1) {
        console.log(`[DISCUSSION BLOCKED] Requires at least 1 non-manager agent, found ${nonManagerAgents.length}`);
        return null;
      }

    // All checks passed - log and start discussion
    console.log(`[DISCUSSION CHECK]`, {
      sectorId: sector.id,
      agentConfidences: agents.map(a => `${a.name || a.id}: ${extractConfidence(a)}`),
      allAboveThreshold: true
    });

    // Start new discussion
    const updatedSector = await this.discussionEngine.startDiscussion(sector);
    return updatedSector;
  }

  /**
   * Approve checklist items and execute them
   * @param {Object} sector - Sector object
   * @returns {Promise<Object>} Updated sector with approved items executed
   */
  async approveChecklist(sector) {
    if (!sector || !sector.id) {
      throw new Error('Invalid sector: sector and sector.id are required');
    }

    // Find the active discussion for this sector
    const discussions = Array.isArray(sector.discussions) ? sector.discussions : [];
    if (discussions.length === 0) {
      throw new Error(`No discussion found for sector ${sector.id}`);
    }

    // Get the most recent discussion
    const discussionId = discussions[discussions.length - 1];
    const discussionData = await findDiscussionById(discussionId);

    if (!discussionData) {
      throw new Error(`Discussion ${discussionId} not found`);
    }

    // Load discussion room
    const discussionRoom = DiscussionRoom.fromData(discussionData);
    
    // Prevent duplicate executions - if already decided, skip
    if (discussionRoom.status === 'decided') {
      console.log(`[ManagerEngine] Discussion ${discussionId} already decided. Skipping execution.`);
      const updatedSector = await updateSector(sector.id, {
        discussions: discussions
      });
      updatedSector.discussions = discussions;
      return updatedSector;
    }
    
    // Ensure checklistDraft exists
    if (!Array.isArray(discussionRoom.checklistDraft)) {
      discussionRoom.checklistDraft = [];
    }
    
    // Validate: Must have checklist items to approve
    if (discussionRoom.checklistDraft.length === 0) {
      console.warn(`[ManagerEngine] Discussion ${discussionId} has no checklist items to approve`);
      // Don't finalize discussion without checklist items
      return sector;
    }

    // Check manager confidence and agent thresholds before approving
    // Manager must refuse to approve checklist items if:
    // - Manager confidence < 65
    // - OR not all agents meet confidence threshold (>= 65)
    const allAgents = await loadAgents();
    const manager = await getManagerBySectorId(sector.id);
    
    if (!manager) {
      console.warn(`[ManagerEngine] No manager found for sector ${sector.id}. Cannot approve checklist items.`);
      // Reject all items
      for (const item of discussionRoom.checklistDraft) {
        if (item.status !== 'approved' && item.status !== 'rejected') {
          item.status = 'rejected';
          item.managerReason = 'Manager not found - cannot approve checklist items';
        }
      }
      await saveDiscussion(discussionRoom);
      return sector;
    }

    // Calculate manager confidence as weighted average of agent confidence
    const managerConfidence = this.confidenceEngine.updateManagerConfidence(manager, allAgents);
    
    // Check if manager confidence meets threshold
    if (managerConfidence < 65) {
      console.log(`[ManagerEngine] Manager confidence (${managerConfidence.toFixed(2)}) below threshold (65). Refusing to approve checklist items.`);
      // Reject all items
      for (const item of discussionRoom.checklistDraft) {
        if (item.status !== 'approved' && item.status !== 'rejected') {
          item.status = 'rejected';
          item.managerReason = `Manager confidence (${managerConfidence.toFixed(2)}) below threshold (65). Cannot approve checklist items.`;
          
          // Update agent confidence after rejection
          try {
            const agentId = item.sourceAgentId || item.agentId;
            if (agentId) {
              const agent = allAgents.find(a => a && a.id === agentId);
              if (agent) {
                const newConfidence = this.confidenceEngine.updateConfidenceAfterRejected(agent, item);
                try {
                  await updateAgent(agent.id, { confidence: newConfidence });
                  agent.confidence = newConfidence;
                } catch (updateError) {
                  console.warn(`[ManagerEngine] Failed to persist confidence update for agent ${agent.id}:`, updateError);
                }
              }
            }
          } catch (confidenceError) {
            console.warn(`[ManagerEngine] Error updating agent confidence after rejection:`, confidenceError);
          }
        }
      }
      await saveDiscussion(discussionRoom);
      return sector;
    }

    // Check if all agents meet confidence threshold (>= 65)
    const sectorAgents = allAgents.filter(agent => 
      agent && agent.id && agent.sectorId === sector.id
    );
    
    const agentsBelowThreshold = sectorAgents.filter(agent => {
      const confidence = extractConfidence(agent);
      return confidence < 65;
    });

    if (agentsBelowThreshold.length > 0) {
      const agentDetails = agentsBelowThreshold.map(agent => {
        const confidence = extractConfidence(agent);
        return `${agent.name || agent.id}: ${confidence.toFixed(2)}`;
      }).join(', ');
      
      console.log(`[ManagerEngine] Not all agents meet confidence threshold (>= 65). Refusing to approve checklist items. Agents below threshold: ${agentDetails}`);
      
      // Reject all items
      for (const item of discussionRoom.checklistDraft) {
        if (item.status !== 'approved' && item.status !== 'rejected') {
          item.status = 'rejected';
          item.managerReason = `Not all agents meet confidence threshold (>= 65). Agents below threshold: ${agentDetails}`;
          
          // Update agent confidence after rejection
          try {
            const agentId = item.sourceAgentId || item.agentId;
            if (agentId) {
              const agent = allAgents.find(a => a && a.id === agentId);
              if (agent) {
                const newConfidence = this.confidenceEngine.updateConfidenceAfterRejected(agent, item);
                try {
                  await updateAgent(agent.id, { confidence: newConfidence });
                  agent.confidence = newConfidence;
                } catch (updateError) {
                  console.warn(`[ManagerEngine] Failed to persist confidence update for agent ${agent.id}:`, updateError);
                }
              }
            }
          } catch (confidenceError) {
            console.warn(`[ManagerEngine] Error updating agent confidence after rejection:`, confidenceError);
          }
        }
      }
      await saveDiscussion(discussionRoom);
      return sector;
    }

    // All checks passed - proceed with approval
    console.log(`[ManagerEngine] Manager confidence (${managerConfidence.toFixed(2)}) and all agents meet thresholds. Proceeding with checklist approval.`);

    // Mark all items as approved
    const approvedItems = [];
    for (const item of discussionRoom.checklistDraft) {
      // Skip items that have already been processed
      if (item.status === 'approved' || item.status === 'rejected') {
        if (item.status === 'approved') {
          approvedItems.push(item);
        }
        continue;
      }

      // Ensure item has required fields for compatibility
      if (!item.text && item.reasoning) {
        item.text = `${item.action || 'deploy capital'}: ${item.reasoning}`;
      } else if (!item.text && item.action) {
        item.text = item.action;
      }
      
      item.status = 'approved';
      approvedItems.push(item);
    }

    // Update checklistDraft with approved status
    discussionRoom.checklistDraft = discussionRoom.checklistDraft.map(item => {
      const updated = approvedItems.find(a => a.id === item.id);
      return updated || item;
    });

    // Mark approved items as APPROVED in the discussion
    for (const item of approvedItems) {
      const draftItem = discussionRoom.checklistDraft.find(d => d.id === item.id);
      if (draftItem) {
        draftItem.status = 'APPROVED';
      }
    }

    // Save discussion with approved items
    await saveDiscussion(discussionRoom);

    // Add approved items to manager's execution list (instead of executing immediately)
    if (approvedItems.length > 0) {
      try {
        // Get manager for this sector
        const manager = await getManagerBySectorId(sector.id);
        if (!manager) {
          console.warn(`[ManagerEngine] No manager found for sector ${sector.id}. Cannot add items to execution list.`);
        } else {
          // Get sector symbol
          const symbol = sector.symbol || sector.sectorSymbol || 'UNKNOWN';

          // Add each approved item to the manager's execution list
          for (const item of approvedItems) {
            try {
              // Extract action type from item.action or item.text
              let actionType = 'HOLD'; // Default
              const actionText = (item.action || item.text || '').toUpperCase();
              if (['BUY', 'SELL', 'HOLD', 'REBALANCE'].includes(actionText)) {
                actionType = actionText;
              } else if (actionText.includes('BUY') || actionText.includes('DEPLOY')) {
                actionType = 'BUY';
              } else if (actionText.includes('SELL') || actionText.includes('WITHDRAW')) {
                actionType = 'SELL';
              } else if (actionText.includes('REBALANCE') || actionText.includes('ALLOCATE')) {
                actionType = 'REBALANCE';
              }

              // Extract allocation amount
              const allocation = typeof item.amount === 'number' && item.amount > 0 
                ? item.amount 
                : (item.confidence ? Math.floor(1000 * item.confidence) : 1000);

              // Add to execution list
              await managerAddToExecutionList(manager.id, {
                actionType,
                symbol,
                allocation,
                generatedFromDiscussion: discussionId
              });

              await this._appendDecisionLogEntry({
                id: `decision-${discussionId}-${item.id || actionType}-${Date.now()}`,
                sectorId: sector.id,
                checklistId: discussionId,
                timestamp: Date.now(),
                managerId: manager.id,
                results: [{
                  itemId: item.id || `${discussionId}-${actionType}`,
                  action: actionType,
                  actionType,
                  amount: allocation,
                  allocation,
                  symbol,
                  success: true,
                  reason: item.managerReason || item.reason || null,
                  impact: null,
                  managerImpact: null
                }]
              });
            } catch (error) {
              console.error(`[ManagerEngine] Error adding item ${item.id} to execution list:`, error);
              // Continue with other items even if one fails
            }
          }
        }
      } catch (error) {
        console.error(`[ManagerEngine] Error adding approved items to execution list:`, error);
        // Don't throw - continue with discussion processing even if execution list update fails
      }
    }

    // Save discussion first
    await saveDiscussion(discussionRoom);
    
    // NOTE: Discussion status is NOT automatically changed here.
    // The discussion remains in 'IN_PROGRESS' until the manager explicitly calls closeDiscussion().
    if (approvedItems.length > 0) {
      const currentStatus = (discussionRoom.status || '').toUpperCase();
      if (currentStatus !== 'CLOSED') {
        await transitionStatus(discussionRoom.id, STATUS.IN_PROGRESS, 'Items added to execution backlog');
      }
      console.log(`[ManagerEngine] Added ${approvedItems.length} approved items to execution backlog for sector ${sector.id}. Manager should call closeDiscussion() when ready.`);
    }

    // Update sector
    const updatedSector = await updateSector(sector.id, {
      discussions: discussions
    });
    updatedSector.discussions = discussions;

    return updatedSector;
  }

  /**
   * Reject checklist items and send them back to DiscussionEngine for refinement
   * @param {Object} sector - Sector object
   * @returns {Promise<Object>} Updated sector with rejected items sent for refinement
   */
  async rejectChecklist(sector) {
    if (!sector || !sector.id) {
      throw new Error('Invalid sector: sector and sector.id are required');
    }

    // Find the active discussion for this sector
    const discussions = Array.isArray(sector.discussions) ? sector.discussions : [];
    if (discussions.length === 0) {
      throw new Error(`No discussion found for sector ${sector.id}`);
    }

    // Get the most recent discussion
    const discussionId = discussions[discussions.length - 1];
    const discussionData = await findDiscussionById(discussionId);

    if (!discussionData) {
      throw new Error(`Discussion ${discussionId} not found`);
    }

    // Load discussion room
    const discussionRoom = DiscussionRoom.fromData(discussionData);
    
    // Ensure checklistDraft exists
    if (!Array.isArray(discussionRoom.checklistDraft)) {
      discussionRoom.checklistDraft = [];
    }

    // Initialize needsRefinement array if it doesn't exist
    if (!Array.isArray(discussionRoom.needsRefinement)) {
      discussionRoom.needsRefinement = [];
    }

    // Mark all items as rejected and move to needsRefinement
    const rejectedItems = [];
    for (const item of discussionRoom.checklistDraft) {
      // Skip items that have already been processed
      if (item.status === 'approved' || item.status === 'rejected') {
        if (item.status === 'rejected') {
          rejectedItems.push(item);
        }
        continue;
      }

      item.status = 'rejected';
      rejectedItems.push(item);
    }

    // Move rejected items to needsRefinement
    discussionRoom.needsRefinement = [
      ...discussionRoom.needsRefinement,
      ...rejectedItems
    ];

    // Update checklistDraft with rejected status
    discussionRoom.checklistDraft = discussionRoom.checklistDraft.map(item => {
      const updated = rejectedItems.find(r => r.id === item.id);
      return updated || item;
    });

    // Save discussion with rejected items
    await saveDiscussion(discussionRoom);

    // Send items back to DiscussionEngine for refinement
    // Load agents for this sector
    const allAgents = await loadAgents();
    const sectorAgents = allAgents.filter(agent => 
      agent && agent.sectorId === sector.id && agent.role !== 'manager'
    );

    if (sectorAgents.length > 0) {
      // Run a round of discussion to refine rejected items
      const updatedSector = await this.discussionEngine.runRound(sector, sectorAgents);
      return updatedSector;
    }

    // Update sector
    const updatedSector = await updateSector(sector.id, {
      discussions: discussions
    });
    updatedSector.discussions = discussions;

    return updatedSector;
  }

  /**
   * Approve or reject checklist items - auto-approves all items for now
   * Delegates to approveChecklist() for backward compatibility
   * @param {Object} sector - Sector object
   * @returns {Promise<Object>} Updated sector with approved/rejected items
   */
  async approveOrRejectChecklist(sector) {
    const useLlm = (process.env.USE_LLM || '').toLowerCase() === 'true';

    // Fallback to legacy auto-approve when LLM is disabled
    if (!useLlm) {
      return await this.approveChecklist(sector);
    }

    if (!sector || !sector.id) {
      throw new Error('Invalid sector: sector and sector.id are required');
    }

    const discussions = Array.isArray(sector.discussions) ? sector.discussions : [];
    if (discussions.length === 0) {
      throw new Error(`No discussion found for sector ${sector.id}`);
    }

    const discussionId = discussions[discussions.length - 1];
    const discussionData = await findDiscussionById(discussionId);

    if (!discussionData) {
      throw new Error(`Discussion ${discussionId} not found`);
    }

    const discussionRoom = DiscussionRoom.fromData(discussionData);

    // Ensure checklistDraft exists
    const checklistDraft = Array.isArray(discussionRoom.checklistDraft) ? discussionRoom.checklistDraft : [];
    if (checklistDraft.length === 0) {
      console.warn(`[ManagerEngine] Discussion ${discussionId} has no checklist items to evaluate`);
      return sector;
    }

    const manager = await getManagerBySectorId(sector.id);
    if (!manager) {
      throw new Error(`Manager agent not found for sector ${sector.id}`);
    }

    const riskToleranceRaw = (manager.personality?.riskTolerance || 'medium').toString().toLowerCase();
    const riskTolerance = ['low', 'medium', 'high'].includes(riskToleranceRaw) ? riskToleranceRaw : 'medium';

    const managerProfile = {
      name: manager.name || manager.id || 'manager',
      sectorGoal: manager.prompt || sector.description || '',
      riskTolerance
    };

    const sectorTypeRaw = (
      sector.sectorType ||
      sector.type ||
      sector.category ||
      sector.assetClass ||
      ''
    ).toString().toLowerCase();
    const sectorType = ['crypto', 'equities', 'forex', 'commodities'].includes(sectorTypeRaw)
      ? sectorTypeRaw
      : 'other';

    const sectorState = {
      sectorName: sector.sectorName || sector.name || sector.symbol || sector.id,
      sectorType,
      simulatedPrice: typeof sector.currentPrice === 'number' ? sector.currentPrice : 100,
      baselinePrice: typeof sector.baselinePrice === 'number'
        ? sector.baselinePrice
        : (typeof sector.initialPrice === 'number' ? sector.initialPrice : 100),
      volatility: typeof sector.volatility === 'number' ? sector.volatility : (sector.riskScore || 0) / 100,
      trendDescriptor: typeof sector.changePercent === 'number'
        ? `${sector.changePercent}% change`
        : 'flat',
      trendPercent: typeof sector.changePercent === 'number' ? sector.changePercent : undefined,
      balance: typeof sector.balance === 'number' ? sector.balance : undefined,
      allowedSymbols: [
        sector.symbol,
        sector.sectorSymbol,
        sector.ticker,
        sector.name,
        sector.sectorName,
      ].filter((sym) => typeof sym === 'string' && sym.trim() !== ''),
    };

    const { evaluateChecklistItem } = require('../ai/managerBrain');

    const approvedItems = [];
    const rejectedItems = [];

    for (const item of checklistDraft) {
      if (item.status === 'approved' || item.status === 'rejected') {
        if (item.status === 'approved') {
          approvedItems.push(item);
        } else {
          rejectedItems.push(item);
        }
        continue;
      }

      const workerProposal = item.workerProposal || {
        action: (item.action || 'HOLD').toUpperCase(),
        symbol: item.symbol || sector.symbol || sector.sectorSymbol || '',
        allocationPercent: typeof item.allocationPercent === 'number'
          ? item.allocationPercent
          : Math.max(0, Math.min(100, (item.amount && typeof sector.balance === 'number' && sector.balance > 0)
            ? (item.amount / sector.balance) * 100
            : 0)),
        confidence: typeof item.workerConfidence === 'number'
          ? item.workerConfidence
          : (typeof item.confidence === 'number' ? item.confidence : 50),
        reasoning: item.reasoning || item.reason || item.text || 'No reasoning provided'
      };

      let decision;
      try {
        decision = await evaluateChecklistItem({
          managerProfile,
          sectorState,
          workerProposal
        });
      } catch (error) {
        console.error(`[ManagerEngine] LLM manager evaluation failed for item ${item.id}. Falling back to approval unless proposal is invalid.`, error);
        // Default to approval unless there's a clear reason to reject
        // Only reject if proposal is clearly invalid (no action, no reasoning, zero confidence)
        const hasValidProposal = workerProposal && 
          workerProposal.action && 
          workerProposal.reasoning && 
          workerProposal.confidence !== undefined &&
          workerProposal.confidence > 0;
        
        decision = {
          approve: hasValidProposal, // Approve if proposal is valid, reject only if clearly invalid
          confidence: workerProposal.confidence || 50,
          reasoning: hasValidProposal 
            ? 'Manager evaluation failed but proposal appears valid; approving based on worker confidence.'
            : 'Manager evaluation failed and proposal appears invalid; rejecting.'
        };
      }

      const allocationPercent = typeof decision.editedAllocationPercent === 'number'
        ? decision.editedAllocationPercent
        : workerProposal.allocationPercent;

      item.allocationPercent = allocationPercent;
      item.managerConfidence = decision.confidence;
      item.managerReasoning = decision.reasoning;
      item.workerProposal = workerProposal;

      if (decision.approve === true) {
        item.status = 'approved';
        approvedItems.push(item);
      } else {
        item.status = 'rejected';
        item.managerFeedback = decision.reasoning;
        rejectedItems.push(item);
      }
    }

    // Persist statuses back to checklistDraft
    discussionRoom.checklistDraft = discussionRoom.checklistDraft.map(draft => {
      const updated = [...approvedItems, ...rejectedItems].find(i => i.id === draft.id);
      return updated || draft;
    });

    // Mirror statuses in checklist if present
    if (Array.isArray(discussionRoom.checklist)) {
      discussionRoom.checklist = discussionRoom.checklist.map(item => {
        const updated = [...approvedItems, ...rejectedItems].find(i => i.id === item.id);
        return updated ? { ...item, status: updated.status, managerFeedback: updated.managerFeedback, managerReasoning: updated.managerReasoning } : item;
      });
    }

    await saveDiscussion(discussionRoom);

    // Add approved items to execution list (manager backlog)
    if (approvedItems.length > 0) {
      const symbol = sector.symbol || sector.sectorSymbol || 'UNKNOWN';

      for (const item of approvedItems) {
        try {
          const actionText = (item.action || '').toUpperCase();
          let actionType = 'HOLD';
          if (['BUY', 'SELL', 'HOLD', 'REBALANCE'].includes(actionText)) {
            actionType = actionText;
          } else if (actionText.includes('BUY') || actionText.includes('DEPLOY')) {
            actionType = 'BUY';
          } else if (actionText.includes('SELL') || actionText.includes('WITHDRAW')) {
            actionType = 'SELL';
          } else if (actionText.includes('REBALANCE') || actionText.includes('ALLOCATE')) {
            actionType = 'REBALANCE';
          }

          const allocation = typeof sector.balance === 'number'
            ? Math.max(0, Math.round((item.allocationPercent || 0) / 100 * sector.balance))
            : Math.max(0, Math.round((item.allocationPercent || 0) * 10));

          await managerAddToExecutionList(manager.id, {
            actionType,
            symbol,
            allocation,
            generatedFromDiscussion: discussionId
          });

          await this._appendDecisionLogEntry({
            id: `decision-${discussionId}-${item.id || actionType}-${Date.now()}`,
            sectorId: sector.id,
            checklistId: discussionId,
            timestamp: Date.now(),
            managerId: manager.id,
            results: [{
              itemId: item.id || `${discussionId}-${actionType}`,
              action: actionType,
              actionType,
              amount: allocation,
              allocation,
              symbol,
              success: true,
              reason: item.managerReasoning || item.managerFeedback || null,
              impact: null,
              managerImpact: null
            }]
          });
        } catch (error) {
          console.error(`[ManagerEngine] Error adding approved item ${item.id} to execution list:`, error);
        }
      }
    }

    if (approvedItems.length > 0) {
      await saveDiscussion(discussionRoom);
      
      const currentStatus = (discussionRoom.status || '').toUpperCase();
      if (currentStatus !== 'CLOSED') {
        await transitionStatus(discussionRoom.id, STATUS.IN_PROGRESS, 'LLM-approved items added to execution backlog');
      }
      console.log(`[ManagerEngine] LLM-approved ${approvedItems.length} items for sector ${sector.id}. Added to execution backlog.`);
    }

    // Update sector
    const updatedSector = await updateSector(sector.id, {
      discussions: discussions
    });
    updatedSector.discussions = discussions;

    return updatedSector;
  }

  /**
   * Refine rejected items by running another discussion round
   * @param {Object} sector - Sector object
   * @returns {Promise<Object>} Updated sector with refined items
   */
  async refineRejected(sector) {
    if (!sector || !sector.id) {
      throw new Error('Invalid sector: sector and sector.id are required');
    }

    // Find the active discussion for this sector
    const discussions = Array.isArray(sector.discussions) ? sector.discussions : [];
    if (discussions.length === 0) {
      throw new Error(`No discussion found for sector ${sector.id}`);
    }

    // Get the most recent discussion
    const discussionId = discussions[discussions.length - 1];
    const discussionData = await findDiscussionById(discussionId);

    if (!discussionData) {
      throw new Error(`Discussion ${discussionId} not found`);
    }

    // Load discussion room
    const discussionRoom = DiscussionRoom.fromData(discussionData);

    // Check if there are rejected items in needs refinement
    if (!Array.isArray(discussionRoom.needsRefinement) || 
        discussionRoom.needsRefinement.length === 0) {
      // No rejected items to refine
      return sector;
    }

    // Load agents for this sector
    const allAgents = await loadAgents();
    const sectorAgents = allAgents.filter(agent => 
      agent && agent.sectorId === sector.id && agent.role !== 'manager'
    );

    if (sectorAgents.length === 0) {
      throw new Error(`No agents found for sector ${sector.id}`);
    }

    // Run a round of discussion to refine rejected items
    const updatedSector = await this.discussionEngine.runRound(sector, sectorAgents);

    return updatedSector;
  }

  /**
   * Check if a discussion can be closed
   * Returns true only if ALL closure conditions are met:
   * 1. No items remain with status: 'PENDING', 'REVISE_REQUIRED', 'RESUBMITTED'
   * 2. All checklist items are either: 'APPROVED' or 'ACCEPT_REJECTION'
   * 
   * @param {DiscussionRoom|Object} discussion - DiscussionRoom instance or discussion data object
   * @returns {boolean} True if discussion can be closed, false otherwise
   */
  canDiscussionClose(discussion) {
    if (!discussion) {
      return false;
    }

    // Convert to DiscussionRoom if needed
    const discussionRoom = discussion instanceof DiscussionRoom 
      ? discussion 
      : DiscussionRoom.fromData(discussion);

    const allItems = Array.isArray(discussionRoom.checklist) ? discussionRoom.checklist : [];
    const draftItems = Array.isArray(discussionRoom.checklistDraft) ? discussionRoom.checklistDraft : [];

    const openDrafts = draftItems.filter(item => {
      const status = (item.status || '').toUpperCase();
      return status === '' || status === 'PENDING' || status === 'REVISE_REQUIRED' || status === 'RESUBMITTED';
    });

    // If there are no checklist items AND no pending drafts, treat as closable (no more proposals)
    if (allItems.length === 0 && openDrafts.length === 0) {
      return true;
    }

    // Check for items with statuses that prevent closure
    const blockingStatuses = ['PENDING', 'pending', 'REVISE_REQUIRED', 'revise_required', 'RESUBMITTED', 'resubmitted'];
    const blockingItems = allItems.filter(item => {
      const status = (item.status || '').toUpperCase();
      return blockingStatuses.includes(status) || item.requiresRevision === true;
    });

    if (blockingItems.length > 0) {
      return false;
    }

    // Ensure all items are in terminal states: APPROVED, REJECTED, or ACCEPT_REJECTION
    const validFinalStatuses = ['APPROVED', 'approved', 'REJECTED', 'rejected', 'ACCEPT_REJECTION', 'accept_rejection'];
    const invalidItems = allItems.filter(item => {
      const status = (item.status || '').toUpperCase();
      return !validFinalStatuses.includes(status);
    });

    if (invalidItems.length > 0) {
      return false;
    }

    // All conditions met - discussion can be closed
    return true;
  }

  /**
   * Close a discussion - ONLY called by manager agent when all checklist items are resolved
   * A discussion should only close when ALL of the following are true:
   * 1. No checklist items are left in 'PENDING', 'REVISE_REQUIRED', or 'RESUBMITTED'
   * 2. All items are either 'APPROVED' or 'ACCEPT_REJECTION'
   * 3. Manager evaluates final state and calls closeDiscussion(discussionId)
   * 
   * On close:
   * - status → 'decided' (even if all items are rejected/accepted as rejection)
   * - finalRound saved to roundHistory
   * - discussionClosedAt timestamp recorded
   * - DO NOT execute approved items (executionList handles that)
   * 
   * @param {string} discussionId - Discussion ID
   * @returns {Promise<DiscussionRoom>} Closed discussion room
   */
  async closeDiscussion(discussionId) {
    try {
      const discussionData = await findDiscussionById(discussionId);
      if (!discussionData) {
        throw new Error(`Discussion ${discussionId} not found`);
      }

      const discussionRoom = DiscussionRoom.fromData(discussionData);

      // Check if already closed (handle various status formats)
      let currentStatus = (discussionRoom.status || '').toUpperCase();
      const closedStatuses = ['CLOSED', 'DECIDED'];
      if (closedStatuses.includes(currentStatus)) {
        console.log(`[ManagerEngine] Discussion ${discussionId} is already closed (status: ${currentStatus})`);
        // Ensure status is normalized to 'CLOSED' if it's DECIDED
        if (currentStatus === 'DECIDED') {
          await transitionStatus(discussionId, STATUS.CLOSED, 'Normalizing DECIDED to CLOSED');
        }
        return discussionRoom;
      }

      // Validate closure conditions using canDiscussionClose
      if (!this.canDiscussionClose(discussionRoom)) {
        const allItems = Array.isArray(discussionRoom.checklist) ? discussionRoom.checklist : [];
        const blockingStatuses = ['PENDING', 'REVISE_REQUIRED', 'RESUBMITTED'];
        const blockingItems = allItems.filter(item => {
          const status = (item.status || '').toUpperCase();
          return blockingStatuses.includes(status) || item.requiresRevision === true;
        });
        const invalidItems = allItems.filter(item => {
          const status = (item.status || '').toUpperCase();
          return status !== 'APPROVED' && status !== 'ACCEPT_REJECTION';
        });

        const errorMsg = `Cannot close discussion ${discussionId}: Closure conditions not met. ` +
          `${blockingItems.length} items with blocking statuses (PENDING/REVISE_REQUIRED/RESUBMITTED), ` +
          `${invalidItems.length} items not in final state (APPROVED/ACCEPT_REJECTION)`;
        console.warn(`[ManagerEngine] ${errorMsg}`);
        throw new Error(errorMsg);
      }

      const allItems = Array.isArray(discussionRoom.checklist) ? discussionRoom.checklist : [];
      const draftItems = Array.isArray(discussionRoom.checklistDraft) ? discussionRoom.checklistDraft : [];
      const hasResolvedWithoutItems = allItems.length === 0 && draftItems.filter(item => {
        const status = (item.status || '').toUpperCase();
        return status === '' || status === 'PENDING' || status === 'REVISE_REQUIRED' || status === 'RESUBMITTED';
      }).length === 0;

      // All validations passed - close the discussion
      const roundCount = discussionRoom.currentRound || discussionRoom.round || 1;
      
      // Save final round to roundHistory
      if (!Array.isArray(discussionRoom.roundHistory)) {
        discussionRoom.roundHistory = [];
      }
      
      // Create snapshot of final round
      const finalRoundSnapshot = {
        round: roundCount,
        checklist: JSON.parse(JSON.stringify(discussionRoom.checklist || [])),
        finalizedChecklist: JSON.parse(JSON.stringify(discussionRoom.finalizedChecklist || [])),
        managerDecisions: JSON.parse(JSON.stringify(discussionRoom.managerDecisions || [])),
        messages: JSON.parse(JSON.stringify(discussionRoom.messages || [])),
        timestamp: new Date().toISOString()
      };
      
      discussionRoom.roundHistory.push(finalRoundSnapshot);

      // Save discussion with round history
      await saveDiscussion(discussionRoom);
      
      // State transition: IN_PROGRESS → DECIDED → CLOSED
      // First mark as DECIDED if not already, then mark as CLOSED
      // After CLOSED, the sector becomes eligible for a new discussion
      currentStatus = (discussionRoom.status || '').toUpperCase();
      if (currentStatus !== 'DECIDED' && currentStatus !== 'CLOSED') {
        await transitionStatus(discussionId, STATUS.DECIDED, 'Discussion ready to close');
        console.log(`[ManagerEngine] Discussion ${discussionId} marked as DECIDED`);
      }
      
      // Now mark as CLOSED (final state)
      await transitionStatus(discussionId, STATUS.CLOSED, 'Discussion closed by manager');

      // Save updated discussion
      await saveDiscussion(discussionRoom);

      // Execute all approved checklist items that haven't been executed yet
      // This happens AFTER discussion closes, not during active rounds
      try {
        const ExecutionEngine = require('./ExecutionEngine');
        const executionEngine = new ExecutionEngine();
        
        // Get all approved items from finalizedChecklist
        const approvedItems = Array.isArray(discussionRoom.finalizedChecklist) 
          ? discussionRoom.finalizedChecklist.filter(item => {
              const status = (item.status || '').toUpperCase();
              return status === 'APPROVED' && !item.executedAt;
            })
          : [];

        if (approvedItems.length > 0) {
          console.log(`[ManagerEngine] Auto-executing ${approvedItems.length} approved checklist items for discussion ${discussionId} after closure`);
          
          const executionResults = [];
          for (const item of approvedItems) {
            try {
              // Reload discussion to get latest state before each execution
              const latestDiscussionData = await findDiscussionById(discussionId);
              if (latestDiscussionData) {
                const latestDiscussion = DiscussionRoom.fromData(latestDiscussionData);
                // Check if item still exists and hasn't been executed
                const latestItem = latestDiscussion.finalizedChecklist?.find(i => i.id === item.id) ||
                                  latestDiscussion.checklist?.find(i => i.id === item.id);
                if (latestItem && !latestItem.executedAt) {
                  const result = await executionEngine.executeChecklistItem(item.id, discussionId);
                  executionResults.push(result);
                  console.log(`[ManagerEngine] Executed checklist item ${item.id}: ${result.success ? 'success' : 'failed'}`);
                } else if (latestItem?.executedAt) {
                  console.log(`[ManagerEngine] Checklist item ${item.id} already executed, skipping`);
                  executionResults.push({
                    success: true,
                    itemId: item.id,
                    alreadyExecuted: true
                  });
                }
              } else {
                throw new Error(`Discussion ${discussionId} not found during execution`);
              }
            } catch (execError) {
              console.error(`[ManagerEngine] Failed to execute checklist item ${item.id}:`, execError.message);
              executionResults.push({
                success: false,
                itemId: item.id,
                error: execError.message
              });
            }
          }
          
          const successCount = executionResults.filter(r => r.success).length;
          console.log(`[ManagerEngine] Auto-execution complete: ${successCount}/${approvedItems.length} items executed successfully`);
        } else {
          console.log(`[ManagerEngine] No approved items to execute for discussion ${discussionId}`);
        }
      } catch (execError) {
        console.error(`[ManagerEngine] Error during auto-execution after discussion closure:`, execError);
        // Don't fail the closure if execution fails - log and continue
      }

      // Update agent confidence based on decision outcome
      try {
        const { updateAgentsConfidenceAfterConsensus } = require('../simulation/confidence');
        const { loadSector } = require('../utils/sectorStorage');
        
        // Get the decision from the discussion
        const decision = discussionRoom.decision;
        if (decision && decision.action && discussionRoom.agentIds && discussionRoom.agentIds.length > 0) {
          // Load sector to get current price and calculate price change
          const sector = await loadSector(discussionRoom.sectorId);
          if (sector) {
            // Get price at decision time (if stored) or use current price
            const decisionPrice = decision.priceAtDecision || sector.currentPrice || sector.simulatedPrice || 100;
            const currentPrice = sector.currentPrice || sector.simulatedPrice || decisionPrice;
            const priceChange = currentPrice - decisionPrice;
            const priceChangePercent = decisionPrice > 0 ? (priceChange / decisionPrice) * 100 : 0;
            
            console.log(`[ManagerEngine] Calculating confidence update for discussion ${discussionId}:`, {
              decisionAction: decision.action,
              decisionPrice: decisionPrice.toFixed(2),
              currentPrice: currentPrice.toFixed(2),
              priceChange: priceChange.toFixed(2),
              priceChangePercent: priceChangePercent.toFixed(2) + '%',
              agentIds: discussionRoom.agentIds
            });
            
            // Update confidence for all agents in the discussion
            const updatedAgents = await updateAgentsConfidenceAfterConsensus(discussionRoom.agentIds, {
              consensusReached: true,
              finalAction: decision.action,
              finalConfidence: decision.confidence,
              priceChangePercent: priceChangePercent
            });
            
            console.log(`[ManagerEngine] Updated confidence for ${updatedAgents.length} agents after discussion ${discussionId} closed. Decision: ${decision.action}, Price change: ${priceChangePercent.toFixed(2)}%`);
            if (updatedAgents.length > 0) {
              updatedAgents.forEach(agent => {
                console.log(`[ManagerEngine]   - Agent ${agent.name || agent.id}: confidence = ${agent.confidence?.toFixed(2) || 'N/A'}`);
              });
            }
          }
        }
      } catch (error) {
        console.warn(`[ManagerEngine] Failed to update agent confidence after discussion closure:`, error);
        // Don't fail the closure if confidence update fails
      }

      const closureReason = hasResolvedWithoutItems
        ? 'no_more_proposals'
        : 'all_items_resolved';

      // Set close reason for logging and tracking
      discussionRoom.closeReason = closureReason;
      await saveDiscussion(discussionRoom);

      console.log(`[ManagerEngine] Discussion ${discussionId} closed successfully after ${roundCount} rounds. Status set to 'CLOSED'. Close reason: ${closureReason}`, {
        event: 'DISCUSSION_CLOSED',
        sectorId: discussionRoom.sectorId,
        discussionId,
        reason: closureReason,
        roundCount: roundCount,
        checklistItemsCount: allItems.length
      });
      
      return discussionRoom;
    } catch (error) {
      console.error(`[ManagerEngine] Error closing discussion ${discussionId}:`, error);
      throw error;
    }
  }

  /**
   * Finalize checklist by moving approved items to sector checklistItems
   * @param {Object} sector - Sector object
   * @returns {Promise<Object>} Updated sector with finalized checklist
   */
  async finalizeChecklist(sector) {
    if (!sector || !sector.id) {
      throw new Error('Invalid sector: sector and sector.id are required');
    }

    // Find the active discussion for this sector
    const discussions = Array.isArray(sector.discussions) ? sector.discussions : [];
    if (discussions.length === 0) {
      throw new Error(`No discussion found for sector ${sector.id}`);
    }

    // Get the most recent discussion
    const discussionId = discussions[discussions.length - 1];
    const discussionData = await findDiscussionById(discussionId);

    if (!discussionData) {
      throw new Error(`Discussion ${discussionId} not found`);
    }

    // Load discussion room
    const discussionRoom = DiscussionRoom.fromData(discussionData);

    // Get approved items from checklistDraft
    const approvedItems = Array.isArray(discussionRoom.checklistDraft)
      ? discussionRoom.checklistDraft.filter(item => item.status === 'approved')
      : [];

    // Move approved items to discussion checklist
    const checklistItems = approvedItems.map((item, index) => ({
      id: `checklist-${discussionRoom.id}-${index}`,
      text: item.text,
      agentId: item.agentId,
      agentName: item.agentName,
      round: item.round,
      completed: false,
      createdAt: new Date().toISOString()
    }));

    // Update discussion checklist
    discussionRoom.checklist = checklistItems;
    
    // Clear discussionDraft
    discussionRoom.checklistDraft = [];
    
    // Save finalized discussion
    await saveDiscussion(discussionRoom);
    
    // NOTE: Discussion status is NOT automatically changed here.
    // The discussion remains in 'IN_PROGRESS' until the manager explicitly calls closeDiscussion().
    const currentStatus = (discussionRoom.status || '').toUpperCase();
    if (currentStatus !== 'CLOSED') {
      await transitionStatus(discussionRoom.id, STATUS.IN_PROGRESS, 'Checklist finalized');
    }

    // Update sector with checklistItems
    const updatedSector = await updateSector(sector.id, {
      discussions: discussions,
      checklistItems: checklistItems
    });
    updatedSector.discussions = discussions;
    updatedSector.checklistItems = checklistItems;

    return updatedSector;
  }

  /**
   * Auto-evaluate a checklist item immediately after creation
   * Uses manager scoring logic to determine APPROVED or REJECTED status
   * @param {Object} item - Checklist item to evaluate
   * @param {Object} sectorState - Sector state for evaluation context
   * @returns {Promise<Object>} Updated checklist item with status and managerReason
   */
  async autoEvaluateChecklistItem(item, sectorState) {
    try {
      // Get manager for this sector
      const manager = await getManagerBySectorId(sectorState.id || sectorState.sectorId);
      if (!manager) {
        console.warn(`[ManagerEngine] No manager found for sector ${sectorState.id || sectorState.sectorId}. Skipping auto-evaluation.`);
        return item;
      }

      // Normalize item format for evaluation (checklist items use actionType, but evaluateChecklistItem expects action)
      const itemForEvaluation = {
        ...item,
        action: item.action || item.actionType, // Support both action and actionType
        reasoning: item.reasoning || item.rationale || item.reason || '',
        reason: item.reason || item.reasoning || item.rationale || ''
      };

      // Evaluate using existing manager scoring logic
      const evaluation = await this.evaluateChecklistItem(manager, itemForEvaluation, sectorState);
      
      // Update item status based on evaluation
      item.status = evaluation.status; // APPROVED or REJECTED
      item.managerReason = evaluation.managerReason;
      item.evaluatedAt = new Date().toISOString();
      
      console.log(`[ManagerEngine] Auto-evaluated checklist item ${item.id}: ${evaluation.status} (score: ${evaluation.score?.toFixed(1) || 'N/A'})`);
      
      return item;
    } catch (error) {
      console.error(`[ManagerEngine] Error auto-evaluating checklist item ${item.id}:`, error.message);
      // On error, mark as rejected with error reason
      item.status = 'REJECTED';
      item.managerReason = `Auto-evaluation failed: ${error.message}`;
      item.evaluatedAt = new Date().toISOString();
      return item;
    }
  }

  /**
   * Force resolve all pending checklist items by rejecting them with "Timed out" reason
   * Called when discussion reaches max rounds
   * @param {string} discussionId - Discussion ID
   * @returns {Promise<Object>} Updated discussion
   */
  async forceResolvePendingItems(discussionId) {
    const discussionData = await findDiscussionById(discussionId);
    if (!discussionData) {
      throw new Error(`Discussion ${discussionId} not found`);
    }

    const discussionRoom = DiscussionRoom.fromData(discussionData);
    const allItems = Array.isArray(discussionRoom.checklist) ? discussionRoom.checklist : [];
    
    const blockingStatuses = ['PENDING', 'pending', 'REVISE_REQUIRED', 'revise_required', 'RESUBMITTED', 'resubmitted'];
    let resolvedCount = 0;

    for (const item of allItems) {
      const status = (item.status || '').toUpperCase();
      if (blockingStatuses.includes(status)) {
        item.status = 'REJECTED';
        item.managerReason = `Timed out: Discussion reached max rounds (${this.MAX_ROUNDS})`;
        item.evaluatedAt = new Date().toISOString();
        resolvedCount++;
        
        console.log(`[ManagerEngine] Force resolved pending item ${item.id} to REJECTED (timed out)`);
      }
    }

    if (resolvedCount > 0) {
      discussionRoom.updatedAt = new Date().toISOString();
      await saveDiscussion(discussionRoom);
      console.log(`[ManagerEngine] Force resolved ${resolvedCount} pending items in discussion ${discussionId}`);
    }

    return discussionRoom;
  }

  /**
   * Append decision data to executionLogs.json so decision-logs endpoint can surface
   * manager approvals before execution occurs.
   * @private
   */
  async _appendDecisionLogEntry(logEntry) {
    try {
      let logs = [];
      try {
        const data = await readDataFile(EXECUTION_LOGS_FILE);
        logs = Array.isArray(data) ? data : [];
      } catch (error) {
        if (error.code !== 'ENOENT') {
          throw error;
        }
      }

      logs.push(logEntry);

      if (logs.length > 1000) {
        logs = logs.slice(-1000);
      }

      await writeDataFile(EXECUTION_LOGS_FILE, logs);
    } catch (error) {
      console.error(`[ManagerEngine] Failed to append decision log entry: ${error.message}`);
    }
  }
}

module.exports = ManagerEngine;

