const { getAgents } = require('../controllers/agentsController');

// Simple logger
function log(message) {
  const timestamp = new Date().toISOString();
  console.log(`[${timestamp}] ${message}`);
}

module.exports = async (fastify) => {
  // GET /agents - Get all agents or filter by sectorId
  fastify.get('/', async (request, reply) => {
    try {
      const { sectorId } = request.query;
      
      if (sectorId) {
        log(`GET /agents - Fetching agents for sectorId: ${sectorId}`);
      } else {
        log(`GET /agents - Fetching all agents`);
      }
      
      let agents = await getAgents();
      
      // Filter by sectorId if provided
      if (sectorId) {
        agents = agents.filter(agent => agent.sectorId === sectorId);
        log(`Found ${agents.length} agents for sectorId: ${sectorId}`);
      } else {
        log(`Found ${agents.length} agents`);
      }
      
      return reply.status(200).send({
        success: true,
        data: agents
      });
    } catch (error) {
      log(`Error fetching agents: ${error.message}`);
      return reply.status(500).send({
        success: false,
        error: error.message
      });
    }
  });
};
