const { v4: uuidv4 } = require('uuid');

class DiscussionRoom {
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
    const discussionRoom = new DiscussionRoom(data.sectorId, data.title, data.agentIds);
    discussionRoom.id = data.id;
    discussionRoom.messages = data.messages || [];
    discussionRoom.status = data.status || 'created';
    discussionRoom.createdAt = data.createdAt;
    discussionRoom.updatedAt = data.updatedAt;
    return discussionRoom;
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

