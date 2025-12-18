const { v4: uuidv4 } = require('uuid');
const { validateAgentMessage } = require('../utils/messageValidation');
const { DiscussionStatus } = require('../core/state');
const { validateNoChecklist } = require('../utils/checklistGuard');

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
    this.closeReason = null; // Reason why discussion was closed
  }

  static fromData(data) {
    // CHECKLIST GUARD: Validate incoming discussion data
    validateNoChecklist(data, 'DiscussionRoom.fromData', true);
    
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
      'active': DiscussionStatus.IN_PROGRESS,
      'in_progress': DiscussionStatus.IN_PROGRESS,
      'IN_PROGRESS': DiscussionStatus.IN_PROGRESS,
      'decided': DiscussionStatus.DECIDED,
      'DECIDED': DiscussionStatus.DECIDED,
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
    discussionRoom.closeReason = data.closeReason || null;
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
      // CHECKLIST GUARD: Validate proposal object
      validateNoChecklist(message.proposal, 'DiscussionRoom.addMessage (proposal)');
      messageEntry.proposal = message.proposal;
    }
    if (message.analysis) {
      // CHECKLIST GUARD: Validate analysis object
      validateNoChecklist(message.analysis, 'DiscussionRoom.addMessage (analysis)');
      messageEntry.analysis = message.analysis;
    }
    
    // CHECKLIST GUARD: Validate message entry before adding
    validateNoChecklist(messageEntry, 'DiscussionRoom.addMessage (messageEntry)');
    
    this.messages.push(messageEntry);
    this.messagesCount = this.messages.length;
    this.updatedAt = new Date().toISOString();
    return true; // Return true to indicate message was added successfully
  }

  async setDecision(decision) {
    // CHECKLIST GUARD: Validate decision object
    validateNoChecklist(decision, 'DiscussionRoom.setDecision');
    
    // Set decision metadata (this does not change the status)
    this.finalDecision = decision.action || decision.finalDecision;
    this.rationale = decision.rationale || decision.reason;
    this.confidence = decision.confidence;
    this.selectedAgent = decision.selectedAgent || null;
    this.voteBreakdown = decision.voteBreakdown || null;
    this.conflictScore = decision.conflictScore || null;
    this.decidedAt = new Date().toISOString();
    this.updatedAt = new Date().toISOString();
    
    // Use transitionStatus to change status to DECIDED
    // This ensures all validation logic is applied
    const { transitionStatus, STATUS } = require('../utils/discussionStatusService');
    
    // Save the discussion first to ensure transitionStatus has the latest state
    const { saveDiscussion } = require('../utils/discussionStorage');
    await saveDiscussion(this);
    
    // Transition to DECIDED status (this will perform all validations)
    await transitionStatus(this.id, STATUS.DECIDED, 'Decision produced by discussion lifecycle');
    
    // Reload the discussion to get the updated status
    const { findDiscussionById } = require('../utils/discussionStorage');
    const updatedData = await findDiscussionById(this.id);
    if (updatedData) {
      // Update this instance with the latest data from storage
      const updatedRoom = DiscussionRoom.fromData(updatedData);
      this.status = updatedRoom.status;
      this.updatedAt = updatedRoom.updatedAt;
    }
  }


  toJSON() {
    const json = {
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
      closeReason: this.closeReason || null
    };
    
    // CHECKLIST GUARD: Validate before returning
    validateNoChecklist(json, 'DiscussionRoom.toJSON', true);
    
    return json;
  }
}

module.exports = DiscussionRoom;

