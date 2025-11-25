const { randomUUID } = require('crypto');
const fs = require('fs').promises;
const path = require('path');

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

  async saveToJSON(storagePath = null) {
    // Default to standard agents.json path if not provided
    if (!storagePath) {
      storagePath = path.join(__dirname, '..', '..', 'storage', 'agents.json');
    }

    // Ensure storage directory exists
    const storageDir = path.dirname(storagePath);
    try {
      await fs.mkdir(storageDir, { recursive: true });
    } catch (error) {
      if (error.code !== 'EEXIST') {
        throw error;
      }
    }

    // Load existing agents
    let agents = [];
    try {
      const data = await fs.readFile(storagePath, 'utf8');
      agents = JSON.parse(data);
    } catch (error) {
      if (error.code !== 'ENOENT') {
        throw error;
      }
      // File doesn't exist, start with empty array
    }

    // Find existing agent by ID and update, or add new
    const existingIndex = agents.findIndex(a => a.id === this.id);
    const agentData = this.toJSON();

    if (existingIndex >= 0) {
      agents[existingIndex] = agentData;
    } else {
      agents.push(agentData);
    }

    // Save back to file
    await fs.writeFile(storagePath, JSON.stringify(agents, null, 2), 'utf8');
  }

  static fromData(data) {
    const agent = new Agent(data.id, data.role, data.personality, data.sectorId);
    agent.memory = data.memory || [];
    agent.createdAt = data.createdAt;
    return agent;
  }
}

module.exports = Agent;

