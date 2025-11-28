const Agent = require('../base/Agent');
const { loadAgents, saveAgents } = require('../../utils/agentStorage');
const { loadSectors } = require('../../utils/storage');

// Simple role inference based on keywords
function inferRole(promptText) {
  const lowerPrompt = promptText.toLowerCase();
  
  const roleKeywords = {
    'trader': ['trade', 'trading', 'buy', 'sell', 'order', 'market'],
    'analyst': ['analyze', 'analysis', 'research', 'report', 'forecast', 'predict'],
    'manager': ['manage', 'coordinate', 'oversee', 'supervise', 'lead'],
    'advisor': ['advise', 'recommend', 'suggest', 'consult', 'guidance'],
    'arbitrage': ['arbitrage', 'spread', 'price difference', 'inefficiency']
  };

  for (const [role, keywords] of Object.entries(roleKeywords)) {
    if (keywords.some(keyword => lowerPrompt.includes(keyword))) {
      return role;
    }
  }

  return 'general'; // default role
}

const STATUS_POOL = ['idle', 'active', 'processing'];

function getDefaultPersonality(role) {
  const templates = {
    trader: {
      riskTolerance: 'high',
      decisionStyle: 'rapid'
    },
    analyst: {
      riskTolerance: 'low',
      decisionStyle: 'studious'
    },
    manager: {
      riskTolerance: 'medium',
      decisionStyle: 'balanced'
    },
    advisor: {
      riskTolerance: 'medium',
      decisionStyle: 'deliberate'
    },
    arbitrage: {
      riskTolerance: 'low',
      decisionStyle: 'precise'
    },
    general: {
      riskTolerance: 'medium',
      decisionStyle: 'balanced'
    }
  };

  return templates[role] || templates.general;
}

function generateAgentName(role, sectorSymbol) {
  const symbol = sectorSymbol || 'UNAS';
  if (role === 'manager') {
    return `${symbol}_manager`;
  }
  return `${symbol}_${role}`;
}

async function resolveSectorMetadata(sectorId) {
  if (!sectorId) {
    return {
      sectorId: null,
      sectorName: 'Unassigned',
      sectorSymbol: 'UNAS'
    };
  }

  const sectors = await loadSectors();
  const sector = sectors.find(s => s.id === sectorId);

  if (!sector) {
    return {
      sectorId: null,
      sectorName: 'Unassigned',
      sectorSymbol: 'UNAS'
    };
  }

  const preferredName = sector.sectorName || sector.name || 'Unknown Sector';
  const preferredSymbol = sector.sectorSymbol || sector.symbol || preferredName.slice(0, 4).toUpperCase();

  return {
    sectorId: sector.id,
    sectorName: preferredName,
    sectorSymbol: preferredSymbol
  };
}

async function createAgent(promptText = '', sectorId = null) {
  const role = inferRole(promptText);
  const personality = getDefaultPersonality(role);
  const sectorMeta = await resolveSectorMetadata(sectorId);

  const agent = new Agent({
    name: generateAgentName(role, sectorMeta.sectorSymbol),
    role,
    sectorId: sectorMeta.sectorId,
    sectorSymbol: sectorMeta.sectorSymbol,
    sectorName: sectorMeta.sectorName,
    status: 'idle', // Default status, will be updated when agent actually does something
    performance: { pnl: 0, winRate: 0 }, // No mock performance data
    trades: [],
    personality
  });

  const agents = await loadAgents();
  agents.push(agent.toJSON());
  await saveAgents(agents);

  return agent;
}

module.exports = {
  createAgent,
  inferRole,
  getDefaultPersonality
};

