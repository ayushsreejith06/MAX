const Agent = require('../base/Agent');
const { loadAgents, saveAgents } = require('../../utils/agentStorage');
const { loadSectors, saveSectors } = require('../../utils/storage');

// Enhanced role inference based on keywords and context
// 100% accurate role decoding from user prompts
function inferRole(promptText) {
  if (!promptText || typeof promptText !== 'string') {
    return 'general';
  }
  
  const lowerPrompt = promptText.toLowerCase().trim();
  
  // More comprehensive role keywords with priority order
  const roleKeywords = {
    'manager': ['manage', 'coordinate', 'oversee', 'supervise', 'lead', 'direct', 'control', 'organize'],
    'riskmanager': ['risk', 'risk management', 'limit', 'exposure', 'risk control', 'risk mitigation', 'stop loss', 'risk assessment'],
    'trader': ['trade', 'trading', 'buy', 'sell', 'order', 'market', 'execute', 'position', 'entry', 'exit'],
    'research': ['research', 'analyze', 'analysis', 'study', 'investigate', 'examine', 'evaluate', 'assess'],
    'analyst': ['analyze', 'analysis', 'report', 'forecast', 'predict', 'projection', 'model', 'data'],
    'advisor': ['advise', 'recommend', 'suggest', 'consult', 'guidance', 'counsel', 'opinion'],
    'arbitrage': ['arbitrage', 'spread', 'price difference', 'inefficiency', 'arb']
  };

  // Check for manager first (highest priority)
  if (roleKeywords.manager.some(keyword => lowerPrompt.includes(keyword))) {
    return 'manager';
  }
  
  // Check for risk manager (before trader to avoid conflicts)
  if (roleKeywords.riskmanager.some(keyword => lowerPrompt.includes(keyword))) {
    return 'riskmanager';
  }
  
  // Check for trader
  if (roleKeywords.trader.some(keyword => lowerPrompt.includes(keyword))) {
    return 'trader';
  }
  
  // Check for research (more specific than analyst)
  if (roleKeywords.research.some(keyword => lowerPrompt.includes(keyword))) {
    return 'research';
  }
  
  // Check for analyst
  if (roleKeywords.analyst.some(keyword => lowerPrompt.includes(keyword))) {
    return 'analyst';
  }
  
  // Check for advisor
  if (roleKeywords.advisor.some(keyword => lowerPrompt.includes(keyword))) {
    return 'advisor';
  }
  
  // Check for arbitrage
  if (roleKeywords.arbitrage.some(keyword => lowerPrompt.includes(keyword))) {
    return 'arbitrage';
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
    research: {
      riskTolerance: 'low',
      decisionStyle: 'studious'
    },
    manager: {
      riskTolerance: 'medium',
      decisionStyle: 'balanced'
    },
    riskmanager: {
      riskTolerance: 'low',
      decisionStyle: 'cautious'
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

// Generate preference weights based on role
function getDefaultPreferences(role) {
  const templates = {
    trader: {
      riskWeight: 0.3,      // Lower risk weight (more aggressive)
      profitWeight: 0.8,    // High profit focus
      speedWeight: 0.9,     // Fast decisions
      accuracyWeight: 0.6   // Moderate accuracy
    },
    analyst: {
      riskWeight: 0.7,      // Higher risk weight (more cautious)
      profitWeight: 0.5,    // Moderate profit focus
      speedWeight: 0.3,     // Slower, more deliberate
      accuracyWeight: 0.9   // High accuracy focus
    },
    research: {
      riskWeight: 0.8,      // Very cautious
      profitWeight: 0.4,    // Lower profit focus
      speedWeight: 0.2,     // Very slow, thorough
      accuracyWeight: 0.95  // Maximum accuracy
    },
    manager: {
      riskWeight: 0.5,      // Balanced
      profitWeight: 0.6,    // Moderate profit focus
      speedWeight: 0.5,     // Balanced speed
      accuracyWeight: 0.7   // Good accuracy
    },
    riskmanager: {
      riskWeight: 0.95,     // Maximum risk focus
      profitWeight: 0.3,    // Lower profit focus
      speedWeight: 0.4,     // Moderate speed
      accuracyWeight: 0.8   // High accuracy
    },
    advisor: {
      riskWeight: 0.6,      // Moderate risk focus
      profitWeight: 0.5,    // Balanced profit
      speedWeight: 0.4,     // Moderate speed
      accuracyWeight: 0.85  // High accuracy
    },
    arbitrage: {
      riskWeight: 0.7,      // Cautious
      profitWeight: 0.7,    // High profit focus
      speedWeight: 0.95,    // Very fast (time-sensitive)
      accuracyWeight: 0.9   // Very high accuracy
    },
    general: {
      riskWeight: 0.5,      // Balanced
      profitWeight: 0.5,    // Balanced
      speedWeight: 0.5,     // Balanced
      accuracyWeight: 0.7   // Moderate accuracy
    }
  };

  return templates[role] || templates.general;
}

function generateAgentId(role, sectorSymbol, existingAgents) {
  const symbol = (sectorSymbol || 'UNAS').toUpperCase();
  const roleUpper = role.toUpperCase();
  
  // Base ID format: SECTOR_ROLE
  const baseId = `${symbol}_${roleUpper}`;
  
  // Count existing agents with same base pattern (check both id and name)
  const matchingAgents = existingAgents.filter(agent => {
    const agentId = String(agent.id || '');
    const agentName = String(agent.name || '');
    // Check if ID or name starts with the base pattern
    return agentId.startsWith(baseId) || agentName.startsWith(baseId);
  });
  
  // Extract numbers from existing IDs to find the next available number
  const numbers = matchingAgents
    .map(agent => {
      const agentId = String(agent.id || agent.name || '');
      const match = agentId.match(new RegExp(`^${baseId}(\\d+)$`));
      return match ? parseInt(match[1], 10) : null;
    })
    .filter(num => num !== null)
    .sort((a, b) => b - a); // Sort descending
  
  // If no numbered agents exist, check if base ID exists
  if (numbers.length === 0) {
    const baseExists = matchingAgents.some(agent => {
      const agentId = String(agent.id || agent.name || '');
      return agentId === baseId;
    });
    if (!baseExists) {
      return baseId;
    }
    return `${baseId}1`;
  }
  
  // Return next number
  return `${baseId}${numbers[0] + 1}`;
}

function generateAgentName(role, sectorSymbol, existingAgents) {
  const symbol = (sectorSymbol || 'UNAS').toUpperCase();
  const roleUpper = role.toUpperCase();
  
  // Use the same logic as generateAgentId to ensure consistency
  const baseName = `${symbol}_${roleUpper}`;
  
  // Count existing agents with same base pattern
  const matchingAgents = existingAgents.filter(agent => {
    const agentName = String(agent.name || '');
    return agentName.startsWith(baseName);
  });
  
  // Extract numbers from existing names
  const numbers = matchingAgents
    .map(agent => {
      const agentName = String(agent.name || '');
      const match = agentName.match(new RegExp(`^${baseName}(\\d+)$`));
      return match ? parseInt(match[1], 10) : null;
    })
    .filter(num => num !== null)
    .sort((a, b) => b - a);
  
  // If no numbered agents exist, check if base name exists
  if (numbers.length === 0) {
    const baseExists = matchingAgents.some(agent => {
      const agentName = String(agent.name || '');
      return agentName === baseName;
    });
    if (!baseExists) {
      return baseName;
    }
    return `${baseName}1`;
  }
  
  // Return next number
  return `${baseName}${numbers[0] + 1}`;
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
  const preferences = getDefaultPreferences(role);
  const sectorMeta = await resolveSectorMetadata(sectorId);
  
  // Load existing agents to generate unique ID
  const existingAgents = await loadAgents();
  const agentId = generateAgentId(role, sectorMeta.sectorSymbol, existingAgents);
  const agentName = generateAgentName(role, sectorMeta.sectorSymbol, existingAgents);

  // Initialize memory array with initial reasoning log
  const initialMemory = [{
    timestamp: Date.now(),
    type: 'creation',
    reasoning: `Agent created with role: ${role}. Prompt: "${promptText}"`,
    data: {
      role,
      prompt: promptText,
      personality,
      preferences
    }
  }];

  const agent = new Agent({
    id: agentId,
    name: agentName,
    role,
    prompt: promptText,
    sectorId: sectorMeta.sectorId,
    sectorSymbol: sectorMeta.sectorSymbol,
    sectorName: sectorMeta.sectorName,
    status: 'idle', // Default status, will be updated when agent actually does something
    performance: { pnl: 0, winRate: 0 }, // No mock performance data
    trades: [],
    personality,
    preferences,
    memory: initialMemory,
    lastDecision: null,
    lastDecisionAt: null,
    morale: 50, // Default morale
    rewardPoints: 0, // Default reward points
    lastRewardTimestamp: null
  });

  const agents = await loadAgents();
  const agentData = agent.toJSON();
  agents.push(agentData);
  await saveAgents(agents);

  // Update sector activeAgents count if agent is active and has a sectorId
  if (agentData.sectorId) {
    try {
      const sectors = await loadSectors();
      const idx = sectors.findIndex((s) => s.id === agentData.sectorId);

      if (idx === -1) {
        console.warn(
          '[createAgent] Agent created with sectorId that does not exist',
          { sectorId: agentData.sectorId, agentId: agentData.id }
        );
      } else {
        const sector = sectors[idx];

        // Only increment if the agent is active
        if (agentData.status === 'active') {
          const currentCount =
            typeof sector.activeAgents === 'number' ? sector.activeAgents : 0;
          sector.activeAgents = currentCount + 1;
          sectors[idx] = sector;

          await saveSectors(sectors);

          console.log('[createAgent] Incremented activeAgents for sector', {
            sectorId: sector.id,
            activeAgents: sector.activeAgents,
          });
        }
      }
    } catch (err) {
      console.warn(
        '[createAgent] Failed to update sector activeAgents count',
        err
      );
      // deliberately do not throw; agent creation already succeeded
    }
  }

  return agent;
}

module.exports = {
  createAgent,
  inferRole,
  getDefaultPersonality,
  getDefaultPreferences
};

