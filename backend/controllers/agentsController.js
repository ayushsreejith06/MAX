const { loadAgents } = require('../utils/agentStorage');

async function getAgents() {
  const agents = await loadAgents();
  return agents;
}

module.exports = {
  getAgents
};
