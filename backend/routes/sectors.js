const Sector = require('../models/Sector');
const Agent = require('../models/Agent');
const { getAllSectors, createSector, updateSector, deleteSector } = require('../utils/sectorStorage');
const { normalizeSectorRecord, getSectorById } = require('../controllers/sectorsController');
const { loadAgents, saveAgents, updateAgent, deleteAgent } = require('../utils/agentStorage');
const { loadDiscussions } = require('../utils/discussionStorage');
const { addFunds } = require('../utils/userAccount');
const { v4: uuidv4 } = require('uuid');
const SystemOrchestrator = require('../core/engines/SystemOrchestrator');
const ExecutionEngine = require('../core/ExecutionEngine');

// Maximum number of sectors allowed
const MAX_SECTORS = 6;

// Optimize sector response for list view - only return minimal fields needed by UI
async function optimizeSectorForList(sector) {
  // Calculate active agents count from agents array
  const agents = Array.isArray(sector.agents) ? sector.agents : [];
  const activeAgents = agents.filter(agent => agent && agent.status === 'active').length;
  
  // Calculate performance using ExecutionEngine
  const executionEngine = new ExecutionEngine();
  const performance = executionEngine.updateSectorPerformance(sector);
  
  // Count discussions for this sector from discussions.json
  let discussionCount = 0;
  try {
    const allDiscussions = await loadDiscussions();
    discussionCount = allDiscussions.filter(d => d.sectorId === sector.id).length;
  } catch (error) {
    console.warn(`[optimizeSectorForList] Failed to load discussions for sector ${sector.id}:`, error.message);
    // Fallback to sector.discussions if available
    discussionCount = Array.isArray(sector.discussions) ? sector.discussions.length : 0;
  }
  
  // Return only essential fields for list view with consistent field names
  return {
    id: sector.id,
    // Primary standardized fields
    name: sector.name || sector.sectorName || 'Unknown Sector',
    symbol: sector.symbol || sector.sectorSymbol || 'N/A',
    // Backward compatibility fields (include if present)
    sectorName: sector.sectorName || sector.name || undefined,
    sectorSymbol: sector.sectorSymbol || sector.symbol || undefined,
    // Core market data fields
    currentPrice: typeof sector.currentPrice === 'number' ? sector.currentPrice : 0,
    change: typeof sector.change === 'number' ? sector.change : 0,
    changePercent: typeof sector.changePercent === 'number' ? sector.changePercent : 0,
    volume: typeof sector.volume === 'number' ? sector.volume : 0,
    // Performance field
    performance: performance,
    // Agent and activity fields
    activeAgents: typeof sector.activeAgents === 'number' ? sector.activeAgents : activeAgents,
    statusPercent: typeof sector.statusPercent === 'number' ? sector.statusPercent : 0,
    // Only include minimal agent info (id, name, role, status) - not full objects
    agents: agents.map(agent => ({
      id: agent.id,
      name: agent.name || 'Unknown',
      role: agent.role || 'agent',
      status: agent.status || 'idle'
    })),
    // Return discussion count and empty array (frontend uses length for count)
    discussions: new Array(discussionCount).fill(null).map((_, i) => ({ id: `placeholder-${i}` })),
    createdAt: sector.createdAt || new Date().toISOString()
  };
}

module.exports = async (fastify) => {
  // GET /sectors - List all sectors (optimized for list view)
  fastify.get('/', async (request, reply) => {
    try {
      const sectors = await getAllSectors();
      // Sort sectors by ID to ensure stable ordering across requests
      const sortedSectors = [...sectors].sort((a, b) => {
        if (a.id < b.id) return -1;
        if (a.id > b.id) return 1;
        return 0;
      });
      // Normalize all sectors to ensure sectorSymbol is included
      const normalizedSectors = sortedSectors.map(sector => normalizeSectorRecord(sector));
      // Optimize response to only include minimal fields needed by UI
      // Note: optimizeSectorForList is now async, so we need to await all promises
      const optimizedSectors = await Promise.all(normalizedSectors.map(sector => optimizeSectorForList(sector)));
      return reply.status(200).send(optimizedSectors);
    } catch (error) {
      return reply.status(500).send({
        error: error.message
      });
    }
  });

  // POST /sectors/:id/deposit - Deposit money into a sector (MUST come before /:id route)
  fastify.post('/:id/deposit', async (request, reply) => {
    try {
      let { id } = request.params;
      const { amount } = request.body || {};

      // Normalize ID to lowercase for consistent case-sensitivity
      if (id && typeof id === 'string') {
        id = id.trim().toLowerCase();
      }

      // Validate amount
      if (!amount || typeof amount !== 'number' || amount <= 0 || !isFinite(amount)) {
        return reply.status(400).send({
          success: false,
          error: 'Invalid amount. Amount must be a positive number.'
        });
      }

      // Get the sector
      const sector = await getSectorById(id);
      if (!sector) {
        return reply.status(404).send({
          success: false,
          error: 'Sector not found'
        });
      }

      // Add deposit amount directly to currentPrice (the dynamic value)
      const currentPrice = typeof sector.currentPrice === 'number' ? sector.currentPrice : 0;
      const newPrice = currentPrice + amount;

      // Also update balance for manager agent use (kept internally, not displayed)
      const currentBalance = typeof sector.balance === 'number' ? sector.balance : 0;
      const newBalance = currentBalance + amount;

      // Update sector with new price and balance
      const updatedSector = await updateSector(id, { 
        currentPrice: newPrice,
        balance: newBalance 
      });
      if (!updatedSector) {
        return reply.status(500).send({
          success: false,
          error: 'Failed to update sector'
        });
      }

      // Normalize the updated sector before sending
      const normalizedSector = normalizeSectorRecord(updatedSector);

      return reply.status(200).send(normalizedSector);
    } catch (error) {
      console.error(`Error depositing into sector: ${error.message}`);
      return reply.status(500).send({
        success: false,
        error: error.message
      });
    }
  });

  // POST /sectors/:id/withdraw - Withdraw money from a sector to user account
  fastify.post('/:id/withdraw', async (request, reply) => {
    try {
      let { id } = request.params;
      const { amount } = request.body || {};

      // Normalize ID to lowercase for consistent case-sensitivity
      if (id && typeof id === 'string') {
        id = id.trim().toLowerCase();
      }

      // Get the sector
      const sector = await getSectorById(id);
      if (!sector) {
        return reply.status(404).send({
          success: false,
          error: 'Sector not found'
        });
      }

      // Get current balance and price
      const currentBalance = typeof sector.balance === 'number' ? sector.balance : 0;
      const currentPrice = typeof sector.currentPrice === 'number' ? sector.currentPrice : 0;
      
      // Determine withdrawal amount
      let withdrawAmount;
      if (amount === undefined || amount === null || amount === 'all') {
        // Withdraw all available balance
        withdrawAmount = currentBalance;
      } else if (typeof amount === 'number' && amount > 0 && isFinite(amount)) {
        // Validate partial withdrawal
        if (amount > currentBalance) {
          return reply.status(400).send({
            success: false,
            error: `Insufficient balance. Available: $${currentBalance.toFixed(2)}, Requested: $${amount.toFixed(2)}`
          });
        }
        withdrawAmount = amount;
      } else {
        return reply.status(400).send({
          success: false,
          error: 'Invalid amount. Amount must be a positive number or "all" to withdraw everything.'
        });
      }

      // Check if there's anything to withdraw
      if (withdrawAmount <= 0) {
        return reply.status(400).send({
          success: false,
          error: 'Sector has no balance to withdraw'
        });
      }

      // Calculate new balance (withdrawals only affect balance, not price)
      // Price is only updated by executed actions, not by deposits/withdrawals
      const newBalance = Math.max(0, currentBalance - withdrawAmount);

      // Update sector with new balance only (price remains unchanged)
      const updatedSector = await updateSector(id, { 
        balance: newBalance 
      });
      if (!updatedSector) {
        return reply.status(500).send({
          success: false,
          error: 'Failed to update sector'
        });
      }

      // Add withdrawn amount to user account
      try {
        await addFunds(withdrawAmount);
        console.log(`Withdrew ${withdrawAmount} from sector ${id} to user account`);
      } catch (balanceError) {
        console.error(`Error adding funds to user account: ${balanceError.message}`);
        // Rollback sector update if user account update fails
        await updateSector(id, { 
          balance: currentBalance 
        });
        return reply.status(500).send({
          success: false,
          error: 'Failed to update user account balance'
        });
      }

      // Normalize the updated sector before sending
      const normalizedSector = normalizeSectorRecord(updatedSector);

      return reply.status(200).send({
        success: true,
        sector: normalizedSector,
        withdrawnAmount: withdrawAmount
      });
    } catch (error) {
      console.error(`Error withdrawing from sector: ${error.message}`);
      return reply.status(500).send({
        success: false,
        error: error.message
      });
    }
  });

  // GET /sectors/:id - Get a single sector by ID
  fastify.get('/:id', async (request, reply) => {
    try {
      let { id } = request.params;
      
      // Normalize ID to lowercase for consistent case-sensitivity
      if (id && typeof id === 'string') {
        id = id.trim().toLowerCase();
      }
      
      // Debug logging
      console.log(`[GET /sectors/:id] Looking for sector with ID: ${id}`);
      
      const sector = await getSectorById(id);
      
      if (!sector) {
        // Debug: log all available sector IDs to help diagnose
        try {
          const allSectors = await getAllSectors();
          const availableIds = allSectors.map(s => s.id);
          console.log(`[GET /sectors/:id] Sector not found. Available sector IDs:`, availableIds);
          console.log(`[GET /sectors/:id] Requested ID type: ${typeof id}, value: "${id}"`);
          if (availableIds.length > 0) {
            console.log(`[GET /sectors/:id] First available ID type: ${typeof availableIds[0]}, value: "${availableIds[0]}"`);
            console.log(`[GET /sectors/:id] IDs match? ${id === availableIds[0]}`);
            console.log(`[GET /sectors/:id] IDs match (trimmed)? ${id.trim() === availableIds[0].trim()}`);
            console.log(`[GET /sectors/:id] IDs match (lowercase)? ${id.toLowerCase() === String(availableIds[0]).toLowerCase()}`);
          }
        } catch (debugError) {
          console.error('[GET /sectors/:id] Error during debug logging:', debugError);
        }
        
        return reply.status(404).send({
          success: false,
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
      
      // Enrich sector with discussions from discussions.json that belong to this sector
      try {
        const allDiscussions = await loadDiscussions();
        const sectorDiscussions = allDiscussions
          .filter(discussion => discussion.sectorId === id)
          .map(discussion => ({
            id: discussion.id,
            title: discussion.title || 'Untitled Discussion',
            status: discussion.status || 'in_progress',
            updatedAt: discussion.updatedAt || discussion.createdAt || new Date().toISOString(),
            createdAt: discussion.createdAt || new Date().toISOString(),
            agentIds: Array.isArray(discussion.agentIds) ? discussion.agentIds : [],
            messagesCount: typeof discussion.messagesCount === 'number' 
              ? discussion.messagesCount 
              : (Array.isArray(discussion.messages) ? discussion.messages.length : 0)
          }));
        
        // Sort discussions by updatedAt (newest first)
        sectorDiscussions.sort((a, b) => {
          const dateA = new Date(a.updatedAt);
          const dateB = new Date(b.updatedAt);
          return dateB - dateA;
        });
        
        // Update sector with discussions
        sector.discussions = sectorDiscussions;
      } catch (discussionError) {
        console.warn(`[GET /sectors/:id] Failed to enrich discussions:`, discussionError.message);
        // Continue with sector.discussions as-is if enrichment fails
        if (!Array.isArray(sector.discussions)) {
          sector.discussions = [];
        }
      }
      
      // Calculate and add performance using ExecutionEngine
      const executionEngine = new ExecutionEngine();
      sector.performance = executionEngine.updateSectorPerformance(sector);
      
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
      // Check sector creation limit before proceeding
      const existingSectors = await getAllSectors();
      if (existingSectors.length >= MAX_SECTORS) {
        console.warn("[Limit] Sector creation blocked: maximum reached.");
        return reply.status(400).send({
          success: false,
          errorCode: "SECTOR_LIMIT_REACHED",
          errorMessage: "Maximum number of sectors reached (6). Delete a sector to create a new one."
        });
      }

      const { name, sectorName, symbol, sectorSymbol, description, agents, performance, symbols: providedSymbols, marketContext } = request.body || {};

      // Extract sectorName and sectorSymbol from either field name
      const finalSectorName = (sectorName || name || '').trim();
      const finalSectorSymbol = (sectorSymbol || symbol || '').trim();

      // Create sector using the model (model handles both name/symbol and sectorName/sectorSymbol)
      // Explicitly set balance and currentPrice to 0 for new sectors (should never default to 100)
      // marketContext will be automatically initialized if not provided
      const sector = new Sector({
        name: finalSectorName,
        symbol: finalSectorSymbol,
        sectorName: finalSectorName,
        sectorSymbol: finalSectorSymbol,
        description: description || '',
        agents: agents || [],
        performance: performance || {},
        balance: 0, // New sectors always start with 0 balance
        currentPrice: 0, // New sectors start with 0 price (price is separate from balance)
        symbols: providedSymbols, // If provided, will be used instead of inferring from name
        marketContext: marketContext // If provided, will be used; otherwise auto-initialized
      });

      // Get normalized sector data (already includes both name/symbol and sectorName/sectorSymbol)
      const sectorData = sector.toJSON();
      
      console.log(`[POST /sectors] Creating sector with ID: ${sectorData.id}`);
      const savedSector = await createSector(sectorData);
      console.log(`[POST /sectors] Sector created with ID: ${savedSector.id}`);

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
      // Check if agent already exists, if so update it, otherwise add it
      const managerAgentData = managerAgent.toJSON();
      const allAgents = await loadAgents();
      const existingAgentIndex = allAgents.findIndex(a => a.id === managerAgentData.id);
      
      if (existingAgentIndex >= 0) {
        // Agent exists, update it
        await updateAgent(managerAgentData.id, managerAgentData);
      } else {
        // New agent, add to array and save (saveAgents handles deduplication)
        allAgents.push(managerAgentData);
        await saveAgents(allAgents);
      }

      // Add manager agent to sector's agents array (avoid duplicates)
      const existingSectorAgents = savedSector.agents || [];
      const agentExistsInSector = existingSectorAgents.some(a => a && a.id === managerAgentData.id);
      const updatedAgents = agentExistsInSector 
        ? existingSectorAgents.map(a => a.id === managerAgentData.id ? managerAgentData : a)
        : [...existingSectorAgents, managerAgentData];

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

      // Normalize the sector before sending to ensure all fields are properly formatted
      const normalizedSector = normalizeSectorRecord(updatedSector);
      
      // Verify the ID is present before sending
      if (!normalizedSector.id) {
        console.error('[POST /sectors] ERROR: Normalized sector missing ID!', normalizedSector);
        throw new Error('Failed to create sector: ID missing from response');
      }
      
      // Verify we can actually retrieve the sector we just created
      const verifySector = await getSectorById(normalizedSector.id);
      if (!verifySector) {
        console.error(`[POST /sectors] ERROR: Cannot retrieve sector ${normalizedSector.id} immediately after creation!`);
        // Try to get all sectors to see what's in storage
        const allSectors = await getAllSectors();
        console.error(`[POST /sectors] Available sectors in storage:`, allSectors.map(s => ({ id: s.id, name: s.name || s.sectorName })));
        throw new Error(`Failed to verify sector creation: sector ${normalizedSector.id} not found in storage`);
      }
      
      console.log(`[POST /sectors] Successfully created and verified sector with ID: ${normalizedSector.id}`);
      return reply.status(201).send(normalizedSector);
    } catch (error) {
      return reply.status(500).send({
        error: error.message
      });
    }
  });

  // DELETE /sectors/:id - Delete a sector with extra verification
  // Requires confirmationCode in request body matching sector name
  fastify.delete('/:id', {
    schema: {
      params: {
        type: 'object',
        properties: {
          id: { type: 'string' }
        },
        required: ['id']
      },
      body: {
        type: 'object',
        properties: {
          confirmationCode: { type: 'string' }
        },
        required: ['confirmationCode']
      }
    }
  }, async (request, reply) => {
    try {
      const { id } = request.params;
      const { confirmationCode } = request.body;

      console.log(`DELETE /api/sectors/${id} - Attempting to delete sector`);

      // Load the sector first
      const sector = await getSectorById(id);

      if (!sector) {
        console.log(`Sector ${id} not found`);
        return reply.status(404).send({ error: 'Sector not found' });
      }

      // Extra verification: confirmationCode must match sector name (case-insensitive)
      const sectorName = (sector.name || sector.sectorName || '').trim();
      if (!confirmationCode || confirmationCode.trim().toLowerCase() !== sectorName.toLowerCase()) {
        console.log(`Invalid confirmation code for sector ${id}`);
        return reply.status(400).send({ 
          error: 'Invalid confirmation code. Please enter the exact sector name to confirm deletion.' 
        });
      }

      // Get sector balance before deletion
      const sectorBalance = typeof sector.balance === 'number' ? sector.balance : 0;

      // Delete all agents in this sector (except manager agents - they'll be cleaned up separately)
      try {
        const allAgents = await loadAgents();
        const sectorAgents = allAgents.filter(agent => agent.sectorId === id);
        
        // Delete non-manager agents
        for (const agent of sectorAgents) {
          const isManager = agent.role === 'manager' || 
                           (agent.role && agent.role.toLowerCase().includes('manager'));
          
          if (!isManager) {
            try {
              await deleteAgent(agent.id);
              console.log(`Deleted agent ${agent.id} from sector ${id}`);
            } catch (agentError) {
              console.warn(`Warning: Failed to delete agent ${agent.id}:`, agentError.message);
            }
          }
        }

        // Remove manager agents from AgentRuntime
        const managerAgents = sectorAgents.filter(agent => 
          agent.role === 'manager' || (agent.role && agent.role.toLowerCase().includes('manager'))
        );
        
        try {
          const { getAgentRuntime } = require('../agents/runtime/agentRuntime');
          const agentRuntime = getAgentRuntime();
          for (const managerAgent of managerAgents) {
            if (agentRuntime.managers && agentRuntime.managers.has(managerAgent.id)) {
              agentRuntime.managers.delete(managerAgent.id);
              console.log(`Removed manager agent ${managerAgent.id} from AgentRuntime`);
            }
          }
        } catch (runtimeError) {
          console.warn(`Warning: Failed to remove manager agents from runtime:`, runtimeError.message);
        }

        // Delete manager agents from storage
        for (const managerAgent of managerAgents) {
          try {
            await deleteAgent(managerAgent.id);
            console.log(`Deleted manager agent ${managerAgent.id} from sector ${id}`);
          } catch (agentError) {
            console.warn(`Warning: Failed to delete manager agent ${managerAgent.id}:`, agentError.message);
          }
        }
      } catch (agentError) {
        console.warn(`Warning: Failed to clean up agents:`, agentError.message);
        // Continue with sector deletion even if agent cleanup fails
      }

      // Withdraw balance to user account
      if (sectorBalance > 0) {
        try {
          await addFunds(sectorBalance);
          console.log(`Withdrew ${sectorBalance} from sector ${id} to user account`);
        } catch (balanceError) {
          console.warn(`Warning: Failed to withdraw balance:`, balanceError.message);
          // Continue with deletion even if balance withdrawal fails
        }
      }

      // Delete the sector
      const deleted = await deleteSector(id);

      if (!deleted) {
        console.log(`Failed to delete sector ${id}`);
        return reply.status(500).send({ error: 'Failed to delete sector' });
      }

      console.log(`Sector ${id} deleted successfully. Balance ${sectorBalance} withdrawn to user account.`);
      return reply.status(200).send({ 
        success: true, 
        message: 'Sector deleted successfully',
        withdrawnBalance: sectorBalance
      });
    } catch (error) {
      console.error(`Error deleting sector: ${error.message}`);
      return reply.status(500).send({ error: error.message });
    }
  });

  // PATCH /sectors/:id/confidence-tick - Execute a confidence tick for a sector
  fastify.patch('/:id/confidence-tick', async (request, reply) => {
    try {
      const { id } = request.params;
      
      // Initialize SystemOrchestrator and call tickSector
      const orchestrator = new SystemOrchestrator();
      const result = await orchestrator.tickSector(id);
      
      // Extract agent confidence values for frontend
      const agents = (result.sector.agents || [])
        .filter(agent => agent && agent.id) // Filter out null/undefined agents
        .map(agent => ({
          id: agent.id,
          name: agent.name || agent.id,
          confidence: typeof agent.confidence === 'number' ? agent.confidence : 0
        }));

      // Log discussionReady to console
      console.log(`[Confidence Tick] Sector ${id}: discussionReady = ${result.discussionReady}`);

      return reply.status(200).send({
        agents,
        discussionReady: result.discussionReady
      });
    } catch (error) {
      if (error.message && error.message.includes('not found')) {
        return reply.status(404).send({
          error: error.message
        });
      }
      return reply.status(500).send({
        error: error.message
      });
    }
  });

  // POST /sectors/:id/message-manager - Send a message/instruction to the manager agent
  fastify.post('/:id/message-manager', async (request, reply) => {
    try {
      const { id } = request.params;
      const { message } = request.body;

      if (!message || typeof message !== 'string' || !message.trim()) {
        return reply.status(400).send({
          success: false,
          error: 'Message is required and must be a non-empty string'
        });
      }

      // Get the sector to find the manager agent
      const sector = await getSectorById(id);
      if (!sector) {
        return reply.status(404).send({
          success: false,
          error: 'Sector not found'
        });
      }

      // Find the manager agent for this sector
      const allAgents = await loadAgents();
      const managerAgent = allAgents.find(agent => 
        (agent.role === 'manager' || agent.role?.toLowerCase().includes('manager')) &&
        agent.sectorId === id
      );

      if (!managerAgent) {
        return reply.status(404).send({
          success: false,
          error: 'Manager agent not found for this sector'
        });
      }

      // Add the user message to the manager agent's memory
      // This allows the manager to process it during its next tick
      const userMessage = {
        id: `user-msg-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`,
        timestamp: Date.now(),
        type: 'user_instruction',
        source: 'user',
        content: message.trim(),
        sectorId: id,
        processed: false
      };

      // Update manager agent's memory
      const currentMemory = Array.isArray(managerAgent.memory) ? managerAgent.memory : [];
      const updatedMemory = [...currentMemory, userMessage];

      // Update the manager agent with the new message in memory
      await updateAgent(managerAgent.id, {
        ...managerAgent,
        memory: updatedMemory
      });

      // Also update the manager agent in the runtime if it's running
      try {
        const { getAgentRuntime } = require('../agents/runtime/agentRuntime');
        const agentRuntime = getAgentRuntime();
        if (agentRuntime && agentRuntime.managers && agentRuntime.managers.has(managerAgent.id)) {
          const runtimeManager = agentRuntime.managers.get(managerAgent.id);
          if (runtimeManager && typeof runtimeManager.updateMemory === 'function') {
            runtimeManager.updateMemory(userMessage);
          }
        }
      } catch (runtimeError) {
        // Non-critical - manager will pick up the message on next load
        console.warn(`Warning: Could not update manager agent in runtime: ${runtimeError.message}`);
      }

      console.log(`[User Message] Message sent to manager agent ${managerAgent.id} for sector ${id}`);

      return reply.status(200).send({
        success: true,
        message: 'Message sent successfully to manager agent'
      });
    } catch (error) {
      console.error(`Error sending message to manager: ${error.message}`);
      return reply.status(500).send({
        success: false,
        error: error.message || 'Failed to send message to manager agent'
      });
    }
  });

};
