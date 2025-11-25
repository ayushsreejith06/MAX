const Agent = require('../base/Agent');
const { loadAgents, saveAgents } = require('../../utils/agentStorage');

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

// Default personality templates
function getDefaultPersonality(role) {
  const templates = {
    'trader': {
      riskTolerance: 'moderate',
      decisionStyle: 'quick',
      communicationStyle: 'direct'
    },
    'analyst': {
      riskTolerance: 'conservative',
      decisionStyle: 'thorough',
      communicationStyle: 'detailed'
    },
    'manager': {
      riskTolerance: 'balanced',
      decisionStyle: 'strategic',
      communicationStyle: 'authoritative'
    },
    'advisor': {
      riskTolerance: 'cautious',
      decisionStyle: 'deliberate',
      communicationStyle: 'persuasive'
    },
    'arbitrage': {
      riskTolerance: 'low',
      decisionStyle: 'precise',
      communicationStyle: 'technical'
    },
    'general': {
      riskTolerance: 'moderate',
      decisionStyle: 'balanced',
      communicationStyle: 'neutral'
    }
  };

  return templates[role] || templates['general'];
}

async function createAgent(promptText, sectorId = null) {
  // Infer role from prompt
  const role = inferRole(promptText);
  
  // Assign default personality template
  const personality = getDefaultPersonality(role);
  
  // Create new Agent instance
  const agent = new Agent(null, role, personality, sectorId);
  
  // Add initial memory from prompt
  agent.addMemory({
    type: 'creation',
    content: promptText
  });
  
  // Load existing agents
  const agents = await loadAgents();
  
  // Add new agent
  agents.push(agent.toJSON());
  
  // Save to JSON
  await saveAgents(agents);
  
  return agent;
}

module.exports = {
  createAgent,
  inferRole,
  getDefaultPersonality
};

