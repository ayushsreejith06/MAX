const { loadAgents, deleteAgent, updateAgent, saveAgents } = require('../utils/agentStorage');
const { createAgent } = require('../agents/pipeline/createAgent');
const { registry } = require('../utils/contract');
const { updateMorale } = require('../agents/morale');
const { getAllSectors, updateSector } = require('../utils/sectorStorage');
const { getAgentRuntime } = require('../agents/runtime/agentRuntime');
const Agent = require('../models/Agent');

// Optimize agent response for list view - only return minimal fields needed by UI
function optimizeAgentForList(agent) {
  // Extract performance as number (pnl) instead of full object
  const performance = typeof agent.performance === 'number' 
    ? agent.performance 
    : (agent.performance?.pnl || 0);
  
  // Extract trades count instead of full array
  const tradesCount = Array.isArray(agent.trades) 
    ? agent.trades.length 
    : (typeof agent.trades === 'number' ? agent.trades : 0);
  
  return {
    id: agent.id,
    name: agent.name || 'Unnamed Agent',
    role: agent.role || 'agent',
    status: agent.status || 'idle',
    confidence: typeof agent.confidence === 'number' ? agent.confidence : 0,
    performance: performance,
    trades: tradesCount,
    sectorId: agent.sectorId || null,
    sectorSymbol: agent.sectorSymbol || undefined,
    sectorName: agent.sectorName || undefined,
    personality: {
      riskTolerance: agent.personality?.riskTolerance || 'Unknown',
      decisionStyle: agent.personality?.decisionStyle || 'Unknown'
    }
  };
}

// Helper: deterministically map UUID -> uint-like BigInt
function uuidToUint(uuid) {
  if (typeof uuid !== 'string') {
    throw new Error('uuidToUint expects a string');
  }

  // Remove dashes and lower-case
  const hex = uuid.replace(/-/g, '').toLowerCase();

  // Take first 16 hex chars (64 bits) to keep it simple and safe
  const slice = hex.slice(0, 16) || '0';

  // Convert to BigInt from hex
  try {
    return BigInt('0x' + slice);
  } catch (err) {
    console.warn('Failed to convert UUID to uint, defaulting to 0n', { uuid, err });
    return 0n;
  }
}

// Simple logger
function log(message) {
  const timestamp = new Date().toISOString();
  console.log(`[${timestamp}] ${message}`);
}

module.exports = async (fastify) => {
  // GET /api/agents - Returns agents with defaults (optimized for list view)
  fastify.get('/', async (request, reply) => {
    try {
      log('GET /api/agents - Fetching enriched agents');
      let agents = await loadAgents();

      // Also check sectors for agents that might not be in agents.json yet
      // This ensures manager agents created with sectors are always included
      try {
        const sectors = await getAllSectors();
        const agentMap = new Map();
        const initialAgentCount = agents.length;
        
        // First, add all agents from agents.json
        agents.forEach(agent => {
          if (agent && agent.id) {
            agentMap.set(agent.id, agent);
          }
        });
        
        // Then, add any agents from sectors that aren't in agents.json
        sectors.forEach(sector => {
          if (Array.isArray(sector.agents)) {
            sector.agents.forEach(agent => {
              if (agent && agent.id && !agentMap.has(agent.id)) {
                // Agent exists in sector but not in agents.json - add it
                // Ensure agent has all required fields for optimizeAgentForList
                const enrichedAgent = {
                  ...agent,
                  name: agent.name || 'Unnamed Agent',
                  role: agent.role || 'agent',
                  status: agent.status || 'idle',
                  confidence: typeof agent.confidence === 'number' ? agent.confidence : 0,
                  performance: typeof agent.performance === 'number' ? agent.performance : (agent.performance?.pnl || 0),
                  trades: Array.isArray(agent.trades) ? agent.trades.length : (typeof agent.trades === 'number' ? agent.trades : 0),
                  sectorId: agent.sectorId || sector.id,
                  sectorSymbol: agent.sectorSymbol || sector.symbol,
                  sectorName: agent.sectorName || sector.name,
                };
                log(`Found agent ${enrichedAgent.id} (${enrichedAgent.name}) in sector ${sector.id} but not in agents.json, adding it`);
                agentMap.set(enrichedAgent.id, enrichedAgent);
              }
            });
          }
        });
        
        // Convert map back to array
        agents = Array.from(agentMap.values());
        
        // Log if we found additional agents
        if (agents.length > initialAgentCount) {
          log(`Enriched agents list: found ${agents.length - initialAgentCount} additional agent(s) from sectors (total: ${agents.length})`);
        }
        
        // Sync any missing agents back to agents.json (in background, don't block response)
        if (agents.length > initialAgentCount) {
          saveAgents(agents).catch(err => {
            console.warn(`[GET /api/agents] Failed to sync agents to storage:`, err.message);
          });
        }
      } catch (sectorError) {
        log(`Warning: Failed to enrich agents from sectors: ${sectorError.message}`);
        console.error('Sector enrichment error details:', sectorError);
        // Continue with agents.json data if sector enrichment fails
      }

      // Sort agents by ID to ensure stable ordering across requests
      const sortedAgents = [...agents].sort((a, b) => {
        if (a.id < b.id) return -1;
        if (a.id > b.id) return 1;
        return 0;
      });

      // Optimize response to only include minimal fields needed by UI
      const optimizedAgents = sortedAgents.map(agent => optimizeAgentForList(agent));

      return reply.status(200).send(optimizedAgents);
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

      return reply.status(200).send({
        ...agent,
        confidence: typeof agent.confidence === 'number' ? agent.confidence : 0
      });
    } catch (error) {
      log(`Error fetching agent: ${error.message}`);
      return reply.status(500).send({ error: error.message });
    }
  });

  // POST /api/agents - Create new agent
  fastify.post('/', async (request, reply) => {
    try {
      const { prompt, sectorId, role } = request.body;

      // Validate request body
      if (!prompt || typeof prompt !== 'string' || prompt.trim().length === 0) {
        return reply.status(400).send({
          success: false,
          error: 'prompt is required and must be a non-empty string'
        });
      }

      if (sectorId !== null && sectorId !== undefined && typeof sectorId !== 'string') {
        return reply.status(400).send({
          success: false,
          error: 'sectorId must be a string or null'
        });
      }

      if (role !== null && role !== undefined && typeof role !== 'string') {
        return reply.status(400).send({
          success: false,
          error: 'role must be a string or null'
        });
      }

      log(`POST /api/agents - Creating agent with prompt: ${prompt}, sectorId: ${sectorId || 'null'}, role: ${role || 'auto-detect'}`);

      const agent = await createAgent(prompt.trim(), sectorId || null, role || null);

      // Ensure agent is valid and has all required fields
      if (!agent || typeof agent.toJSON !== 'function') {
        throw new Error('createAgent returned invalid agent object');
      }

      const agentData = agent.toJSON();

      // Validate required fields
      if (!agentData.id || !agentData.name || !agentData.role) {
        throw new Error('Created agent is missing required fields (id, name, or role)');
      }

      log(`Agent created successfully - ID: ${agentData.id}, Name: ${agentData.name}, Role: ${agentData.role}`);

      // If this is a manager agent, reload it into the runtime
      if (agentData.role === 'manager' || agentData.role?.toLowerCase().includes('manager')) {
        try {
          const { getAgentRuntime } = require('../agents/runtime/agentRuntime');
          const agentRuntime = getAgentRuntime();
          await agentRuntime.reloadAgents();
          log(`Manager agent ${agentData.id} reloaded into runtime`);
        } catch (runtimeError) {
          log(`Warning: Failed to reload agent into runtime: ${runtimeError.message}`);
          // Don't fail the request if runtime reload fails
        }
      }

      // Auto-sync to chain
      if (!process.env.MAX_REGISTRY) {
        console.warn("MAX_REGISTRY undefined — skipping chain sync");
      } else {
        try {
          const onChainAgentId = uuidToUint(agentData.id);
          const onChainSectorId = agentData.sectorId ? uuidToUint(agentData.sectorId) : 0n;
          const roleForChain = agentData.role || agentData.name || 'agent';

          console.log('[agents] registerAgent on-chain', {
            uuid: agentData.id,
            onChainAgentId: onChainAgentId.toString(),
            sectorUuid: agentData.sectorId || null,
            onChainSectorId: onChainSectorId.toString(),
            role: roleForChain,
          });
          
          await registry.write.registerAgent([onChainAgentId, onChainSectorId, roleForChain]);
          log(`Agent ${onChainAgentId.toString()} (UUID: ${agentData.id}) registered on-chain`);
        } catch (chainError) {
          log(`Warning: Failed to register agent on-chain: ${chainError.message}`);
          // Don't fail the request if chain registration fails
        }
      }

      // Return the newly created agent
      return reply.status(201).send(agentData);
    } catch (error) {
      log(`Error creating agent: ${error.message}`);

      return reply.status(400).send({
        success: false,
        error: error.message
      });
    }
  });

  // DELETE /api/agents/:id - Delete an agent (manager agents cannot be deleted)
  // Note: This route must come before POST /:id/morale to avoid route conflicts
  fastify.delete('/:id', {
    schema: {
      params: {
        type: 'object',
        properties: {
          id: { type: 'string' }
        },
        required: ['id']
      }
    }
  }, async (request, reply) => {
    try {
      const { id } = request.params;
      log(`DELETE /api/agents/${id} - Attempting to delete agent`);

      // Load the agent first to check if it's a manager
      const agents = await loadAgents();
      const agent = agents.find(a => a.id === id);

      if (!agent) {
        log(`Agent ${id} not found`);
        return reply.status(404).send({ error: 'Agent not found' });
      }

      // Check if agent is a manager (prevent deletion)
      const isManager = agent.role === 'manager' || 
                       (agent.role && agent.role.toLowerCase().includes('manager'));
      
      if (isManager) {
        log(`Attempted to delete manager agent ${id} - blocked`);
        return reply.status(403).send({ 
          error: 'Manager agents cannot be deleted' 
        });
      }

      // Remove agent from its sector if it has one
      if (agent.sectorId) {
        try {
          const sectors = await getAllSectors();
          const sector = sectors.find(s => s.id === agent.sectorId);
          
          if (sector && Array.isArray(sector.agents)) {
            const updatedAgents = sector.agents.filter(a => a && a.id !== id);
            await updateSector(sector.id, { agents: updatedAgents });
            log(`Removed agent ${id} from sector ${sector.id}`);
          }
        } catch (sectorError) {
          log(`Warning: Failed to remove agent from sector: ${sectorError.message}`);
          // Continue with deletion even if sector update fails
        }
      }

      // Remove from AgentRuntime if it's loaded
      try {
        const agentRuntime = getAgentRuntime();
        if (agentRuntime.managers && agentRuntime.managers.has(id)) {
          agentRuntime.managers.delete(id);
          log(`Removed agent ${id} from AgentRuntime`);
        }
      } catch (runtimeError) {
        log(`Warning: Failed to remove agent from runtime: ${runtimeError.message}`);
        // Continue with deletion even if runtime update fails
      }

      // Delete the agent
      const deleted = await deleteAgent(id);

      if (!deleted) {
        log(`Failed to delete agent ${id}`);
        return reply.status(500).send({ error: 'Failed to delete agent' });
      }

      log(`Agent ${id} deleted successfully`);
      return reply.status(200).send({ 
        success: true, 
        message: 'Agent deleted successfully' 
      });
    } catch (error) {
      log(`Error deleting agent: ${error.message}`);
      return reply.status(500).send({ error: error.message });
    }
  });

  // PUT /api/agents/:id - Update agent settings
  fastify.put('/:id', {
    schema: {
      params: {
        type: 'object',
        properties: {
          id: { type: 'string' }
        },
        required: ['id']
      }
    }
  }, async (request, reply) => {
    try {
      const { id } = request.params;
      const updates = request.body;

      log(`PUT /api/agents/${id} - Updating agent settings`);

      // Load the agent first to check if it exists
      const agents = await loadAgents();
      const existingAgent = agents.find(a => a.id === id);

      if (!existingAgent) {
        log(`Agent ${id} not found`);
        return reply.status(404).send({ error: 'Agent not found' });
      }

      // Validate and prepare updates
      const allowedFields = [
        'name', 'role', 'prompt', 'sectorId',
        'personality', 'preferences'
      ];

      const sanitizedUpdates = {};

      // Handle name
      if (updates.name !== undefined) {
        if (typeof updates.name !== 'string' || !updates.name.trim()) {
          return reply.status(400).send({ error: 'name must be a non-empty string' });
        }
        sanitizedUpdates.name = updates.name.trim();
      }

      // Handle role
      if (updates.role !== undefined) {
        if (typeof updates.role !== 'string' || !updates.role.trim()) {
          return reply.status(400).send({ error: 'role must be a non-empty string' });
        }
        sanitizedUpdates.role = updates.role.trim();
      }

      // Handle prompt
      if (updates.prompt !== undefined) {
        sanitizedUpdates.prompt = typeof updates.prompt === 'string' ? updates.prompt : '';
      }

      // Handle sectorId
      if (updates.sectorId !== undefined) {
        if (updates.sectorId !== null && typeof updates.sectorId !== 'string') {
          return reply.status(400).send({ error: 'sectorId must be a string or null' });
        }
        sanitizedUpdates.sectorId = updates.sectorId;

        // Update sector metadata if sectorId changed
        if (updates.sectorId !== existingAgent.sectorId) {
          if (updates.sectorId) {
            const sectors = await getAllSectors();
            const sector = sectors.find(s => s.id === updates.sectorId);
            if (sector) {
              sanitizedUpdates.sectorSymbol = sector.symbol || 'GEN';
              sanitizedUpdates.sectorName = sector.name || 'General';
            } else {
              sanitizedUpdates.sectorSymbol = 'GEN';
              sanitizedUpdates.sectorName = 'General';
            }
          } else {
            sanitizedUpdates.sectorSymbol = 'GEN';
            sanitizedUpdates.sectorName = 'General';
          }
        }
      }

      // Handle personality
      if (updates.personality !== undefined) {
        if (typeof updates.personality !== 'object' || updates.personality === null) {
          return reply.status(400).send({ error: 'personality must be an object' });
        }
        sanitizedUpdates.personality = {
          riskTolerance: updates.personality.riskTolerance || existingAgent.personality?.riskTolerance || 'medium',
          decisionStyle: updates.personality.decisionStyle || existingAgent.personality?.decisionStyle || 'balanced'
        };
      }

      // Handle preferences
      if (updates.preferences !== undefined) {
        if (typeof updates.preferences !== 'object' || updates.preferences === null) {
          return reply.status(400).send({ error: 'preferences must be an object' });
        }
        const existingPrefs = existingAgent.preferences || {
          riskWeight: 0.5,
          profitWeight: 0.5,
          speedWeight: 0.5,
          accuracyWeight: 0.5
        };
        sanitizedUpdates.preferences = {
          riskWeight: typeof updates.preferences.riskWeight === 'number' 
            ? Math.max(0, Math.min(1, updates.preferences.riskWeight))
            : existingPrefs.riskWeight,
          profitWeight: typeof updates.preferences.profitWeight === 'number'
            ? Math.max(0, Math.min(1, updates.preferences.profitWeight))
            : existingPrefs.profitWeight,
          speedWeight: typeof updates.preferences.speedWeight === 'number'
            ? Math.max(0, Math.min(1, updates.preferences.speedWeight))
            : existingPrefs.speedWeight,
          accuracyWeight: typeof updates.preferences.accuracyWeight === 'number'
            ? Math.max(0, Math.min(1, updates.preferences.accuracyWeight))
            : existingPrefs.accuracyWeight
        };
      }

      // Update the agent using Agent model for validation
      const updatedAgentData = {
        ...existingAgent,
        ...sanitizedUpdates
      };

      // Validate using Agent model
      try {
        const agent = Agent.fromData(updatedAgentData);
        const validatedData = agent.toJSON();

        // Save the updated agent
        const updatedAgent = await updateAgent(id, validatedData);

        if (!updatedAgent) {
          return reply.status(500).send({ error: 'Failed to update agent' });
        }

        // If this is a manager agent, reload it into the runtime
        if (updatedAgent.role === 'manager' || updatedAgent.role?.toLowerCase().includes('manager')) {
          try {
            const agentRuntime = getAgentRuntime();
            await agentRuntime.reloadAgents();
            log(`Manager agent ${id} reloaded into runtime after update`);
          } catch (runtimeError) {
            log(`Warning: Failed to reload agent into runtime: ${runtimeError.message}`);
          }
        }

        log(`Agent ${id} updated successfully`);
        return reply.status(200).send(updatedAgent);
      } catch (validationError) {
        log(`Validation error updating agent: ${validationError.message}`);
        return reply.status(400).send({ error: validationError.message });
      }
    } catch (error) {
      log(`Error updating agent: ${error.message}`);
      return reply.status(500).send({ error: error.message });
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
