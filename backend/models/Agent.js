const { randomUUID } = require('crypto');
const fs = require('fs').promises;
const path = require('path');

const DEFAULT_PERFORMANCE = Object.freeze({ pnl: 0, winRate: 0 });
const DEFAULT_PERSONALITY = Object.freeze({ riskTolerance: 'medium', decisionStyle: 'balanced' });
const DEFAULT_MORALE = 50;
const DEFAULT_REWARD_POINTS = 0;
const DEFAULT_CONFIDENCE = 0;
const DEFAULT_INITIAL_CONFIDENCE = 50;
const STYLE_OPTIONS = ['Aggressive', 'Balanced', 'Defensive'];
const RISK_OPTIONS = ['low', 'medium', 'high'];
const DEFAULT_PREFERENCES = Object.freeze({
  riskWeight: 0.5,
  profitWeight: 0.5,
  speedWeight: 0.5,
  accuracyWeight: 0.5
});

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

function sanitizePreferences(preferences = DEFAULT_PREFERENCES) {
  return {
    riskWeight: typeof preferences.riskWeight === 'number' ? preferences.riskWeight : DEFAULT_PREFERENCES.riskWeight,
    profitWeight: typeof preferences.profitWeight === 'number' ? preferences.profitWeight : DEFAULT_PREFERENCES.profitWeight,
    speedWeight: typeof preferences.speedWeight === 'number' ? preferences.speedWeight : DEFAULT_PREFERENCES.speedWeight,
    accuracyWeight: typeof preferences.accuracyWeight === 'number' ? preferences.accuracyWeight : DEFAULT_PREFERENCES.accuracyWeight
  };
}

function normalizeDisplayName(name, fallback = 'Agent') {
  if (typeof name === 'string' && name.trim()) {
    return name.trim();
  }
  return fallback;
}

function normalizeStyle(style = 'Balanced') {
  if (typeof style !== 'string') {
    return 'Balanced';
  }
  const title = style.trim().charAt(0).toUpperCase() + style.trim().slice(1).toLowerCase();
  return STYLE_OPTIONS.includes(title) ? title : 'Balanced';
}

function normalizeRiskTolerance(risk = 'medium') {
  if (typeof risk !== 'string') {
    return 'medium';
  }
  const normalized = risk.trim().toLowerCase();
  return RISK_OPTIONS.includes(normalized) ? normalized : 'medium';
}

function clampInitialConfidence(value = DEFAULT_INITIAL_CONFIDENCE) {
  if (typeof value !== 'number' || Number.isNaN(value)) {
    return DEFAULT_INITIAL_CONFIDENCE;
  }
  return Math.min(100, Math.max(0, value));
}

class Agent {
  constructor({
    id = randomUUID(),
    name,
    displayName,
    role = 'general',
    style = 'Balanced',
    riskTolerance = 'medium',
    shortBio = '',
    initialConfidence = DEFAULT_INITIAL_CONFIDENCE,
    prompt = '',
    sectorId = null,
    sectorSymbol = 'GEN',
    sectorName = 'General',
    status = 'idle',
    performance = DEFAULT_PERFORMANCE,
    trades = [],
    personality = DEFAULT_PERSONALITY,
    preferences = DEFAULT_PREFERENCES,
    memory = [],
    lastDecision = null,
    lastDecisionAt = null,
    morale = DEFAULT_MORALE,
    rewardPoints = DEFAULT_REWARD_POINTS,
    lastRewardTimestamp = null,
    confidence = DEFAULT_CONFIDENCE,
    executionList = [],
    createdAt = null
  }) {
    const normalizedName = normalizeDisplayName(name || displayName);
    if (!normalizedName) {
      throw new Error('Agent name is required');
    }

    if (!role || typeof role !== 'string' || !role.trim()) {
      throw new Error('Agent role is required');
    }

    const normalizedDisplayName = normalizeDisplayName(displayName || name, normalizedName);
    const normalizedStyle = normalizeStyle(style);
    const normalizedRiskTolerance = normalizeRiskTolerance(riskTolerance);
    const normalizedInitialConfidence = clampInitialConfidence(initialConfidence);

    this.id = id;
    this.name = normalizedName;
    this.displayName = normalizedDisplayName;
    this.role = role.trim();
    this.style = normalizedStyle;
    this.riskTolerance = normalizedRiskTolerance;
    this.shortBio = typeof shortBio === 'string' ? shortBio.trim() : '';
    this.initialConfidence = normalizedInitialConfidence;
    this.prompt = typeof prompt === 'string' ? prompt : '';
    this.sectorId = sectorId;
    this.sectorSymbol = sectorSymbol;
    this.sectorName = sectorName;
    this.status = status;
    this.performance = sanitizePerformance(performance);
    this.trades = Array.isArray(trades) ? trades : [];
    this.personality = sanitizePersonality({
      ...personality,
      riskTolerance: normalizedRiskTolerance
    });
    this.preferences = sanitizePreferences(preferences);
    this.memory = Array.isArray(memory) ? memory : [];
    this.lastDecision = lastDecision || null;
    this.lastDecisionAt = lastDecisionAt || null;
    this.morale = typeof morale === 'number' ? Math.max(0, Math.min(100, morale)) : DEFAULT_MORALE;
    this.rewardPoints = typeof rewardPoints === 'number' ? Math.max(0, rewardPoints) : DEFAULT_REWARD_POINTS;
    this.lastRewardTimestamp = lastRewardTimestamp || null;
    const rawConfidence = typeof confidence === 'number' ? confidence : normalizedInitialConfidence;
    this.confidence = typeof rawConfidence === 'number' ? Math.max(-100, Math.min(100, rawConfidence)) : DEFAULT_CONFIDENCE;
    this.executionList = Array.isArray(executionList) ? executionList : [];
    this.createdAt = createdAt || new Date().toISOString();
  }

  getSummary() {
    return {
      id: this.id,
      name: this.name,
      displayName: this.displayName,
      role: this.role,
      style: this.style,
      riskTolerance: this.riskTolerance,
      shortBio: this.shortBio,
      initialConfidence: this.initialConfidence,
      prompt: this.prompt,
      sectorId: this.sectorId,
      sectorSymbol: this.sectorSymbol,
      sectorName: this.sectorName,
      status: this.status,
      performance: this.performance,
      trades: this.trades,
      personality: this.personality,
      preferences: this.preferences,
      memory: this.memory,
      lastDecision: this.lastDecision,
      lastDecisionAt: this.lastDecisionAt,
      morale: this.morale,
      rewardPoints: this.rewardPoints,
      lastRewardTimestamp: this.lastRewardTimestamp,
      confidence: this.confidence,
      executionList: this.executionList,
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
      displayName: data.displayName || data.name,
      role: data.role,
      style: data.style,
      riskTolerance: data.riskTolerance,
      shortBio: data.shortBio,
      initialConfidence: data.initialConfidence,
      prompt: data.prompt || '',
      sectorId: data.sectorId ?? null,
      sectorSymbol: data.sectorSymbol || 'GEN',
      sectorName: data.sectorName || 'General',
      status: data.status || 'idle',
      performance: data.performance || DEFAULT_PERFORMANCE,
      trades: data.trades || [],
      personality: data.personality || DEFAULT_PERSONALITY,
      preferences: data.preferences || DEFAULT_PREFERENCES,
      memory: data.memory || [],
      lastDecision: data.lastDecision || null,
      lastDecisionAt: data.lastDecisionAt || null,
      morale: data.morale ?? DEFAULT_MORALE,
      rewardPoints: data.rewardPoints ?? DEFAULT_REWARD_POINTS,
      lastRewardTimestamp: data.lastRewardTimestamp || null,
      confidence: data.confidence ?? DEFAULT_CONFIDENCE,
      executionList: data.executionList || [],
      createdAt: data.createdAt
    });
  }
}

module.exports = Agent;


