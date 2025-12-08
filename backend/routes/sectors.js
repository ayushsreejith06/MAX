const Sector = require('../models/Sector');
const Agent = require('../models/Agent');
const { getAllSectors, createSector, updateSector } = require('../utils/sectorStorage');
const { normalizeSectorRecord, getSectorById } = require('../controllers/sectorsController');
const { getSimulationEngine } = require('../simulation/SimulationEngine');
const { loadAgents, saveAgents } = require('../utils/agentStorage');
const { v4: uuidv4 } = require('uuid');

module.exports = async (fastify) => {
  // GET /sectors - List all sectors
  fastify.get('/', async (request, reply) => {
    try {
      const sectors = await getAllSectors();
      // Normalize all sectors to ensure sectorSymbol is included
      const normalizedSectors = sectors.map(sector => normalizeSectorRecord(sector));
      return reply.status(200).send(normalizedSectors);
    } catch (error) {
      return reply.status(500).send({
        error: error.message
      });
    }
  });

  // GET /sectors/:id - Get a single sector by ID
  fastify.get('/:id', async (request, reply) => {
    try {
      const { id } = request.params;
      const sector = await getSectorById(id);
      
      if (!sector) {
        return reply.status(404).send({
          error: 'Sector not found'
        });
      }
      
      // Enrich sector with all agents from agents.json that belong to this sector
      // This ensures we always show the latest agents, even if sector.agents is out of sync
      try {
        const allAgents = await loadAgents();
        const sectorAgents = allAgents.filter(agent => agent.sectorId === id);
        
        // Merge agents from agents.json with sector's stored agents array
        // Use a Map to deduplicate by agent ID, preferring agents.json data
        const agentMap = new Map();
        
        // First, add agents from sector.agents (stored in sector)
        if (Array.isArray(sector.agents)) {
          sector.agents.forEach(agent => {
            if (agent && agent.id) {
              agentMap.set(agent.id, agent);
            }
          });
        }
        
        // Then, add/update with agents from agents.json (source of truth)
        sectorAgents.forEach(agent => {
          if (agent && agent.id) {
            agentMap.set(agent.id, agent);
          }
        });
        
        // Update sector with merged agents array
        sector.agents = Array.from(agentMap.values());
        
        // Optionally sync back to storage (but don't block the response)
        if (sectorAgents.length !== (sector.agents?.length || 0)) {
          // Agents were added/removed, update sector storage in background
          updateSector(id, { agents: sector.agents }).catch(err => {
            console.warn(`[GET /sectors/:id] Failed to sync agents to sector storage:`, err.message);
          });
        }
      } catch (agentError) {
        console.warn(`[GET /sectors/:id] Failed to enrich agents:`, agentError.message);
        // Continue with sector.agents as-is if enrichment fails
      }
      
      return reply.status(200).send(sector);
    } catch (error) {
      return reply.status(500).send({
        error: error.message
      });
    }
  });

  // POST /sectors - Create a sector
  fastify.post('/', async (request, reply) => {
    try {
      const { name, sectorName, symbol, sectorSymbol, description, agents, performance } = request.body || {};

      // Extract sectorName and sectorSymbol from either field name
      const finalSectorName = (sectorName || name || '').trim();
      const finalSectorSymbol = (sectorSymbol || symbol || '').trim();

      // Create sector using the model
      const sector = new Sector({
        name: finalSectorName,
        description: description || '',
        agents: agents || [],
        performance: performance || {}
      });

      // Save to storage with sectorName and sectorSymbol
      const sectorData = {
        ...sector.toJSON(),
        sectorName: finalSectorName,
        sectorSymbol: finalSectorSymbol
      };
      const savedSector = await createSector(sectorData);

      // Auto-create manager agent - save to both agents.json and sector.agents
      const managerAgentId = uuidv4();
      const managerAgentName = `${finalSectorName} Manager`;
      
      const managerAgent = new Agent({
        id: managerAgentId,
        name: managerAgentName,
        role: 'manager',
        prompt: `Manager agent for ${finalSectorName} sector`,
        sectorId: savedSector.id,
        sectorSymbol: finalSectorSymbol,
        sectorName: finalSectorName,
        status: 'idle',
        performance: { pnl: 0, winRate: 0 },
        trades: [],
        personality: {
          riskTolerance: 'Balanced',
          decisionStyle: 'Analytical'
        },
        preferences: {},
        memory: [],
        morale: 50,
        rewardPoints: 0,
        createdAt: new Date().toISOString()
      });

      // Save manager agent to agents.json (so AgentRuntime can find it)
      const allAgents = await loadAgents();
      allAgents.push(managerAgent.toJSON());
      await saveAgents(allAgents);

      // Add manager agent to sector's agents array
      const managerAgentData = managerAgent.toJSON();
      const updatedAgents = [...(savedSector.agents || []), managerAgentData];

      // Update sector with manager agent, preserving sectorName and sectorSymbol
      const updatedSector = await updateSector(savedSector.id, {
        agents: updatedAgents,
        sectorName: finalSectorName,
        sectorSymbol: finalSectorSymbol
      });

      if (!updatedSector) {
        throw new Error('Failed to update sector with manager agent');
      }

      // Reload AgentRuntime to pick up the new manager agent
      try {
        const { getAgentRuntime } = require('../agents/runtime/agentRuntime');
        const agentRuntime = getAgentRuntime();
        await agentRuntime.reloadAgents();
      } catch (runtimeError) {
        console.warn('Warning: Failed to reload AgentRuntime after creating manager agent:', runtimeError.message);
        // Don't fail the request if runtime reload fails
      }

      return reply.status(201).send(updatedSector);
    } catch (error) {
      return reply.status(500).send({
        error: error.message
      });
    }
  });

  // POST /sectors/:id/simulate-tick - Run a simulation tick for a sector
  fastify.post('/:id/simulate-tick', async (request, reply) => {
    try {
      const { id: sectorId } = request.params;
      const { decisions = [] } = request.body || {};

      // Verify sector exists
      const sector = await getSectorById(sectorId);
      if (!sector) {
        return reply.status(404).send({
          success: false,
          error: 'Sector not found'
        });
      }

      // Get simulation engine
      const simulationEngine = getSimulationEngine();

      // Initialize sector in simulation engine if not already initialized
      let sectorState = simulationEngine.getSectorState(sectorId);
      if (!sectorState) {
        const initialPrice = sector.currentPrice || 100;
        const volatility = sector.volatility || 0.02;
        sectorState = await simulationEngine.initializeSector(sectorId, initialPrice, volatility);
      }

      // Run simulation tick
      const tickResult = await simulationEngine.simulateTick(sectorId, decisions || []);

      // Return result in format expected by frontend
      return reply.status(200).send({
        success: true,
        data: tickResult
      });
    } catch (error) {
      console.error(`Error running simulation tick for sector ${request.params.id}:`, error);
      return reply.status(500).send({
        success: false,
        error: error.message || 'Failed to run simulation tick'
      });
    }
  });

  // POST /sectors/:id/update-performance - Update sector performance metrics
  fastify.post('/:id/update-performance', async (request, reply) => {
    try {
      const { id: sectorId } = request.params;

      // Get updated sector data
      const sector = await getSectorById(sectorId);
      if (!sector) {
        return reply.status(404).send({
          success: false,
          error: 'Sector not found'
        });
      }

      // Return updated sector in format expected by frontend
      return reply.status(200).send({
        success: true,
        data: sector
      });
    } catch (error) {
      console.error(`Error updating performance for sector ${request.params.id}:`, error);
      return reply.status(500).send({
        success: false,
        error: error.message || 'Failed to update sector performance'
      });
    }
  });
};
