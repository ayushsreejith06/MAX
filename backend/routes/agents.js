const { getAgents } = require('../controllers/agentsController');
const { createAgent } = require('../agents/pipeline/createAgent');

// Simple logger
function log(message) {
  const timestamp = new Date().toISOString();
  console.log(`[${timestamp}] ${message}`);
}

module.exports = async (fastify) => {
  fastify.get('/', async (request, reply) => {
    try {
      log(`GET /agents - Fetching all agents`);
      const agents = await getAgents();
      log(`Found ${agents.length} agents`);
      return {
        success: true,
        data: agents
      };
    } catch (error) {
      log(`Error fetching agents: ${error.message}`);
      reply.code(500);
      return {
        success: false,
        error: error.message
      };
    }
  });

  fastify.post('/create', async (request, reply) => {
    try {
      const { prompt, sectorId } = request.body;
      
      if (!prompt) {
        log(`POST /agents/create - Missing required field: prompt`);
        reply.code(400);
        return {
          success: false,
          error: 'Missing required field: prompt'
        };
      }
      
      log(`POST /agents/create - Creating agent with prompt: ${prompt.substring(0, 50)}...`);
      const agent = await createAgent(prompt, sectorId || null);
      log(`Agent created successfully with ID: ${agent.id}`);
      
      reply.code(201);
      return {
        success: true,
        data: agent.toJSON()
      };
    } catch (error) {
      log(`Error creating agent: ${error.message}`);
      reply.code(500);
      return {
        success: false,
        error: error.message
      };
    }
  });
};
