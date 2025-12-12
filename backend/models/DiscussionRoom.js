const { v4: uuidv4 } = require('uuid');

class DiscussionRoom {
  constructor(sectorId, title, agentIds = []) {
    this.id = uuidv4();
    this.sectorId = sectorId;
    this.title = title;
    this.agentIds = agentIds;
    this.messages = [];
    this.messagesCount = 0;
    this.status = 'in_progress'; // Discussion status: 'in_progress' | 'decided'
    this.createdAt = new Date().toISOString();
    this.updatedAt = new Date().toISOString();
    // Discussion lifecycle fields
    this.round = 1;
    this.currentRound = 1; // Multi-round: tracks current round number
    this.checklistDraft = [];
    this.checklist = [];
    this.finalizedChecklist = [];
    this.needsRefinement = [];
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
    // Use 'in_progress' and 'decided' to match API/UI expectations
    const statusMap = {
      'created': 'in_progress',
      'debating': 'in_progress',
      'open': 'in_progress',
      'OPEN': 'in_progress',
      'active': 'in_progress',
      'in_progress': 'in_progress',
      'decided': 'decided',
      'closed': 'decided',
      'CLOSED': 'decided',
      'archived': 'decided',
      'finalized': 'decided',
      'accepted': 'decided',
      'completed': 'decided'
    };
    discussionRoom.status = statusMap[data.status] || data.status || 'in_progress';
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
    return discussionRoom;
  }

  addMessage(message) {
    const messageEntry = {
      id: message.id || `${this.id}-msg-${this.messages.length}`,
      agentId: message.agentId,
      agentName: message.agentName || 'Unknown Agent',
      content: message.content,
      role: message.role,
      timestamp: message.timestamp || new Date().toISOString(),
      createdAt: message.createdAt || new Date().toISOString()
    };
    this.messages.push(messageEntry);
    this.messagesCount = this.messages.length;
    this.updatedAt = new Date().toISOString();
  }

  setDecision(decision) {
    this.finalDecision = decision.action || decision.finalDecision;
    this.rationale = decision.rationale || decision.reason;
    this.confidence = decision.confidence;
    this.selectedAgent = decision.selectedAgent || null;
    this.voteBreakdown = decision.voteBreakdown || null;
    this.conflictScore = decision.conflictScore || null;
    this.decidedAt = new Date().toISOString();
    this.updatedAt = new Date().toISOString();
    this.status = 'decided'; // Discussion status: 'in_progress' | 'decided'
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
      discussionClosedAt: this.discussionClosedAt
    };
  }
}

module.exports = DiscussionRoom;

