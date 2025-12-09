const { loadAgents, updateAgent, saveAgents } = require('../utils/agentStorage');
const { getAllSectors, updateSector, getSectorById } = require('../utils/sectorStorage');
const SystemOrchestrator = require('../core/engines/SystemOrchestrator');
const { startDiscussion } = require('../agents/discussion/discussionLifecycle');
const { loadDiscussions, saveDiscussions } = require('../utils/discussionStorage');
const { readDataFile } = require('../utils/persistence');

// Simple logger
function log(message) {
  const timestamp = new Date().toISOString();
  console.log(`[${timestamp}] ${message}`);
}

// Helper function to check if a string is a UUID format
function isUUID(str) {
  const uuidRegex = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
  return uuidRegex.test(str);
}

// Helper function to resolve sectorId from either UUID or symbol
async function resolveSectorId(identifier) {
  if (!identifier || typeof identifier !== 'string') {
    return null;
  }

  const trimmed = identifier.trim();

  // If it's a UUID format, return as-is
  if (isUUID(trimmed)) {
    return trimmed;
  }

  // Otherwise, treat it as a symbol and look it up
  try {
    const sectors = await getAllSectors();
    const sector = sectors.find(s => 
      s && (
        (s.symbol && s.symbol.toUpperCase() === trimmed.toUpperCase()) ||
        (s.sectorSymbol && s.sectorSymbol.toUpperCase() === trimmed.toUpperCase())
      )
    );

    if (sector && sector.id) {
      return sector.id;
    }

    return null;
  } catch (error) {
    log(`Error resolving sector identifier "${trimmed}": ${error.message}`);
    return null;
  }
}

module.exports = async (fastify) => {
  // GET /debug/setConfidence - Set confidence for agent(s) in a sector
  // Query params: sectorId (required, UUID), agentId (optional), value (required)
  fastify.get('/setConfidence', async (request, reply) => {
    try {
      const { sectorId, agentId, value } = request.query;

      // Validate required parameters
      if (!sectorId || typeof sectorId !== 'string') {
        return reply.status(400).send({
          success: false,
          error: 'sectorId is required and must be a string (UUID)'
        });
      }

      if (value === undefined || value === null || value === '') {
        return reply.status(400).send({
          success: false,
          error: 'value is required'
        });
      }

      // Parse and validate value
      const confidenceValue = parseFloat(value);
      if (isNaN(confidenceValue)) {
        return reply.status(400).send({
          success: false,
          error: 'value must be a valid number'
        });
      }

      // Clamp confidence to valid range (-100 to 100)
      const clampedValue = Math.max(-100, Math.min(100, confidenceValue));

      log(`GET /debug/setConfidence - sectorId: ${sectorId}, agentId: ${agentId || 'all'}, value: ${clampedValue}`);

      // Load all agents
      const allAgents = await loadAgents();

      // Filter agents by sectorId (UUID) - no sectorSymbol usage
      const sectorAgents = allAgents.filter(agent => agent.sectorId === sectorId);

      if (sectorAgents.length === 0) {
        return reply.status(404).send({
          success: false,
          error: `No agents found in sector ${sectorId}`
        });
      }

      let updatedAgents = [];

      if (agentId) {
        // Update specific agent
        const agent = sectorAgents.find(a => a.id === agentId);
        
        if (!agent) {
          return reply.status(404).send({
            success: false,
            error: `Agent ${agentId} not found in sector ${sectorId}`
          });
        }

        // Update the agent's confidence
        const updatedAgent = await updateAgent(agentId, {
          confidence: clampedValue
        });

        if (!updatedAgent) {
          return reply.status(500).send({
            success: false,
            error: 'Failed to update agent'
          });
        }

        updatedAgents = [updatedAgent];
        log(`Updated confidence for agent ${agentId} to ${clampedValue}`);
      } else {
        // Update all agents in the sector
        const updatePromises = sectorAgents.map(agent => 
          updateAgent(agent.id, {
            confidence: clampedValue
          })
        );

        const results = await Promise.all(updatePromises);
        updatedAgents = results.filter(agent => agent !== null);

        log(`Updated confidence for ${updatedAgents.length} agents in sector ${sectorId} to ${clampedValue}`);
      }

      const agentCount = updatedAgents.length;
      const message = agentId 
        ? `Updated confidence for 1 agent in sector ${sectorId}`
        : `Updated confidence for ${agentCount} agents in sector ${sectorId}`;

      return reply.status(200).send({
        success: true,
        updatedAgents: updatedAgents.map(agent => ({
          id: agent.id,
          name: agent.name,
          confidence: agent.confidence
        })),
        message
      });
    } catch (error) {
      log(`Error setting confidence: ${error.message}`);
      return reply.status(500).send({
        success: false,
        error: error.message
      });
    }
  });

  // GET /debug/tickConfidence - Execute a confidence tick for a sector
  // Query params: sectorId (required, UUID)
  fastify.get('/tickConfidence', async (request, reply) => {
    try {
      const { sectorId } = request.query;

      // Validate required parameters
      if (!sectorId || typeof sectorId !== 'string') {
        return reply.status(400).send({
          success: false,
          error: 'sectorId is required and must be a string (UUID)'
        });
      }

      log(`GET /debug/tickConfidence - sectorId: ${sectorId}`);

      // Load all agents to verify sector has agents
      const allAgents = await loadAgents();
      const sectorAgents = allAgents.filter(agent => agent.sectorId === sectorId);

      if (sectorAgents.length === 0) {
        return reply.status(404).send({
          success: false,
          error: `No agents found in sector ${sectorId}`
        });
      }

      // Execute confidence tick using SystemOrchestrator
      const orchestrator = new SystemOrchestrator();
      const result = await orchestrator.tickSector(sectorId);

      // Extract updated agents
      const updatedAgents = (result.sector.agents || [])
        .filter(agent => agent && agent.id && agent.sectorId === sectorId)
        .map(agent => ({
          id: agent.id,
          name: agent.name || agent.id,
          confidence: typeof agent.confidence === 'number' ? agent.confidence : 0
        }));

      const message = `Executed confidence tick for ${updatedAgents.length} agents in sector ${sectorId}`;

      return reply.status(200).send({
        success: true,
        updatedAgents,
        discussionReady: result.discussionReady,
        message
      });
    } catch (error) {
      log(`Error executing confidence tick: ${error.message}`);
      
      if (error.message && error.message.includes('not found')) {
        return reply.status(404).send({
          success: false,
          error: error.message
        });
      }

      return reply.status(500).send({
        success: false,
        error: error.message
      });
    }
  });

  // GET /debug/forceDiscussion - Force create a discussion for a sector
  // Query params: sectorId (required, UUID), title (optional)
  fastify.get('/forceDiscussion', async (request, reply) => {
    try {
      const { sectorId, title } = request.query;

      // Validate required parameters
      if (!sectorId || typeof sectorId !== 'string') {
        return reply.status(400).send({
          success: false,
          error: 'sectorId is required and must be a string (UUID)'
        });
      }

      const discussionTitle = title || `Forced discussion for sector ${sectorId}`;

      log(`GET /debug/forceDiscussion - sectorId: ${sectorId}, title: ${discussionTitle}`);

      // Load all agents to verify sector has agents
      const allAgents = await loadAgents();
      const sectorAgents = allAgents.filter(agent => agent.sectorId === sectorId && agent.role !== 'manager');

      if (sectorAgents.length === 0) {
        return reply.status(404).send({
          success: false,
          error: `No agents found in sector ${sectorId}`
        });
      }

      // Force create discussion
      const discussion = await startDiscussion(sectorId, discussionTitle);

      const message = `Created discussion ${discussion.id} for ${sectorAgents.length} agents in sector ${sectorId}`;

      return reply.status(200).send({
        success: true,
        discussion: {
          id: discussion.id,
          sectorId: discussion.sectorId,
          title: discussion.title,
          status: discussion.status,
          agentIds: discussion.agentIds
        },
        updatedAgents: sectorAgents.map(agent => ({
          id: agent.id,
          name: agent.name
        })),
        message
      });
    } catch (error) {
      log(`Error forcing discussion: ${error.message}`);
      return reply.status(500).send({
        success: false,
        error: error.message
      });
    }
  });

  // GET /debug/setAllAgentsConfidence/:sectorId - Set confidence to 65 for all agents in a sector
  // Accepts either sector ID (UUID) or sector symbol (e.g., "FASH")
  fastify.get('/setAllAgentsConfidence/:sectorId', async (request, reply) => {
    try {
      const { sectorId: sectorIdentifier } = request.params;

      // Validate required parameters
      if (!sectorIdentifier || typeof sectorIdentifier !== 'string') {
        return reply.status(400).send({
          success: false,
          error: 'sectorId is required and must be a string (UUID or symbol)'
        });
      }

      log(`GET /debug/setAllAgentsConfidence/:sectorId - identifier: ${sectorIdentifier}`);

      // Resolve sectorId from either UUID or symbol
      const resolvedSectorId = await resolveSectorId(sectorIdentifier);

      if (!resolvedSectorId) {
        return reply.status(404).send({
          success: false,
          error: `Sector not found: "${sectorIdentifier}" (not a valid UUID or symbol)`
        });
      }

      // Load all agents
      const allAgents = await loadAgents();

      // Find all agents whose sectorId matches
      const sectorAgents = allAgents.filter(agent => agent.sectorId === resolvedSectorId);

      if (sectorAgents.length === 0) {
        return reply.status(404).send({
          success: false,
          error: 'No agents found for this sector'
        });
      }

      // Update confidence to 65 for all matching agents
      const updatedAgentIds = [];
      for (let i = 0; i < allAgents.length; i++) {
        if (allAgents[i].sectorId === resolvedSectorId) {
          allAgents[i].confidence = 65;
          updatedAgentIds.push(allAgents[i].id);
        }
      }

      // Save agents back to storage
      await saveAgents(allAgents);

      log(`Updated confidence to 65 for ${updatedAgentIds.length} agents in sector ${resolvedSectorId} (identifier: ${sectorIdentifier})`);

      return reply.status(200).send({
        success: true,
        sectorId: resolvedSectorId,
        sectorIdentifier: sectorIdentifier,
        updatedAgents: updatedAgentIds
      });
    } catch (error) {
      log(`Error setting all agents confidence: ${error.message}`);
      return reply.status(500).send({
        success: false,
        error: error.message
      });
    }
  });

  // DELETE /debug/discussions/clear - Clear all discussions
  fastify.delete('/discussions/clear', async (request, reply) => {
    try {
      log('DELETE /debug/discussions/clear - Clearing all discussions');

      // Load all discussions to get count
      const allDiscussions = await loadDiscussions();
      const deletedCount = allDiscussions.length;

      // Clear all discussions
      await saveDiscussions([]);

      // Clear discussion references from all sectors
      const sectors = await getAllSectors();
      for (const sector of sectors) {
        if (sector && (sector.discussions || sector.discussion)) {
          await updateSector(sector.id, {
            discussions: [],
            discussion: null
          });
        }
      }

      // Clear discussion locks in SystemOrchestrator instance
      // Note: locks are per-instance, but we clear them for the current instance
      const orchestrator = new SystemOrchestrator();
      orchestrator.discussionLock.clear();

      log(`Cleared ${deletedCount} discussions, reset manager locks, and removed discussion references from sectors`);

      return reply.status(200).send({
        success: true,
        deletedCount
      });
    } catch (error) {
      log(`Error clearing discussions: ${error.message}`);
      return reply.status(500).send({
        success: false,
        error: error.message
      });
    }
  });
};

