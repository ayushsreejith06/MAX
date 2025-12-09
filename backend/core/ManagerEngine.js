const { startDiscussion } = require('../agents/discussion/discussionLifecycle');
const { loadDiscussions, findDiscussionById, saveDiscussion } = require('../utils/discussionStorage');
const DiscussionEngine = require('./DiscussionEngine');
const DiscussionRoom = require('../models/DiscussionRoom');
const { loadAgents } = require('../utils/agentStorage');
const { updateSector } = require('../utils/sectorStorage');
const ExecutionEngine = require('./ExecutionEngine');
const { saveRejectedItems } = require('../utils/rejectedItemsStorage');
const { getAllSectors } = require('../utils/sectorStorage');

/**
 * ManagerEngine - Handles manager-level decisions including discussion creation
 */
class ManagerEngine {
  constructor() {
    this.tickCounter = 0;
    this.discussionEngine = new DiscussionEngine();
    this.confidenceThreshold = 65; // Default threshold for discussion readiness
    this.approvalConfidenceThreshold = 65; // Threshold for auto-approving checklist items
    // Track recent discussion creation times per sector to prevent discussion storms
    // Format: sectorId -> timestamp of last discussion creation
    this.lastDiscussionCreation = new Map();
    // Minimum time between discussion creations (5 seconds)
    this.minDiscussionIntervalMs = 5000;
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
      // Check if there's already an open discussion for this sector
      const existingDiscussions = await loadDiscussions();
      const openDiscussion = existingDiscussions.find(d => 
        d.sectorId === sectorId && 
        (d.status === 'open' || d.status === 'created' || d.status === 'in_progress')
      );

      if (openDiscussion) {
        // DEBUG: Log that discussion already exists
        console.log(`[ManagerEngine] Discussion already exists for sector ${sectorId}: ${openDiscussion.id}`);
        const checklistState = this._getChecklistState(openDiscussion);
        console.log(`[ManagerEngine] Discussion ID: ${openDiscussion.id}, Checklist State:`, JSON.stringify(checklistState, null, 2));
        return { 
          created: false, 
          discussionId: openDiscussion.id, 
          checklistState 
        };
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
      // Get all agents for the sector (manager + generals)
      const agents = (sector.agents || []).filter(agent => agent && agent.id);
      if (agents.length === 0) {
        console.log(`[DISCUSSION BLOCKED] No agents found in sector ${sectorId}`);
        return { started: false, discussionId: null };
      }

      // Check ALL agents (manager + generals) have confidence >= 65
      const allAboveThreshold = agents.every(agent => {
        const confidence = typeof agent.confidence === 'number' ? agent.confidence : 0;
        return confidence >= 65;
      });

      if (!allAboveThreshold) {
        console.log(`[DISCUSSION BLOCKED] Not all agents meet threshold (>= 65)`);
        console.log(`[DISCUSSION CHECK]`, {
          sectorId,
          agentConfidences: agents.map(a => `${a.name || a.id}: ${a.confidence || 0}`),
          allAboveThreshold: false
        });
        return { started: false, discussionId: null };
      }

      // Calculate manager confidence as average of ALL agents
      const totalConfidence = agents.reduce((sum, agent) => {
        const confidence = typeof agent.confidence === 'number' ? agent.confidence : 0;
        return sum + confidence;
      }, 0);
      const managerConfidence = totalConfidence / agents.length;

      // Check manager confidence >= 65
      if (managerConfidence < 65) {
        console.log(`[DISCUSSION BLOCKED] Manager confidence (${managerConfidence.toFixed(2)}) < 65`);
        console.log(`[DISCUSSION CHECK]`, {
          sectorId,
          agentConfidences: agents.map(a => `${a.name || a.id}: ${a.confidence || 0}`),
          allAboveThreshold: true,
          managerConfidence: managerConfidence.toFixed(2)
        });
        return { started: false, discussionId: null };
      }

      // Check if there's already an active or in-progress discussion for this sector
      const existingDiscussions = await loadDiscussions();
      const activeDiscussion = existingDiscussions.find(d => 
        d.sectorId === sectorId && 
        (d.status === 'open' || d.status === 'created' || d.status === 'in_progress' || d.status === 'active')
      );

      if (activeDiscussion) {
        console.log(`[DISCUSSION BLOCKED] Active discussion exists: ${activeDiscussion.id} (status: ${activeDiscussion.status})`);
        return { started: false, discussionId: activeDiscussion.id };
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
        agentConfidences: agents.map(a => `${a.name || a.id}: ${a.confidence || 0}`),
        allAboveThreshold: true,
        managerConfidence: managerConfidence.toFixed(2)
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
      
      // Check if there's already an active discussion for this sector
      const existingDiscussions = await loadDiscussions();
      const activeDiscussion = existingDiscussions.find(d => 
        d.sectorId === sectorId && 
        (d.status === 'open' || d.status === 'created' || d.status === 'in_progress' || d.status === 'active')
      );

      if (activeDiscussion) {
        console.log(`[ManagerEngine] Active discussion already exists for sector ${sectorId}: ${activeDiscussion.id} (status: ${activeDiscussion.status})`);
        return { 
          created: false, 
          discussion: DiscussionRoom.fromData(activeDiscussion) 
        };
      }

      // Load sector to get sector name and agents
      const { getSectorById } = require('../utils/sectorStorage');
      const sector = await getSectorById(sectorId);
      
      if (!sector) {
        throw new Error(`Sector ${sectorId} not found`);
      }

      // Get agent IDs from sector (non-manager agents only)
      const allAgents = Array.isArray(sector.agents) ? sector.agents.filter(a => a && a.id) : [];
      const nonManagerAgents = allAgents.filter(agent => {
        const role = (agent.role || '').toLowerCase();
        return role !== 'manager' && !role.includes('manager');
      });
      const agentIds = nonManagerAgents.map(a => a.id);

      console.log(`[ManagerEngine] Sector ${sectorId} has ${allAgents.length} total agents, ${nonManagerAgents.length} non-manager agents`);

      // Safeguard: Require at least 1 non-manager agent for discussion
      // (Changed from 2 to 1 to allow discussions with manager + 1 general)
      if (agentIds.length < 1) {
        console.log(`[ManagerEngine] Cannot create discussion for sector ${sectorId}: requires at least 1 non-manager agent, found ${agentIds.length}`);
        return { created: false, discussion: null };
      }

      // Safeguard: Prevent discussion storms - check if a discussion was created recently
      const lastCreationTime = this.lastDiscussionCreation.get(sectorId);
      if (lastCreationTime !== undefined) {
        const timeSinceLastCreation = Date.now() - lastCreationTime;
        if (timeSinceLastCreation < this.minDiscussionIntervalMs) {
          const remainingMs = this.minDiscussionIntervalMs - timeSinceLastCreation;
          console.log(`[ManagerEngine] Cannot create discussion for sector ${sectorId}: discussion created ${Math.round(timeSinceLastCreation / 1000)}s ago, waiting ${Math.round(remainingMs / 1000)}s more to prevent discussion storm`);
          return { created: false, discussion: null };
        }
      }

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

      // If discussion is already finalized, skip
      if (discussionRoom.status === 'finalized' || discussionRoom.status === 'completed') {
        console.log(`[ManagerEngine] Discussion ${discussion.id} already finalized`);
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

      // Only mark as finalized if there are approved checklist items
      const finalizedChecklist = Array.isArray(updatedDiscussionRoom.finalizedChecklist) ? updatedDiscussionRoom.finalizedChecklist : [];
      
      if (finalizedChecklist.length > 0) {
        // Mark discussion as finalized only if there are approved items
        updatedDiscussionRoom.status = 'finalized';
        updatedDiscussionRoom.updatedAt = new Date().toISOString();
        await saveDiscussion(updatedDiscussionRoom);
        console.log(`[ManagerEngine] Handled checklist and finalized discussion: ID = ${discussion.id} with ${finalizedChecklist.length} approved items`);
      } else {
        // No approved items - cannot finalize
        console.warn(`[ManagerEngine] Discussion ${discussion.id} cannot be finalized: No approved checklist items found`);
        // Keep status as is (should be 'in_progress' or 'rejected')
        updatedDiscussionRoom.updatedAt = new Date().toISOString();
        await saveDiscussion(updatedDiscussionRoom);
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
      const approved = confidence > this.approvalConfidenceThreshold;
      const reason = approved 
        ? `Auto-approved: confidence (${confidence.toFixed(2)}) exceeds threshold (${this.approvalConfidenceThreshold})`
        : `Auto-rejected: confidence (${confidence.toFixed(2)}) below threshold (${this.approvalConfidenceThreshold}). Needs refinement.`;

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
    
    // Extract approved items and store in finalizedChecklist
    const approvedItems = managerDecisions
      .filter(decision => decision.approved === true && decision.item)
      .map(decision => {
        const item = decision.item;
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
    
    // Only set status to 'finalized' if there are approved checklist items
    // Approved discussions must have approved checklist items for execution
    if (approvedItems.length > 0) {
      discussionRoom.status = 'finalized';
      console.log(`[ManagerEngine] Processed ${managerDecisions.length} checklist items for discussion ${discussionRoom.id}. Approved: ${approvedItems.length}, Rejected: ${managerDecisions.filter(d => !d.approved).length}`);
      console.log(`[CHECKLIST FINALIZED]`, discussionRoom.finalizedChecklist);
    } else {
      // No approved items - discussion cannot be finalized/approved
      // Keep status as 'in_progress' or set to 'rejected' if all items were rejected
      const allRejected = managerDecisions.length > 0 && managerDecisions.every(d => !d.approved);
      if (allRejected) {
        discussionRoom.status = 'rejected';
        console.log(`[ManagerEngine] Discussion ${discussionRoom.id} rejected: All ${managerDecisions.length} checklist items were rejected. No approved items for execution.`);
      } else {
        discussionRoom.status = 'in_progress';
        console.log(`[ManagerEngine] Discussion ${discussionRoom.id} remains in progress: No approved checklist items yet.`);
      }
    }
    
    discussionRoom.updatedAt = new Date().toISOString();

    // Save updated discussion
    await saveDiscussion(discussionRoom);

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
    const allAboveThreshold = agents.every(agent => {
      const confidence = typeof agent.confidence === 'number' ? agent.confidence : 0;
      return confidence >= 65;
    });

    if (!allAboveThreshold) {
      console.log(`[DISCUSSION BLOCKED] Not all agents meet threshold (>= 65)`);
      console.log(`[DISCUSSION CHECK]`, {
        sectorId: sector.id,
        agentConfidences: agents.map(a => `${a.name || a.id}: ${a.confidence || 0}`),
        allAboveThreshold: false
      });
      return null;
    }

    // Calculate manager confidence as average of ALL agents
    const totalConfidence = agents.reduce((sum, agent) => {
      const confidence = typeof agent.confidence === 'number' ? agent.confidence : 0;
      return sum + confidence;
    }, 0);
    const managerConfidence = totalConfidence / agents.length;

    // Check manager confidence >= 65
    if (managerConfidence < 65) {
      console.log(`[DISCUSSION BLOCKED] Manager confidence (${managerConfidence.toFixed(2)}) < 65`);
      console.log(`[DISCUSSION CHECK]`, {
        sectorId: sector.id,
        agentConfidences: agents.map(a => `${a.name || a.id}: ${a.confidence || 0}`),
        allAboveThreshold: true,
        managerConfidence: managerConfidence.toFixed(2)
      });
      return null;
    }

    // Check if there's already an active or in-progress discussion
    const existingDiscussions = await loadDiscussions();
    const activeDiscussion = existingDiscussions.find(d => 
      d.sectorId === sector.id && 
      (d.status === 'active' || d.status === 'in_progress' || d.status === 'open' || d.status === 'created')
    );

    if (activeDiscussion) {
      console.log(`[DISCUSSION BLOCKED] Active discussion exists: ${activeDiscussion.id} (status: ${activeDiscussion.status})`);
      return null;
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
      agentConfidences: agents.map(a => `${a.name || a.id}: ${a.confidence || 0}`),
      allAboveThreshold: true,
      managerConfidence: managerConfidence.toFixed(2)
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
    
    // Prevent duplicate executions - if already finalized, skip
    if (discussionRoom.status === 'finalized' || discussionRoom.status === 'completed') {
      console.log(`[ManagerEngine] Discussion ${discussionId} already finalized. Skipping execution.`);
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

    // Save discussion with approved items
    await saveDiscussion(discussionRoom);

    // Execute the approved checklist
    const executionEngine = new ExecutionEngine();
    
    // Log execution
    console.log(`[EXECUTION] Checklist sent to ExecutionEngine for sector ${sector.id}`);
    
    const executionResult = await executionEngine.executeChecklist(discussionRoom.checklistDraft, sector.id);

    // Only finalize discussion if execution succeeded
    if (executionResult.success) {
      // Update discussion status to finalized
      discussionRoom.status = 'finalized';
      discussionRoom.updatedAt = new Date().toISOString();
      await saveDiscussion(discussionRoom);
    } else {
      // If execution failed, log warning but don't finalize
      console.warn(`[ManagerEngine] Execution failed for sector ${sector.id}. Discussion not finalized.`);
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
    // For backward compatibility, auto-approve all items
    return await this.approveChecklist(sector);
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
    
    // Mark discussion as completed
    discussionRoom.status = 'completed';
    discussionRoom.updatedAt = new Date().toISOString();

    // Save finalized discussion
    await saveDiscussion(discussionRoom);

    // Update sector with checklistItems
    const updatedSector = await updateSector(sector.id, {
      discussions: discussions,
      checklistItems: checklistItems
    });
    updatedSector.discussions = discussions;
    updatedSector.checklistItems = checklistItems;

    return updatedSector;
  }
}

module.exports = ManagerEngine;

