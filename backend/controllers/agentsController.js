const { loadAgents } = require('../utils/agentStorage');

async function getAgents(sectorId = null) {
  const agents = await loadAgents();
  if (sectorId) {
    return agents.filter(agent => agent.sectorId === sectorId);
  }
  return agents;
}

module.exports = {
  getAgents
};
