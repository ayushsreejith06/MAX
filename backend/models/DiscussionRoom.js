const { v4: uuidv4 } = require('uuid');

class DiscussionRoom {
  constructor(sectorId, title, agentIds = []) {
    this.id = uuidv4();
    this.sectorId = sectorId;
    this.title = title;
    this.agentIds = agentIds;
    this.messages = [];
    this.messagesCount = 0;
    this.status = 'in_progress';
    this.createdAt = new Date().toISOString();
    this.updatedAt = new Date().toISOString();
    // Discussion lifecycle fields
    this.round = 1;
    this.checklistDraft = [];
    this.checklist = [];
    this.finalizedChecklist = [];
    this.needsRefinement = [];
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
    const statusMap = {
      'created': 'in_progress',
      'debating': 'in_progress',
      'open': 'in_progress',
      'decided': 'decided',
      'closed': 'closed',
      'archived': 'archived'
    };
    discussionRoom.status = statusMap[data.status] || data.status || 'in_progress';
    discussionRoom.createdAt = data.createdAt;
    discussionRoom.updatedAt = data.updatedAt;
    // Discussion lifecycle fields
    discussionRoom.round = typeof data.round === 'number' ? data.round : 1;
    discussionRoom.checklistDraft = Array.isArray(data.checklistDraft) ? data.checklistDraft : [];
    discussionRoom.checklist = Array.isArray(data.checklist) ? data.checklist : [];
    discussionRoom.finalizedChecklist = Array.isArray(data.finalizedChecklist) ? data.finalizedChecklist : [];
    discussionRoom.needsRefinement = Array.isArray(data.needsRefinement) ? data.needsRefinement : [];
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
    this.status = 'decided';
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
      checklistDraft: this.checklistDraft,
      checklist: this.checklist,
      finalizedChecklist: this.finalizedChecklist,
      needsRefinement: this.needsRefinement,
      // Decision fields
      finalDecision: this.finalDecision,
      rationale: this.rationale,
      confidence: this.confidence,
      selectedAgent: this.selectedAgent,
      voteBreakdown: this.voteBreakdown,
      conflictScore: this.conflictScore,
      decidedAt: this.decidedAt,
      // Manager decision fields
      managerDecisions: this.managerDecisions
    };
  }
}

module.exports = DiscussionRoom;

