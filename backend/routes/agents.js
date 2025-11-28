const { loadAgents } = require('../utils/agentStorage');
const { createAgent } = require('../agents/pipeline/createAgent');
const { registry } = require('../utils/contract');
const { updateMorale } = require('../agents/morale');

// Simple logger
function log(message) {
  const timestamp = new Date().toISOString();
  console.log(`[${timestamp}] ${message}`);
}

module.exports = async (fastify) => {
  // GET /api/agents - Returns agents with defaults
  fastify.get('/', async (request, reply) => {
    try {
      log('GET /api/agents - Fetching enriched agents');
      const agents = await loadAgents();

      const enrichedAgents = agents.map(agent => ({
        ...agent,
        status: agent.status || 'idle',
        performance: agent.performance || { pnl: 0, winRate: 0 },
        trades: agent.trades || []
      }));

      return reply.status(200).send(enrichedAgents);
    } catch (error) {
      log(`Error fetching agents: ${error.message}`);
      return reply.status(500).send({ error: error.message });
    }
  });

  // GET /api/agents/:id - Returns a single agent
  fastify.get('/:id', async (request, reply) => {
    try {
      const { id } = request.params;
      log(`GET /api/agents/${id} - Fetching single agent`);

      const agent = (await loadAgents()).find(a => a.id === id);

      if (!agent) {
        log(`Agent ${id} not found`);
        return reply.code(404).send({ error: 'Agent not found' });
      }

      return reply.status(200).send(agent);
    } catch (error) {
      log(`Error fetching agent: ${error.message}`);
      return reply.status(500).send({ error: error.message });
    }
  });

  // POST /agents/create - Create new agent
  fastify.post('/create', async (request, reply) => {
    try {
      const { prompt, sectorId } = request.body;

      log(`POST /agents/create - Creating agent with prompt: ${prompt}, sectorId: ${sectorId || 'null'}`);

      const agent = await createAgent(prompt, sectorId);

      log(`Agent created successfully - ID: ${agent.id}, Role: ${agent.role}`);

      // Auto-sync to chain
      if (!process.env.MAX_REGISTRY) {
        console.warn("MAX_REGISTRY undefined — skipping chain sync");
      } else {
        try {
          const agentId = parseInt(agent.id) || 0;
          const agentSectorId = parseInt(agent.sectorId) || 0;
          const role = agent.role || '';
          
          await registry.write.registerAgent([agentId, agentSectorId, role]);
          log(`Agent ${agentId} registered on-chain`);
        } catch (chainError) {
          log(`Warning: Failed to register agent on-chain: ${chainError.message}`);
          // Don't fail the request if chain registration fails
        }
      }

      return reply.status(201).send({
        success: true,
        data: agent.toJSON()
      });
    } catch (error) {
      log(`Error creating agent: ${error.message}`);

      return reply.status(400).send({
        success: false,
        error: error.message
      });
    }
  });

  // POST /api/agents/:id/morale - Adjust agent morale
  fastify.post('/:id/morale', async (request, reply) => {
    try {
      const { id } = request.params;
      const { delta } = request.body;

      log(`POST /api/agents/${id}/morale - Adjusting morale by ${delta}`);

      if (typeof delta !== 'number') {
        return reply.status(400).send({ error: 'delta must be a number' });
      }

      const result = await updateMorale(id, delta);

      // Load and return updated agent
      const agents = await loadAgents();
      const agent = agents.find(a => a.id === id);

      if (!agent) {
        return reply.status(404).send({ error: 'Agent not found' });
      }

      return reply.status(200).send({
        success: true,
        data: agent,
        morale: result.morale,
        status: result.status
      });
    } catch (error) {
      log(`Error adjusting agent morale: ${error.message}`);
      return reply.status(500).send({ error: error.message });
    }
  });
};
