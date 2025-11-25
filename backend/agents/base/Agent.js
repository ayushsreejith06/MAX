const { randomUUID } = require('crypto');

class Agent {
  constructor(id, role, personality, sectorId = null) {
    this.id = id || randomUUID();
    this.sectorId = sectorId;
    this.role = role;
    this.memory = [];
    this.personality = personality || {};
    this.createdAt = new Date().toISOString();
  }

  addMemory(memoryItem) {
    this.memory.push({
      ...memoryItem,
      timestamp: new Date().toISOString()
    });
  }

  getSummary() {
    return {
      id: this.id,
      sectorId: this.sectorId,
      role: this.role,
      memoryCount: this.memory.length,
      personality: this.personality,
      createdAt: this.createdAt
    };
  }

  toJSON() {
    return {
      id: this.id,
      sectorId: this.sectorId,
      role: this.role,
      memory: this.memory,
      personality: this.personality,
      createdAt: this.createdAt
    };
  }

  static fromData(data) {
    const agent = new Agent(data.id, data.role, data.personality, data.sectorId);
    agent.memory = data.memory || [];
    agent.createdAt = data.createdAt;
    return agent;
  }
}

module.exports = Agent;

