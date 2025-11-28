const { v4: uuidv4 } = require('uuid');

class DebateRoom {
  constructor(sectorId, title, agentIds = []) {
    this.id = uuidv4();
    this.sectorId = sectorId;
    this.title = title;
    this.agentIds = agentIds;
    this.messages = [];
    this.status = 'in_progress';
    this.createdAt = new Date().toISOString();
    this.updatedAt = new Date().toISOString();
  }

  static fromData(data) {
    const debateRoom = new DebateRoom(data.sectorId, data.title, data.agentIds);
    debateRoom.id = data.id;
    debateRoom.messages = data.messages || [];
    // Map old status values to new ones for backward compatibility
    const statusMap = {
      'created': 'in_progress',
      'debating': 'in_progress',
      'closed': 'closed',
      'archived': 'archived'
    };
    debateRoom.status = statusMap[data.status] || data.status || 'in_progress';
    debateRoom.createdAt = data.createdAt;
    debateRoom.updatedAt = data.updatedAt;
    return debateRoom;
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
    this.updatedAt = new Date().toISOString();
  }

  toJSON() {
    return {
      id: this.id,
      sectorId: this.sectorId,
      title: this.title,
      agentIds: this.agentIds,
      messages: this.messages,
      status: this.status,
      createdAt: this.createdAt,
      updatedAt: this.updatedAt
    };
  }
}

module.exports = DebateRoom;

