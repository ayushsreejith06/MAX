const { v4: uuidv4 } = require("uuid");

class DebateRoom {
  constructor({
    id = uuidv4(),
    sectorId,
    title,
    agentIds = [],
    messages = [],
    status = "created",
    createdAt = new Date().toISOString(),
    updatedAt = new Date().toISOString(),
  } = {}) {
    this.id = id;
    this.sectorId = sectorId;
    this.title = title;
    this.agentIds = agentIds;
    this.messages = messages;
    this.status = status;
    this.createdAt = createdAt;
    this.updatedAt = updatedAt;
  }

  static fromData(data) {
    return new DebateRoom({
      id: data.id,
      sectorId: data.sectorId,
      title: data.title,
      agentIds: data.agentIds || [],
      messages: data.messages || [],
      status: data.status || "created",
      createdAt: data.createdAt,
      updatedAt: data.updatedAt,
    });
  }

  addMessage(message) {
    const entry = {
      agentId: message.agentId,
      content: message.content,
      role: message.role,
      createdAt: new Date().toISOString(),
    };

    this.messages.push(entry);
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
      updatedAt: this.updatedAt,
    };
  }
}

module.exports = DebateRoom;
