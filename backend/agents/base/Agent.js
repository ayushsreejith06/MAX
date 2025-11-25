const { randomUUID } = require('crypto');

// UUID v4 validation regex
const UUID_REGEX = /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

function isValidUUID(uuid) {
  return typeof uuid === 'string' && UUID_REGEX.test(uuid);
}

class Agent {
  constructor(id, role, personality, sectorId = null) {
    // Validate role
    if (!role || typeof role !== 'string' || role.trim().length === 0) {
      throw new Error('Agent role is required and cannot be empty');
    }

    // Validate or generate ID
    if (id) {
      if (!isValidUUID(id)) {
        throw new Error(`Invalid UUID format: ${id}`);
      }
      this.id = id;
    } else {
      this.id = randomUUID();
    }

    this.sectorId = sectorId;
    this.role = role.trim();
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

