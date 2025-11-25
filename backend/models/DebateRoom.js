const { v4: uuidv4 } = require('uuid');

class DebateRoom {
  constructor(sectorId, title, agentIds = []) {
    this.id = uuidv4();
    this.sectorId = sectorId;
    this.title = title;
    this.agentIds = agentIds;
    this.messages = [];
    this.status = 'created';
    this.createdAt = new Date().toISOString();
    this.updatedAt = new Date().toISOString();
  }

  static fromData(data) {
    const debateRoom = new DebateRoom(data.sectorId, data.title, data.agentIds);
    debateRoom.id = data.id;
    debateRoom.messages = data.messages || [];
    debateRoom.status = data.status || 'created';
    debateRoom.createdAt = data.createdAt;
    debateRoom.updatedAt = data.updatedAt;
    return debateRoom;
  }

  addMessage(message) {
    const messageEntry = {
      agentId: message.agentId,
      content: message.content,
      role: message.role,
      createdAt: new Date().toISOString()
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

