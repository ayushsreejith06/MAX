const { v4: uuidv4 } = require('uuid');
const { validateAgentMessage } = require('../utils/messageValidation');

class DiscussionRoom {
  constructor(sectorId, title, agentIds = []) {
    this.id = uuidv4();
    this.sectorId = sectorId;
    this.title = title;
    this.agentIds = agentIds;
    this.messages = [];
    this.messagesCount = 0;
    this.status = 'CREATED'; // Discussion status: 'CREATED' | 'IN_PROGRESS' | 'DECIDED' | 'CLOSED'
    this.createdAt = new Date().toISOString();
    this.updatedAt = new Date().toISOString();
    // Discussion lifecycle fields
    this.round = 1;
    this.currentRound = 1; // Multi-round: tracks current round number
    this.checklistDraft = [];
    this.checklist = [];
    this.finalizedChecklist = [];
    this.needsRefinement = [];
    // Refinement cycle tracking
    this.activeRefinementCycles = []; // Array of {itemId, rejectedAt, rejectionReason, requiredImprovements}
    // Multi-round discussion fields
    this.roundHistory = []; // Array of round snapshots
    // Decision fields
    this.finalDecision = null;
    this.rationale = null;
    this.confidence = null;
    this.selectedAgent = null;
    this.voteBreakdown = null;
    this.conflictScore = null;
    this.decidedAt = null;
    // Manager decision fields
    this.managerDecisions = [];
    // Closure fields
    this.discussionClosedAt = null;
    // Guardrail tracking fields
    this.checklistCreationAttempts = {}; // Map of round -> Set of agentIds who attempted checklist creation
    this.lastChecklistItemTimestamp = null; // Timestamp of last checklist item creation
    this.closeReason = null; // Reason why discussion was closed
  }

  static fromData(data) {
    const discussionRoom = new DiscussionRoom(data.sectorId, data.title, data.agentIds);
    discussionRoom.id = data.id;
    discussionRoom.messages = data.messages || [];
    // Calculate messagesCount from messages.length if not present (backward compatibility)
    if (typeof data.messagesCount === 'number') {
      discussionRoom.messagesCount = data.messagesCount;
    } else {
      // Calculate from messages array length for backward compatibility
      discussionRoom.messagesCount = Array.isArray(data.messages) ? data.messages.length : 0;
    }
    // Map old status values to new ones for backward compatibility
    // State transitions: CREATED → IN_PROGRESS → DECIDED → CLOSED
    const statusMap = {
      'created': 'CREATED',
      'CREATED': 'CREATED',
      'debating': 'IN_PROGRESS',
      'open': 'CREATED',
      'OPEN': 'CREATED',
      'active': 'IN_PROGRESS',
      'in_progress': 'IN_PROGRESS',
      'IN_PROGRESS': 'IN_PROGRESS',
      'decided': 'DECIDED',
      'DECIDED': 'DECIDED',
      'closed': 'CLOSED',
      'CLOSED': 'CLOSED',
      'archived': 'CLOSED',
      'finalized': 'CLOSED',
      'accepted': 'CLOSED',
      'completed': 'CLOSED'
    };
    discussionRoom.status = statusMap[data.status] || data.status || 'CREATED';
    discussionRoom.createdAt = data.createdAt;
    discussionRoom.updatedAt = data.updatedAt;
    // Discussion lifecycle fields
    discussionRoom.round = typeof data.round === 'number' ? data.round : 1;
    // Multi-round: currentRound tracks the current round number
    discussionRoom.currentRound = typeof data.currentRound === 'number' ? data.currentRound : (typeof data.round === 'number' ? data.round : 1);
    discussionRoom.checklistDraft = Array.isArray(data.checklistDraft) ? data.checklistDraft : [];
    discussionRoom.checklist = Array.isArray(data.checklist) ? data.checklist : [];
    discussionRoom.finalizedChecklist = Array.isArray(data.finalizedChecklist) ? data.finalizedChecklist : [];
    discussionRoom.needsRefinement = Array.isArray(data.needsRefinement) ? data.needsRefinement : [];
    // Refinement cycle tracking
    discussionRoom.activeRefinementCycles = Array.isArray(data.activeRefinementCycles) ? data.activeRefinementCycles : [];
    // Multi-round: roundHistory stores snapshots of previous rounds
    discussionRoom.roundHistory = Array.isArray(data.roundHistory) ? data.roundHistory : [];
    // Decision fields
    discussionRoom.finalDecision = data.finalDecision || null;
    discussionRoom.rationale = data.rationale || null;
    discussionRoom.confidence = data.confidence || null;
    discussionRoom.selectedAgent = data.selectedAgent || null;
    discussionRoom.voteBreakdown = data.voteBreakdown || null;
    discussionRoom.conflictScore = data.conflictScore || null;
    discussionRoom.decidedAt = data.decidedAt || null;
    // Manager decision fields
    discussionRoom.managerDecisions = Array.isArray(data.managerDecisions) ? data.managerDecisions : [];
    // Closure fields
    discussionRoom.discussionClosedAt = data.discussionClosedAt || null;
    // Guardrail tracking fields
    discussionRoom.checklistCreationAttempts = data.checklistCreationAttempts || {};
    discussionRoom.lastChecklistItemTimestamp = data.lastChecklistItemTimestamp || null;
    discussionRoom.closeReason = data.closeReason || null;
    // Migration flag
    discussionRoom.checklistMigrated = data.checklistMigrated === true;
    return discussionRoom;
  }

  addMessage(message) {
    // Skip validation for LLM-generated messages (those with a proposal object)
    // LLM-generated messages are trusted and should always be added
    const isLLMGenerated = message.proposal && typeof message.proposal === 'object';
    
    if (!isLLMGenerated) {
      // Validate message content before adding (only for non-LLM messages)
      const validation = validateAgentMessage(
        message.content,
        message.agentId,
        message.agentName
      );

      if (!validation.isValid) {
        console.warn(`[DiscussionRoom] Message validation failed: ${validation.reason}`);
        return false; // Return false to indicate message was not added
      }
    } else {
      console.log(`[DiscussionRoom] Skipping validation for LLM-generated message from agent ${message.agentName || message.agentId}`);
    }

    const messageEntry = {
      id: message.id || `${this.id}-msg-${this.messages.length}`,
      agentId: message.agentId,
      agentName: message.agentName || 'Unknown Agent',
      content: message.content,
      role: message.role,
      timestamp: message.timestamp || new Date().toISOString(),
      createdAt: message.createdAt || new Date().toISOString()
    };
    
    // Include proposal and analysis if present (for LLM-generated messages)
    if (message.proposal) {
      messageEntry.proposal = message.proposal;
    }
    if (message.analysis) {
      messageEntry.analysis = message.analysis;
    }
    
    this.messages.push(messageEntry);
    this.messagesCount = this.messages.length;
    this.updatedAt = new Date().toISOString();
    return true; // Return true to indicate message was added successfully
  }

  setDecision(decision) {
    // VALIDATION: Cannot mark as DECIDED without checklist items
    // A discussion must have checklist items to be considered DECIDED
    const hasChecklistItems = Array.isArray(this.checklist) && this.checklist.length > 0;
    const hasChecklistDraft = Array.isArray(this.checklistDraft) && this.checklistDraft.length > 0;
    
    if (!hasChecklistItems && !hasChecklistDraft) {
      const error = `Cannot mark discussion as DECIDED: Discussion ${this.id} has no checklist items. A discussion must have checklist items before it can be marked as DECIDED.`;
      console.error(`[DiscussionRoom.setDecision] ${error}`);
      throw new Error(error);
    }

    // INVARIANT: discussion.status === DECIDED  ⇔  checklist.pendingCount === 0
    // Cannot mark as DECIDED if ANY checklist items are still PENDING
    if (hasChecklistItems) {
      const terminalStatuses = ['APPROVED', 'REJECTED', 'ACCEPT_REJECTION', 'EXECUTED'];
      const pendingItems = [];

      for (const item of this.checklist) {
        const status = (item.status || '').toUpperCase();
        const isTerminal = terminalStatuses.includes(status);
        
        if (!isTerminal) {
          pendingItems.push({
            id: item.id || 'unknown',
            status: status || 'PENDING',
            action: item.action || item.actionType || 'unknown',
            symbol: item.symbol || 'unknown'
          });
        }
      }

      if (pendingItems.length > 0) {
        const pendingItemIds = pendingItems.map(item => item.id).join(', ');
        const pendingItemDetails = pendingItems.map(item => 
          `  - ${item.id} (${item.status}): ${item.action} ${item.symbol || ''}`
        ).join('\n');
        
        const warning = `Cannot mark discussion as DECIDED: Discussion ${this.id} has ${pendingItems.length} pending checklist item(s). All items must be in terminal states (APPROVED, REJECTED, or ACCEPT_REJECTION) before a discussion can be marked as DECIDED.\nPending items:\n${pendingItemDetails}`;
        
        console.warn(`[DiscussionRoom.setDecision] ${warning}`);
        throw new Error(`Cannot mark as DECIDED: ${pendingItems.length} checklist item(s) still pending (IDs: ${pendingItemIds}). Manager agent must remain ACTIVE until all items are resolved.`);
      }
    }
    
    this.finalDecision = decision.action || decision.finalDecision;
    this.rationale = decision.rationale || decision.reason;
    this.confidence = decision.confidence;
    this.selectedAgent = decision.selectedAgent || null;
    this.voteBreakdown = decision.voteBreakdown || null;
    this.conflictScore = decision.conflictScore || null;
    this.decidedAt = new Date().toISOString();
    this.updatedAt = new Date().toISOString();
    this.status = 'DECIDED'; // Discussion status: 'CREATED' | 'IN_PROGRESS' | 'DECIDED' | 'CLOSED'
  }

  /**
   * Check if agent has already attempted checklist creation in this round
   * @param {string} agentId - Agent ID
   * @param {number} round - Round number
   * @returns {boolean} True if already attempted
   */
  hasAttemptedChecklistCreation(agentId, round) {
    if (!this.checklistCreationAttempts) {
      this.checklistCreationAttempts = {};
    }
    const roundKey = String(round);
    const attempts = this.checklistCreationAttempts[roundKey];
    return attempts && Array.isArray(attempts) && attempts.includes(agentId);
  }

  /**
   * Mark that agent has attempted checklist creation in this round
   * @param {string} agentId - Agent ID
   * @param {number} round - Round number
   */
  markChecklistCreationAttempt(agentId, round) {
    if (!this.checklistCreationAttempts) {
      this.checklistCreationAttempts = {};
    }
    const roundKey = String(round);
    if (!this.checklistCreationAttempts[roundKey]) {
      this.checklistCreationAttempts[roundKey] = [];
    }
    if (!this.checklistCreationAttempts[roundKey].includes(agentId)) {
      this.checklistCreationAttempts[roundKey].push(agentId);
    }
    this.updatedAt = new Date().toISOString();
  }

  /**
   * Check if agent already has a checklist item in this round
   * @param {string} agentId - Agent ID
   * @param {number} round - Round number
   * @returns {boolean} True if agent has checklist item for this round
   */
  hasChecklistItemForRound(agentId, round) {
    if (!Array.isArray(this.checklist)) {
      return false;
    }
    return this.checklist.some(item => {
      // CRITICAL: Only match items with explicit round field that matches
      // Do NOT use fallback logic - this causes false matches across discussions/rounds
      if (typeof item.round !== 'number') {
        return false; // Item has no round set - don't match (shouldn't happen, but be safe)
      }
      const itemRound = item.round;
      const itemAgentId = item.sourceAgentId || item.agentId;
      return itemAgentId === agentId && itemRound === round;
    });
  }

  /**
   * Update timestamp of last checklist item creation
   */
  updateLastChecklistItemTimestamp() {
    this.lastChecklistItemTimestamp = new Date().toISOString();
    this.updatedAt = new Date().toISOString();
  }

  toJSON() {
    return {
      id: this.id,
      sectorId: this.sectorId,
      title: this.title,
      agentIds: this.agentIds,
      messages: this.messages,
      messagesCount: this.messagesCount,
      status: this.status,
      createdAt: this.createdAt,
      updatedAt: this.updatedAt,
      // Discussion lifecycle fields
      round: this.round,
      currentRound: this.currentRound, // Multi-round: current round number
      checklistDraft: this.checklistDraft,
      checklist: this.checklist,
      finalizedChecklist: this.finalizedChecklist,
      needsRefinement: this.needsRefinement,
      // Refinement cycle tracking
      activeRefinementCycles: this.activeRefinementCycles || [],
      // Multi-round discussion fields
      roundHistory: this.roundHistory, // Array of round snapshots
      // Decision fields
      finalDecision: this.finalDecision,
      rationale: this.rationale,
      confidence: this.confidence,
      selectedAgent: this.selectedAgent,
      voteBreakdown: this.voteBreakdown,
      conflictScore: this.conflictScore,
      decidedAt: this.decidedAt,
      // Manager decision fields
      managerDecisions: this.managerDecisions,
      // Closure fields
      discussionClosedAt: this.discussionClosedAt,
      // Guardrail tracking fields
      checklistCreationAttempts: this.checklistCreationAttempts || {},
      lastChecklistItemTimestamp: this.lastChecklistItemTimestamp || null,
      closeReason: this.closeReason || null,
      // Migration flag
      checklistMigrated: this.checklistMigrated === true
    };
  }
}

module.exports = DiscussionRoom;

