const { v4: uuidv4 } = require('uuid');

class DiscussionRoom {
  constructor({ id, sectorId, title, agentIds = [], messages = [], status = "open", createdAt, updatedAt }) {
    this.id = id || uuidv4();
    this.sectorId = sectorId;
    this.title = title;
    this.agentIds = agentIds;
    this.messages = messages;
    this.status = status;
    this.createdAt = createdAt || new Date().toISOString();
    this.updatedAt = updatedAt || new Date().toISOString();
  }

  static fromData(data) {
    return new DiscussionRoom({
      id: data.id,
      sectorId: data.sectorId,
      title: data.title,
      agentIds: data.agentIds || [],
      messages: data.messages || [],
      status: data.status || "open",
      createdAt: data.createdAt,
      updatedAt: data.updatedAt
    });
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

module.exports = DiscussionRoom;

