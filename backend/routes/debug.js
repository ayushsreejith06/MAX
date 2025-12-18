const { loadAgents, updateAgent, saveAgents } = require('../utils/agentStorage');
const { getAllSectors, updateSector, getSectorById } = require('../utils/sectorStorage');
const SystemOrchestrator = require('../core/engines/SystemOrchestrator');
const { startDiscussion } = require('../agents/discussion/discussionLifecycle');
const { loadDiscussions, saveDiscussions } = require('../utils/discussionStorage');
const { readDataFile } = require('../utils/persistence');
const { loadRejectedItems, clearRejectedItems } = require('../utils/rejectedItemsStorage');

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

      // Load all rejected items to get count
      const allRejectedItems = await loadRejectedItems();
      const rejectedItemsCount = allRejectedItems.length;

      // Clear all discussions
      await saveDiscussions([]);

      // Clear all rejected items
      await clearRejectedItems();

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

      log(`Cleared ${deletedCount} discussions, ${rejectedItemsCount} rejected items, reset manager locks, and removed discussion references from sectors`);

      return reply.status(200).send({
        success: true,
        deletedCount,
        rejectedItemsCleared: rejectedItemsCount
      });
    } catch (error) {
      log(`Error clearing discussions: ${error.message}`);
      return reply.status(500).send({
        success: false,
        error: error.message
      });
    }
  });

  // GET /debug/discussions/:id/state - Get detailed state of a discussion
  fastify.get('/discussions/:id/state', async (request, reply) => {
    try {
      const { id } = request.params;
      const { findDiscussionById } = require('../utils/discussionStorage');
      const DiscussionRoom = require('../models/DiscussionRoom');
      
      const discussionData = await findDiscussionById(id);
      if (!discussionData) {
        return reply.status(404).send({ error: 'Discussion not found' });
      }
      
      const discussionRoom = DiscussionRoom.fromData(discussionData);
      
      return reply.send({
        id: discussionRoom.id,
        status: discussionRoom.status,
        round: discussionRoom.round,
        currentRound: discussionRoom.currentRound,
        messagesCount: discussionRoom.messages.length,
        messages: discussionRoom.messages.map(msg => ({
          id: msg.id,
          agentId: msg.agentId,
          agentName: msg.agentName,
          hasProposal: !!msg.proposal,
          hasAnalysis: !!msg.analysis,
          contentLength: msg.content?.length || 0,
          proposal: msg.proposal
        })),
        agentIds: discussionRoom.agentIds,
        checklistCount: discussionRoom.checklist?.length || 0
      });
    } catch (error) {
      return reply.status(500).send({ error: error.message });
    }
  });

  // POST /debug/discussions/:id/trigger-rounds - Manually trigger rounds for debugging
  fastify.post('/discussions/:id/trigger-rounds', async (request, reply) => {
    try {
      const { id } = request.params;
      const { numRounds } = request.body || {};
      
      const DiscussionEngine = require('../core/DiscussionEngine');
      const discussionEngine = new DiscussionEngine();
      
      log(`POST /debug/discussions/${id}/trigger-rounds - Manually triggering rounds`);
      
      await discussionEngine.startRounds(id, numRounds || 2); // Default reduced to 2 rounds for faster lifecycle
      
      const { findDiscussionById } = require('../utils/discussionStorage');
      const discussionData = await findDiscussionById(id);
      
      return reply.send({
        success: true,
        message: 'Rounds triggered',
        discussion: {
          id: discussionData.id,
          status: discussionData.status,
          messagesCount: discussionData.messages?.length || 0,
          round: discussionData.round
        }
      });
    } catch (error) {
      log(`Error triggering rounds: ${error.message}`);
      return reply.status(500).send({ 
        success: false,
        error: error.message,
        stack: error.stack 
      });
    }
  });

  // GET /debug/execution/status - Get Phase 4 execution status
  // Returns: lastExecutedChecklistItem, lastPriceUpdate, lastManagerImpact, lastSectorPerformance, lastRewardDistribution
  fastify.get('/execution/status', async (request, reply) => {
    try {
      log('GET /debug/execution/status - Fetching execution status');

      const EXECUTION_LOGS_FILE = 'executionLogs.json';

      // 1. Get last executed checklist item from execution logs
      let lastExecutedChecklistItem = null;
      try {
        const executionLogs = await readDataFile(EXECUTION_LOGS_FILE);
        const allLogs = Array.isArray(executionLogs) ? executionLogs : [];
        
        if (allLogs.length > 0) {
          // Sort by timestamp descending (newest first)
          const sortedLogs = allLogs.sort((a, b) => (b.timestamp || 0) - (a.timestamp || 0));
          const lastLog = sortedLogs[0];
          
          if (lastLog && lastLog.results && lastLog.results.length > 0) {
            // Get the last result from the most recent execution
            const lastResult = lastLog.results[lastLog.results.length - 1];
            lastExecutedChecklistItem = {
              itemId: lastResult.itemId || null,
              action: lastResult.action || null,
              amount: lastResult.amount || 0,
              success: lastResult.success || false,
              reason: lastResult.reason || null,
              timestamp: lastLog.timestamp || null,
              checklistId: lastLog.checklistId || null,
              sectorId: lastLog.sectorId || null
            };
          }
        }
      } catch (error) {
        if (error.code !== 'ENOENT') {
          log(`Error reading execution logs: ${error.message}`);
        }
      }

      // 2. Get last price update from sectors
      let lastPriceUpdate = null;
      try {
        const sectors = await getAllSectors();
        let latestSector = null;
        let latestTimestamp = 0;

        for (const sector of sectors) {
          // Check lastPriceUpdate field
          if (sector.lastPriceUpdate && sector.lastPriceUpdate > latestTimestamp) {
            latestTimestamp = sector.lastPriceUpdate;
            latestSector = sector;
          }
          // Also check changePercent timestamp (if available)
          if (sector.currentPrice && sector.change !== undefined) {
            // Use a fallback timestamp if lastPriceUpdate is not set
            const sectorTimestamp = sector.lastPriceUpdate || Date.now();
            if (sectorTimestamp > latestTimestamp) {
              latestTimestamp = sectorTimestamp;
              latestSector = sector;
            }
          }
        }

        if (latestSector) {
          lastPriceUpdate = {
            sectorId: latestSector.id || null,
            sectorSymbol: latestSector.symbol || latestSector.sectorSymbol || null,
            previousPrice: (latestSector.currentPrice || 0) - (latestSector.change || 0),
            currentPrice: latestSector.currentPrice || null,
            change: latestSector.change || 0,
            changePercent: latestSector.changePercent || 0,
            timestamp: latestSector.lastPriceUpdate || null
          };
        }
      } catch (error) {
        log(`Error reading sectors for price update: ${error.message}`);
      }

      // 3. Calculate last manager impact from execution logs
      let lastManagerImpact = null;
      try {
        const executionLogs = await readDataFile(EXECUTION_LOGS_FILE);
        const allLogs = Array.isArray(executionLogs) ? executionLogs : [];
        
        if (allLogs.length > 0) {
          const sortedLogs = allLogs.sort((a, b) => (b.timestamp || 0) - (a.timestamp || 0));
          const lastLog = sortedLogs[0];
          
          if (lastLog && lastLog.sectorId) {
            const sector = await getSectorById(lastLog.sectorId);
            if (sector) {
              // Manager impact is the price change from execution
              // Calculate from the change and changePercent
              const impact = {
                sectorId: lastLog.sectorId,
                sectorSymbol: sector.symbol || sector.sectorSymbol || null,
                priceChange: sector.change || 0,
                priceChangePercent: sector.changePercent || 0,
                timestamp: lastLog.timestamp || null,
                checklistId: lastLog.checklistId || null
              };
              
              // Calculate impact magnitude (absolute value of change percent)
              impact.magnitude = Math.abs(impact.priceChangePercent);
              impact.direction = impact.priceChangePercent >= 0 ? 'positive' : 'negative';
              
              lastManagerImpact = impact;
            }
          }
        }
      } catch (error) {
        if (error.code !== 'ENOENT') {
          log(`Error calculating manager impact: ${error.message}`);
        }
      }

      // 4. Get last sector performance
      let lastSectorPerformance = null;
      try {
        const sectors = await getAllSectors();
        let latestSector = null;
        let latestPerformanceTimestamp = 0;

        for (const sector of sectors) {
          if (sector.performance) {
            const perfTimestamp = sector.performance.lastUpdated 
              ? new Date(sector.performance.lastUpdated).getTime() 
              : (sector.performance.timestamp || 0);
            
            if (perfTimestamp > latestPerformanceTimestamp) {
              latestPerformanceTimestamp = perfTimestamp;
              latestSector = sector;
            }
          }
        }

        if (latestSector && latestSector.performance) {
          lastSectorPerformance = {
            sectorId: latestSector.id || null,
            sectorSymbol: latestSector.symbol || latestSector.sectorSymbol || null,
            totalPL: latestSector.performance.totalPL || 0,
            pnl: latestSector.performance.pnl || 0,
            pnlPercent: latestSector.performance.pnlPercent || 0,
            position: latestSector.performance.position || latestSector.position || 0,
            capital: latestSector.performance.capital || latestSector.balance || 0,
            totalValue: latestSector.performance.totalValue || 0,
            utilization: latestSector.utilization || 0,
            lastUpdated: latestSector.performance.lastUpdated || null,
            executions: latestSector.performance.executions || null
          };
        }
      } catch (error) {
        log(`Error reading sector performance: ${error.message}`);
      }

      // 5. Get last reward distribution (from agents' reward points and morale)
      let lastRewardDistribution = null;
      try {
        const agents = await loadAgents();
        
        // Find agents with recent reward updates
        const agentsWithRewards = agents
          .filter(agent => {
            return (agent.rewardPoints !== undefined && agent.rewardPoints > 0) ||
                   (agent.lastRewardTimestamp !== undefined) ||
                   (agent.morale !== undefined);
          })
          .map(agent => ({
            agentId: agent.id,
            agentName: agent.name,
            sectorId: agent.sectorId,
            rewardPoints: agent.rewardPoints || 0,
            morale: agent.morale || 0,
            lastRewardTimestamp: agent.lastRewardTimestamp || null
          }))
          .sort((a, b) => {
            const aTime = a.lastRewardTimestamp ? new Date(a.lastRewardTimestamp).getTime() : 0;
            const bTime = b.lastRewardTimestamp ? new Date(b.lastRewardTimestamp).getTime() : 0;
            return bTime - aTime;
          });

        if (agentsWithRewards.length > 0) {
          const totalRewardPoints = agentsWithRewards.reduce((sum, a) => sum + (a.rewardPoints || 0), 0);
          const totalMorale = agentsWithRewards.reduce((sum, a) => sum + (a.morale || 0), 0);
          const avgMorale = agentsWithRewards.length > 0 ? totalMorale / agentsWithRewards.length : 0;

          lastRewardDistribution = {
            totalAgentsWithRewards: agentsWithRewards.length,
            totalRewardPoints: totalRewardPoints,
            averageMorale: avgMorale,
            lastRewardTimestamp: agentsWithRewards[0].lastRewardTimestamp || null,
            topRewardedAgents: agentsWithRewards.slice(0, 5).map(a => ({
              agentId: a.agentId,
              agentName: a.agentName,
              sectorId: a.sectorId,
              rewardPoints: a.rewardPoints,
              morale: a.morale
            }))
          };
        }
      } catch (error) {
        log(`Error reading reward distribution: ${error.message}`);
      }

      return reply.status(200).send({
        success: true,
        lastExecutedChecklistItem,
        lastPriceUpdate,
        lastManagerImpact,
        lastSectorPerformance,
        lastRewardDistribution,
        timestamp: Date.now()
      });
    } catch (error) {
      log(`Error fetching execution status: ${error.message}`);
      return reply.status(500).send({
        success: false,
        error: error.message
      });
    }
  });
};

