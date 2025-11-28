const { randomUUID } = require('crypto');
const fs = require('fs').promises;
const path = require('path');

const DEFAULT_PERFORMANCE = Object.freeze({ pnl: 0, winRate: 0 });
const DEFAULT_PERSONALITY = Object.freeze({ riskTolerance: 'medium', decisionStyle: 'balanced' });
const DEFAULT_MORALE = 50;

function sanitizePerformance(performance = DEFAULT_PERFORMANCE) {
  return {
    pnl: typeof performance.pnl === 'number' ? performance.pnl : 0,
    winRate: typeof performance.winRate === 'number' ? performance.winRate : 0
  };
}

function sanitizePersonality(personality = DEFAULT_PERSONALITY) {
  return {
    riskTolerance: personality?.riskTolerance || DEFAULT_PERSONALITY.riskTolerance,
    decisionStyle: personality?.decisionStyle || DEFAULT_PERSONALITY.decisionStyle
  };
}

class Agent {
  constructor({
    id = randomUUID(),
    name,
    role = 'general',
    sectorId = null,
    sectorSymbol = 'GEN',
    sectorName = 'General',
    status = 'idle',
    performance = DEFAULT_PERFORMANCE,
    trades = [],
    personality = DEFAULT_PERSONALITY,
    morale = DEFAULT_MORALE,
    lastRewardTimestamp = null,
    createdAt = null
  }) {
    if (!name || typeof name !== 'string' || !name.trim()) {
      throw new Error('Agent name is required');
    }

    if (!role || typeof role !== 'string' || !role.trim()) {
      throw new Error('Agent role is required');
    }

    this.id = id;
    this.name = name.trim();
    this.role = role.trim();
    this.sectorId = sectorId;
    this.sectorSymbol = sectorSymbol;
    this.sectorName = sectorName;
    this.status = status;
    this.performance = sanitizePerformance(performance);
    this.trades = Array.isArray(trades) ? trades : [];
    this.personality = sanitizePersonality(personality);
    this.morale = typeof morale === 'number' ? Math.max(0, Math.min(100, morale)) : DEFAULT_MORALE;
    this.lastRewardTimestamp = lastRewardTimestamp || null;
    this.createdAt = createdAt || new Date().toISOString();
  }

  getSummary() {
    return {
      id: this.id,
      name: this.name,
      role: this.role,
      sectorId: this.sectorId,
      sectorSymbol: this.sectorSymbol,
      sectorName: this.sectorName,
      status: this.status,
      performance: this.performance,
      trades: this.trades,
      personality: this.personality,
      morale: this.morale,
      lastRewardTimestamp: this.lastRewardTimestamp,
      createdAt: this.createdAt
    };
  }

  toJSON() {
    return this.getSummary();
  }

  async saveToJSON(storagePath = null) {
    const resolvedPath = storagePath || path.join(__dirname, '..', 'storage', 'agents.json');
    const storageDir = path.dirname(resolvedPath);

    try {
      await fs.mkdir(storageDir, { recursive: true });
    } catch (error) {
      if (error.code !== 'EEXIST') {
        throw error;
      }
    }

    let agents = [];
    try {
      const data = await fs.readFile(resolvedPath, 'utf8');
      agents = JSON.parse(data);
    } catch (error) {
      if (error.code !== 'ENOENT') {
        throw error;
      }
    }

    const agentData = this.toJSON();
    const existingIndex = agents.findIndex(entry => entry.id === this.id);

    if (existingIndex >= 0) {
      agents[existingIndex] = agentData;
    } else {
      agents.push(agentData);
    }

    await fs.writeFile(resolvedPath, JSON.stringify(agents, null, 2), 'utf8');
  }

  static async loadAllAgents(storagePath = null) {
    const resolvedPath = storagePath || path.join(__dirname, '..', 'storage', 'agents.json');

    try {
      const data = await fs.readFile(resolvedPath, 'utf8');
      const agentsData = JSON.parse(data);
      return agentsData.map(entry => Agent.fromData(entry));
    } catch (error) {
      if (error.code === 'ENOENT') {
        return [];
      }
      throw error;
    }
  }

  static fromData(data = {}) {
    return new Agent({
      id: data.id,
      name: data.name,
      role: data.role,
      sectorId: data.sectorId ?? null,
      sectorSymbol: data.sectorSymbol || 'GEN',
      sectorName: data.sectorName || 'General',
      status: data.status || 'idle',
      performance: data.performance || DEFAULT_PERFORMANCE,
      trades: data.trades || [],
      personality: data.personality || DEFAULT_PERSONALITY,
      morale: data.morale ?? DEFAULT_MORALE,
      lastRewardTimestamp: data.lastRewardTimestamp || null,
      createdAt: data.createdAt
    });
  }
}

module.exports = Agent;


