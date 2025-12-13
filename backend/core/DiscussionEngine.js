const DiscussionRoom = require('../models/DiscussionRoom');
const { saveDiscussion, findDiscussionById } = require('../utils/discussionStorage');
const { updateSector, getSectorById } = require('../utils/sectorStorage');
const { loadAgents, updateAgent } = require('../utils/agentStorage');
const { generateWorkerProposal } = require('../ai/workerBrain');
const { extractConfidence } = require('../utils/confidenceUtils');
const { isLlmEnabled } = require('../ai/llmClient');
const { updateConfidencePhase4 } = require('../simulation/confidence');
const { createChecklistFromLLM } = require('../discussions/workflow/createChecklistFromLLM');
const { transitionStatus, STATUS } = require('../utils/discussionStatusService');

/**
 * DiscussionEngine - Manages discussion lifecycle and rounds
 */
class DiscussionEngine {
  /**
   * Start a new discussion for a sector
   * @param {Object} sector - Sector object
   * @returns {Promise<Object>} Updated sector with new discussion
   */
  async startDiscussion(sector) {
    if (!sector || !sector.id) {
      throw new Error('Invalid sector: sector and sector.id are required');
    }

    // Get agent IDs from sector
    const agentIds = Array.isArray(sector.agents)
      ? sector.agents.filter(a => a && a.id && a.role !== 'manager').map(a => a.id)
      : [];

    // Create discussion title
    const sectorName = sector.sectorName || sector.name || sector.id;
    const title = `Discussion for ${sectorName}`;

    // Create new discussion room
    const discussionRoom = new DiscussionRoom(sector.id, title, agentIds);
    
    // Initialize discussion-specific fields
    // Discussion status: 'CREATED' | 'IN_PROGRESS' | 'DECIDED' | 'CLOSED'
    // Status is set to CREATED by default in DiscussionRoom constructor
    discussionRoom.round = 1;
    discussionRoom.currentRound = 1;
    discussionRoom.checklistDraft = [];
    discussionRoom.checklist = [];
    discussionRoom.roundHistory = [];
    // CRITICAL: Reset checklist creation attempts for new discussion
    // This ensures each new discussion starts with a clean slate
    discussionRoom.checklistCreationAttempts = {};
    discussionRoom.lastChecklistItemTimestamp = null;

    // Save discussion
    await saveDiscussion(discussionRoom);

    // Update sector to include discussion reference
    const discussions = Array.isArray(sector.discussions) ? sector.discussions : [];
    discussions.push(discussionRoom.id);
    
    const updatedSector = await updateSector(sector.id, {
      discussions: discussions
    });

    // Attach discussion to sector object for return
    updatedSector.discussions = discussions;

    // Start rounds for this discussion
    // We start rounds asynchronously but handle failures to prevent empty discussions
    console.log(`[DiscussionEngine] Starting rounds for discussion ${discussionRoom.id}`);
    setImmediate(async () => {
      try {
        await this.startRounds(discussionRoom.id, 2); // Reduced to 2 rounds for faster lifecycle
        console.log(`[DiscussionEngine] Successfully completed rounds for discussion ${discussionRoom.id}`);
        
        // Verify that messages were actually created
        const updatedDiscussionData = await findDiscussionById(discussionRoom.id);
        if (updatedDiscussionData) {
          const messages = Array.isArray(updatedDiscussionData.messages) ? updatedDiscussionData.messages : [];
          if (messages.length === 0) {
            console.error(`[DiscussionEngine] WARNING: Discussion ${discussionRoom.id} was created but has no messages after rounds completed. This should not happen.`);
            // Mark discussion as failed or delete it
            await transitionStatus(discussionRoom.id, STATUS.CLOSED, 'No messages after rounds completed');
            console.error(`[DiscussionEngine] Marked discussion ${discussionRoom.id} as CLOSED due to no messages`);
          }
        }
      } catch (error) {
        console.error(`[DiscussionEngine] Error starting rounds for discussion ${discussionRoom.id}:`, error);
        console.error(`[DiscussionEngine] Error stack:`, error.stack);
        
        // If rounds fail, mark the discussion as CLOSED to prevent empty discussions
        try {
          await transitionStatus(discussionRoom.id, STATUS.CLOSED, 'Round failure');
          console.error(`[DiscussionEngine] Marked discussion ${discussionRoom.id} as CLOSED due to round failure`);
        } catch (saveError) {
          console.error(`[DiscussionEngine] Failed to mark discussion as CLOSED:`, saveError);
        }
      }
    });
    
    return updatedSector;
  }

  /**
   * Run a round of discussion where all agents contribute
   * @param {Object} sector - Sector object
   * @param {Array<Object>} agents - Array of agent objects
   * @returns {Promise<Object>} Updated sector with discussion progress
   */
  async runRound(sector, agents) {
    if (!sector || !sector.id) {
      throw new Error('Invalid sector: sector and sector.id are required');
    }

    if (!Array.isArray(agents) || agents.length === 0) {
      throw new Error('Invalid agents: agents array is required and must not be empty');
    }

    // Find the active discussion for this sector
    const discussions = Array.isArray(sector.discussions) ? sector.discussions : [];
    if (discussions.length === 0) {
      throw new Error(`No discussion found for sector ${sector.id}`);
    }

    // Get the most recent discussion (last in array)
    const discussionId = discussions[discussions.length - 1];
    const discussionData = await findDiscussionById(discussionId);

    if (!discussionData) {
      throw new Error(`Discussion ${discussionId} not found`);
    }

    // Load discussion room
    const discussionRoom = DiscussionRoom.fromData(discussionData);
    
    // Ensure round and checklistDraft fields exist
    if (typeof discussionRoom.round !== 'number') {
      discussionRoom.round = 1;
    }
    if (!Array.isArray(discussionRoom.checklistDraft)) {
      discussionRoom.checklistDraft = [];
    }
    if (!Array.isArray(discussionRoom.checklist)) {
      discussionRoom.checklist = [];
    }

    // Get previous messages for context
    const previousMessages = Array.isArray(discussionRoom.messages) ? discussionRoom.messages : [];

    // Generate messages from each agent
    for (const agent of agents) {
      if (!agent || !agent.id) {
        continue;
      }

      // Only include agents that are part of this discussion
      if (!discussionRoom.agentIds.includes(agent.id)) {
        continue;
      }

      // Generate agent message using LLM
      const messageData = await this.generateAgentMessageWithLLM(agent, sector, previousMessages);
      
      // Add message to discussion (validation happens inside addMessage)
      const messageAdded = discussionRoom.addMessage({
        id: `${discussionRoom.id}-msg-${discussionRoom.messages.length}`,
        agentId: agent.id,
        agentName: agent.name || 'Unknown Agent',
        content: messageData.analysis, // Full LLM response as message content
        analysis: messageData.analysis, // Full LLM response
        proposal: messageData.proposal, // Structured proposal for checklist
        role: 'agent', // Always 'agent' for discussion messages
        timestamp: new Date().toISOString()
      });

      // If message validation failed, skip adding to checklistDraft
      if (!messageAdded) {
        console.warn(`[DiscussionEngine] Skipping invalid message from agent ${agent.id} (${agent.name || 'Unknown'})`);
        continue;
      }

      // Try to extract structured proposal (BUY/SELL/HOLD) from message and create checklist item
      // GUARDRAIL: Ensure checklist creation is attempted exactly once per agent per round
      const currentRound = discussionRoom.round || 1;
      
      // Check if agent already has a checklist item for this round (prevent duplicates)
      if (discussionRoom.hasChecklistItemForRound(agent.id, currentRound)) {
        // Log detailed info for debugging
        const existingItems = (discussionRoom.checklist || []).filter(item => {
          const itemAgentId = item.sourceAgentId || item.agentId;
          return itemAgentId === agent.id;
        });
        console.log(`[DiscussionEngine] Round ${currentRound}: Agent ${agent.id} (${agent.name || 'Unknown'}) already has a checklist item for this round, skipping duplicate creation. Existing items for this agent:`, existingItems.map(item => ({ id: item.id, round: item.round, actionType: item.actionType })));
        continue;
      }

      // Check if agent has already attempted checklist creation for this round
      if (discussionRoom.hasAttemptedChecklistCreation(agent.id, currentRound)) {
        console.log(`[DiscussionEngine] Round ${currentRound}: Agent ${agent.id} (${agent.name || 'Unknown'}) has already attempted checklist creation for this round, skipping`);
        continue;
      }

      // Mark that we're attempting checklist creation for this agent in this round
      discussionRoom.markChecklistCreationAttempt(agent.id, currentRound);
      console.log(`[DiscussionEngine] Round ${currentRound}: Attempting checklist creation for agent ${agent.id} (${agent.name || 'Unknown'})`);

      try {
        // Create checklist item from structured proposal object
        // Checklist items MUST ONLY be created from structured proposal objects, never from message text
        if (!messageData || typeof messageData !== 'object' || !messageData.proposal) {
          console.warn(`[DiscussionEngine] Round ${currentRound}: Message data missing proposal object for agent ${agent.id} (${agent.name || 'Unknown'}). Skipping checklist item creation.`);
          // Note: We don't create a fallback here because the proposal should always exist for LLM-generated messages
          // If it doesn't, that's a data integrity issue that should be fixed upstream
          continue;
        }

        const proposal = messageData.proposal;
        
        // Create checklist item from structured proposal object
        // createChecklistFromLLM will ALWAYS return a valid item (even if parsing fails, it creates a REJECTED fallback)
        // This ensures checklist items are always created when proposals exist, even if unparseable
        const checklistItem = await createChecklistFromLLM({
          proposal: proposal, // REQUIRED: Structured proposal object (may be invalid/null - fallback will handle it)
          discussionId: discussionRoom.id,
          agentId: agent.id,
          agentName: agent.name || undefined,
          sector: {
            id: sector.id,
            symbol: sector.symbol || sector.sectorSymbol,
            name: sector.name || sector.sectorName,
            allowedSymbols: sector.allowedSymbols || (sector.symbol ? [sector.symbol] : []),
          },
          sectorData: {
            currentPrice: sector.currentPrice,
            baselinePrice: sector.currentPrice,
            balance: sector.balance,
          },
          availableBalance: typeof sector.balance === 'number' ? sector.balance : 0,
          currentPrice: typeof sector.currentPrice === 'number' ? sector.currentPrice : undefined,
        });

        // Checklist item is always created (even if fallback is used)
        // CRITICAL: Ensure round is ALWAYS set on the checklist item
        // This is required for hasChecklistItemForRound to work correctly
        if (typeof checklistItem.round !== 'number') {
          checklistItem.round = currentRound;
        }
        discussionRoom.checklist.push(checklistItem);
        discussionRoom.updateLastChecklistItemTimestamp();
        console.log(`[DiscussionEngine] Round ${currentRound}: Created checklist item from agent ${agent.id} (${agent.name || 'Unknown'}): ${checklistItem.actionType} ${checklistItem.symbol}`);
        console.log(`[DiscussionEngine] Checklist item details:`, {
          id: checklistItem.id,
          actionType: checklistItem.actionType,
          symbol: checklistItem.symbol,
          allocationPercent: checklistItem.allocationPercent,
          confidence: checklistItem.confidence,
          status: checklistItem.status,
          round: checklistItem.round,
          totalChecklistItems: discussionRoom.checklist.length
        });
      } catch (error) {
        // Log error but don't fail the entire round if checklist creation fails
        // createChecklistFromLLM should always return a valid item (with fallback), so this is unexpected
        console.error(`[DiscussionEngine] Round ${currentRound}: Failed to create checklist item from message for agent ${agent.id} (${agent.name || 'Unknown'}): ${error.message}`);
        console.error(`[DiscussionEngine] Error stack:`, error.stack);
      }
    }

    // Aggregate messages into preliminary checklistDraft
    const newMessages = discussionRoom.messages.slice(previousMessages.length);
    const draftItems = newMessages.map((msg, index) => ({
      id: `draft-${discussionRoom.round}-${index}`,
      text: msg.content,
      agentId: msg.agentId,
      agentName: msg.agentName,
      round: discussionRoom.round
    }));

    // Append to existing checklistDraft
    discussionRoom.checklistDraft = [...(discussionRoom.checklistDraft || []), ...draftItems];

    // After auto-evaluation, check if discussion can close
    try {
      const ManagerEngine = require('./ManagerEngine');
      const managerEngine = new ManagerEngine();
      
      // Check if all items are terminal and discussion can close
      if (managerEngine.canDiscussionClose(discussionRoom)) {
        console.log(`[DiscussionEngine] Discussion ${discussionRoom.id} can close after round ${currentRound}. All items are terminal.`);
        
        // Save final round snapshot
        if (!Array.isArray(discussionRoom.roundHistory)) {
          discussionRoom.roundHistory = [];
        }
        
        const finalRoundSnapshot = {
          round: currentRound,
          checklist: JSON.parse(JSON.stringify(discussionRoom.checklist || [])),
          finalizedChecklist: JSON.parse(JSON.stringify(discussionRoom.finalizedChecklist || [])),
          managerDecisions: JSON.parse(JSON.stringify(discussionRoom.managerDecisions || [])),
          messages: JSON.parse(JSON.stringify(discussionRoom.messages || [])),
          timestamp: new Date().toISOString()
        };
        
        discussionRoom.roundHistory.push(finalRoundSnapshot);
        await saveDiscussion(discussionRoom);
        
        // Transition to DECIDED status
        await transitionStatus(discussionRoom.id, STATUS.DECIDED, `All items terminal after round ${currentRound}`);
        
        console.log(`[DiscussionEngine] Discussion ${discussionRoom.id} auto-closed and marked as 'decided' after round ${currentRound}.`);
        return updatedSector;
      }
    } catch (closeError) {
      console.warn(`[DiscussionEngine] Error checking if discussion can close: ${closeError.message}`);
      // Continue with normal flow if check fails
    }

    // Log round completion
    const checklistItemsThisRound = Array.isArray(discussionRoom.checklist) 
      ? discussionRoom.checklist.filter(item => (item.round || currentRound) === currentRound)
      : [];
    console.log(`[DiscussionEngine] Round ${currentRound} completed: ${newMessages.length} messages, ${checklistItemsThisRound.length} checklist items created`);

    // Save discussion after adding checklist items to ensure they're persisted
    await saveDiscussion(discussionRoom);
    console.log(`[DiscussionEngine] Saved discussion ${discussionRoom.id} with ${discussionRoom.checklist.length} checklist items`);

    // Increment round
    discussionRoom.round = (discussionRoom.round || 1) + 1;

    // Save updated discussion
    await saveDiscussion(discussionRoom);

    // Update sector with latest discussion state
    const updatedSector = await updateSector(sector.id, {
      discussions: discussions
    });

    // Attach discussion data to sector for return
    updatedSector.discussions = discussions;
    
    return updatedSector;
  }

  /**
   * Finalize a discussion by converting checklistDraft to final checklist
   * @param {Object} sector - Sector object
   * @returns {Promise<Object>} Updated sector with finalized discussion
   */
  async finalizeDiscussion(sector) {
    if (!sector || !sector.id) {
      throw new Error('Invalid sector: sector and sector.id are required');
    }

    // Find the active discussion for this sector
    const discussions = Array.isArray(sector.discussions) ? sector.discussions : [];
    if (discussions.length === 0) {
      throw new Error(`No discussion found for sector ${sector.id}`);
    }

    // Get the most recent discussion
    const discussionId = discussions[discussions.length - 1];
    const discussionData = await findDiscussionById(discussionId);

    if (!discussionData) {
      throw new Error(`Discussion ${discussionId} not found`);
    }

    // Load discussion room
    const discussionRoom = DiscussionRoom.fromData(discussionData);

    // Convert checklistDraft into final checklist items
    const checklistDraft = Array.isArray(discussionRoom.checklistDraft) 
      ? discussionRoom.checklistDraft 
      : [];

    // Transform draft items into final checklist format
    const checklist = checklistDraft.map((draftItem, index) => ({
      id: `checklist-${discussionRoom.id}-${index}`,
      text: draftItem.text,
      agentId: draftItem.agentId,
      agentName: draftItem.agentName,
      round: draftItem.round,
      completed: false,
      createdAt: new Date().toISOString()
    }));

    // Set final checklist
    discussionRoom.checklist = checklist;
    await saveDiscussion(discussionRoom);

    // Transition to DECIDED status
    await transitionStatus(discussionRoom.id, STATUS.DECIDED, 'Discussion finalized');

    // Update sector
    const updatedSector = await updateSector(sector.id, {
      discussions: discussions
    });

    // Attach discussion data to sector for return
    updatedSector.discussions = discussions;
    
    return updatedSector;
  }

  /**
   * Start rounds for a discussion (automatically generates N rounds)
   * @param {string} discussionId - Discussion ID
   * @param {number} numRounds - Number of rounds to run (default: 2, reduced from 3 for faster lifecycle)
   * @returns {Promise<void>}
   */
  async startRounds(discussionId, numRounds = 2) {
    if (!discussionId) {
      throw new Error('discussionId is required');
    }

    // Load discussion
    const discussionData = await findDiscussionById(discussionId);
    if (!discussionData) {
      throw new Error(`Discussion ${discussionId} not found`);
    }

    const discussionRoom = DiscussionRoom.fromData(discussionData);
    
    // Check if rounds have already been started (idempotency check)
    const existingMessages = Array.isArray(discussionRoom.messages) ? discussionRoom.messages : [];
    const currentRound = typeof discussionRoom.round === 'number' ? discussionRoom.round : 1;
    
    // If we already have messages and round is past 1, rounds may have already been started
    if (existingMessages.length > 0 && currentRound > 1) {
      console.log(`[DiscussionEngine] Rounds already started for discussion ${discussionId}. Current round: ${currentRound}, Messages: ${existingMessages.length}`);
      // Check if we need to complete remaining rounds
      if (currentRound <= numRounds) {
        console.log(`[DiscussionEngine] Resuming rounds from round ${currentRound} to ${numRounds}`);
        // Continue from current round
      } else {
        console.log(`[DiscussionEngine] All ${numRounds} rounds already completed for discussion ${discussionId}`);
        return;
      }
    }
    
    // Transition status from CREATED to IN_PROGRESS when rounds start (if no messages yet)
    const currentStatus = (discussionRoom.status || '').toUpperCase();
    if ((currentStatus === 'CREATED' || currentStatus === 'OPEN') && existingMessages.length === 0) {
      await transitionStatus(discussionId, STATUS.IN_PROGRESS, 'Rounds started');
      console.log(`[DiscussionEngine] Transitioned discussion ${discussionId} to IN_PROGRESS`);
    }
    
    // Load sector to get sector name
    const { getSectorById } = require('../utils/sectorStorage');
    const sector = await getSectorById(discussionRoom.sectorId);
    const sectorName = sector?.sectorName || sector?.name || discussionRoom.sectorId;

    // Load agents for this discussion
    const allAgents = await loadAgents();
    const agents = allAgents.filter(agent => 
      agent && agent.id && discussionRoom.agentIds.includes(agent.id) && agent.role !== 'manager'
    );

    console.log(`[DiscussionEngine] Found ${agents.length} agents for discussion ${discussionId}. Agent IDs in discussion: ${JSON.stringify(discussionRoom.agentIds)}`);

    if (agents.length === 0) {
      const errorMsg = `[DiscussionEngine] No agents found for discussion ${discussionId}. Available agents: ${allAgents.length}, Discussion agentIds: ${JSON.stringify(discussionRoom.agentIds)}`;
      console.error(errorMsg);
      throw new Error(errorMsg);
    }

    // Run N rounds with 200ms delay between rounds (reduced from 500ms for faster lifecycle)
    // Start from current round if resuming, otherwise start from 1
    const startRound = existingMessages.length > 0 && currentRound > 1 ? currentRound : 1;
    for (let round = startRound; round <= numRounds; round++) {
      // Reload discussion to get latest state
      const currentDiscussionData = await findDiscussionById(discussionId);
      const currentDiscussionRoom = DiscussionRoom.fromData(currentDiscussionData);
      
      // Get previous messages for context
      const previousMessages = Array.isArray(currentDiscussionRoom.messages) ? currentDiscussionRoom.messages : [];

      // Generate messages from each agent
      let messagesAdded = 0;
      for (const agent of agents) {
        if (!agent || !agent.id) {
          console.warn(`[DiscussionEngine] Skipping invalid agent in round ${round}`);
          continue;
        }

        // Only include agents that are part of this discussion
        if (!currentDiscussionRoom.agentIds.includes(agent.id)) {
          console.warn(`[DiscussionEngine] Agent ${agent.id} not in discussion agentIds: ${JSON.stringify(currentDiscussionRoom.agentIds)}`);
          continue;
        }

        // Generate message using LLM
        try {
          const messageData = await this.generateAgentMessageWithLLM(agent, sector, previousMessages);
          
          if (!messageData || !messageData.proposal) {
            console.error(`[DiscussionEngine] Invalid message data from agent ${agent.id}:`, messageData);
            throw new Error(`Invalid message data structure from agent ${agent.id}`);
          }
          
          console.log(`[DiscussionEngine] Round ${round}: Agent ${agent.name} (${agent.id}) sending message with proposal: ${messageData.proposal.action} ${messageData.proposal.symbol}`);
          console.log(`[DiscussionEngine] Message data structure:`, {
            hasAnalysis: !!messageData.analysis,
            hasProposal: !!messageData.proposal,
            proposalAction: messageData.proposal?.action,
            proposalSymbol: messageData.proposal?.symbol,
            proposalReasoning: messageData.proposal?.reasoning?.substring(0, 50)
          });
          
          // Add message to discussion with analysis and proposal
          const messageId = `${currentDiscussionRoom.id}-msg-${currentDiscussionRoom.messages.length}`;
          console.log(`[DiscussionEngine] Adding message with ID: ${messageId} for agent ${agent.name} (${agent.id})`);
          
          const messageAdded = currentDiscussionRoom.addMessage({
            id: messageId,
            agentId: agent.id,
            agentName: agent.name || 'Unknown Agent',
            content: messageData.analysis, // Full LLM response as message content (what users see)
            analysis: messageData.analysis, // Full LLM response
            proposal: messageData.proposal, // Structured proposal for checklist
            role: 'agent', // Always 'agent' for discussion messages
            timestamp: new Date().toISOString()
          });
          
          if (!messageAdded) {
            console.error(`[DiscussionEngine] Failed to add message for agent ${agent.name} (${agent.id}) in round ${round}`);
            throw new Error(`Failed to add message for agent ${agent.id}`);
          }
          
          console.log(`[DiscussionEngine] Message added successfully. Total messages in discussion: ${currentDiscussionRoom.messages.length}`);
          messagesAdded++;
          
          // NOTE: Checklist items are NOT created during rounds
          // Messages are just discussion. After all rounds complete, ALL messages
          // will be fed to LLM to generate executable checklist items in finalizeChecklist()
        } catch (msgError) {
          console.error(`[DiscussionEngine] Failed to generate message for agent ${agent.id} in round ${round}:`, msgError);
          console.error(`[DiscussionEngine] Error stack:`, msgError.stack);
          // Continue with other agents even if one fails
        }
      }

      console.log(`[DiscussionEngine] Round ${round}: Added ${messagesAdded} messages. Total messages: ${currentDiscussionRoom.messages.length}`);

      // Update round number
      currentDiscussionRoom.round = round;
      currentDiscussionRoom.updatedAt = new Date().toISOString();

      // Save updated discussion (no checklist items yet - those are created after all rounds complete)
      console.log(`[DiscussionEngine] Saving discussion ${discussionId} with ${currentDiscussionRoom.messages.length} messages`);
      await saveDiscussion(currentDiscussionRoom);
      console.log(`[DiscussionEngine] Discussion ${discussionId} saved successfully`);

      // Wait 200ms before next round (except after the last round) - reduced for faster lifecycle
      if (round < numRounds) {
        await new Promise(resolve => setTimeout(resolve, 200));
      }
    }

    // After all rounds complete, automatically finalize checklist from proposals
    const finalDiscussionData = await findDiscussionById(discussionId);
    if (finalDiscussionData) {
      const finalDiscussionRoom = DiscussionRoom.fromData(finalDiscussionData);
      const allMessages = Array.isArray(finalDiscussionRoom.messages) ? finalDiscussionRoom.messages : [];
      
      console.log(`[DiscussionEngine] Rounds completed. Total messages: ${allMessages.length}. Auto-finalizing checklist...`);
      
      // Automatically finalize checklist to create checklist items from proposals
      try {
        await this.finalizeChecklist(discussionId);
        console.log(`[DiscussionEngine] Checklist finalized successfully for discussion ${discussionId}`);
      } catch (finalizeError) {
        console.error(`[DiscussionEngine] Error finalizing checklist for discussion ${discussionId}:`, finalizeError);
        // Don't throw - rounds completed successfully, just checklist finalization failed
      }
    }

    console.log(`[DiscussionEngine] Completed ${numRounds} rounds for discussion ${discussionId}`);
  }

  /**
   * Finalize checklist after rounds are complete
   * @param {string} discussionId - Discussion ID
   * @returns {Promise<Object>} Complete checklist object with sectorId, items, createdBy, createdAt, roundCount
   */
  async finalizeChecklist(discussionId) {
    if (!discussionId) {
      throw new Error('discussionId is required');
    }

    // Load discussion
    const discussionData = await findDiscussionById(discussionId);
    if (!discussionData) {
      throw new Error(`Discussion ${discussionId} not found`);
    }

    const discussionRoom = DiscussionRoom.fromData(discussionData);

    // Get all messages grouped by round
    const allMessages = Array.isArray(discussionRoom.messages) ? discussionRoom.messages : [];
    
    // Get roundCount - this should be the number of rounds completed
    // The round field tracks the NEXT round, so actual rounds completed is round - 1
    const roundCount = Math.max(1, (discussionRoom.round || 1) - 1);
    
    console.log(`[DiscussionEngine] Finalizing checklist for discussion ${discussionId}: Round ${roundCount}, ${allMessages.length} messages`);
    
    // Load agents to get confidence and determine createdBy
    const allAgents = await loadAgents();
    const discussionAgents = allAgents.filter(agent => 
      agent && agent.id && discussionRoom.agentIds.includes(agent.id) && agent.role !== 'manager'
    );
    
    // Determine createdBy (use first agent or 'system' if no agents)
    const createdBy = discussionAgents.length > 0 
      ? (discussionAgents[0].id || 'system')
      : 'system';

    const useLlm = (process.env.USE_LLM || '').toLowerCase() === 'true';
    let refinedItems = [];
    const sector = useLlm ? await getSectorById(discussionRoom.sectorId) : null;
    let confidenceUpdated = false;

    if (useLlm && allMessages.length > 0) {
      // NEW FLOW: Feed ALL messages to LLM to generate executable checklist items
      console.log(`[DiscussionEngine] Generating executable checklist items from ${allMessages.length} discussion messages`);
      
      try {
        const { generateChecklistFromDiscussion } = require('../discussions/workflow/generateChecklistFromDiscussion');
        
        const checklistItems = await generateChecklistFromDiscussion({
          discussionId: discussionRoom.id,
          messages: allMessages,
          sector: {
            id: sector.id,
            symbol: sector.symbol || sector.sectorSymbol,
            name: sector.name || sector.sectorName,
            allowedSymbols: sector.allowedSymbols || (sector.symbol ? [sector.symbol] : []),
            riskScore: sector.riskScore,
          },
          sectorData: {
            currentPrice: sector.currentPrice,
            baselinePrice: sector.currentPrice,
            balance: sector.balance,
          },
          availableBalance: typeof sector.balance === 'number' ? sector.balance : 0,
          currentPrice: typeof sector.currentPrice === 'number' ? sector.currentPrice : undefined,
        });

        // Convert ChecklistItem objects to the format expected by finalizeChecklist
        refinedItems = checklistItems.map(item => ({
          action: item.actionType.toLowerCase(),
          reason: item.reasoning,
          reasoning: item.reasoning,
          confidence: item.confidence,
          workerConfidence: item.confidence,
          allocationPercent: item.allocationPercent,
          amount: item.amount,
          agentId: item.sourceAgentId,
          agentName: 'Discussion Consensus',
          symbol: item.symbol,
          // Keep the ChecklistItem structure for validation
          id: item.id,
          sourceAgentId: item.sourceAgentId,
          actionType: item.actionType,
          status: item.status,
        }));

        console.log(`[DiscussionEngine] Generated ${refinedItems.length} executable checklist items from discussion`);
      } catch (error) {
        console.error(`[DiscussionEngine] Failed to generate checklist from discussion: ${error.message}`);
        console.error(`[DiscussionEngine] Error stack:`, error.stack);
        // Fall through to legacy path if LLM generation fails
      }
    }

    if (confidenceUpdated && sector?.id && Array.isArray(sector.agents)) {
      try {
        await updateSector(sector.id, { agents: sector.agents });
      } catch (error) {
        console.warn(`[DiscussionEngine] Failed to update sector agents with new confidence for ${sector.id}:`, error);
      }
    }

    if (!useLlm || refinedItems.length === 0) {
      // Extract proposals from messages (new path using structured proposals)
      // Group messages by round to ensure multi-round refinement produces meaningful differences
      const itemsByRound = new Map();
      
      // Process messages and extract proposals
      allMessages.forEach((msg, index) => {
        // Check if message has a proposal (new format)
        if (msg.proposal && typeof msg.proposal === 'object') {
          const proposal = msg.proposal;
          
          // Extract proposal data
          const action = (proposal.action || 'HOLD').toLowerCase();
          const symbol = proposal.symbol || 'UNKNOWN';
          const allocationPercent = typeof proposal.allocationPercent === 'number'
            ? Math.max(0, Math.min(100, proposal.allocationPercent))
            : 0;
          const confidence = typeof proposal.confidence === 'number'
            ? Math.max(0, Math.min(100, proposal.confidence))
            : 50;
          const reasoning = typeof proposal.reasoning === 'string' && proposal.reasoning.trim()
            ? proposal.reasoning.trim()
            : 'No reasoning provided';
          
          // Calculate amount from allocation percent if sector balance is available
          let amount = 0;
          if (sector && typeof sector.balance === 'number' && sector.balance > 0) {
            amount = Math.round((allocationPercent / 100) * sector.balance);
          } else {
            // Fallback: calculate based on confidence
            amount = Math.round((confidence / 100) * 1000);
          }
          
          // Determine round number from message
          let round = 1;
          if (Array.isArray(discussionRoom.checklistDraft)) {
            const draftItem = discussionRoom.checklistDraft.find(
              item => item.agentId === msg.agentId
            );
            if (draftItem && typeof draftItem.round === 'number') {
              round = draftItem.round;
            } else {
              // Infer round from message position (assuming equal messages per round)
              const agentsPerRound = Math.max(1, discussionAgents.length);
              round = Math.floor(index / agentsPerRound) + 1;
            }
          } else {
            // Infer round from message position
            const agentsPerRound = Math.max(1, discussionAgents.length);
            round = Math.floor(index / agentsPerRound) + 1;
          }
          
          // Group items by round to track refinement
          if (!itemsByRound.has(round)) {
            itemsByRound.set(round, []);
          }
          
          itemsByRound.get(round).push({
            action: action,
            reason: reasoning,
            reasoning: reasoning,
            confidence: Math.round(confidence * 10) / 10, // Round to 1 decimal
            allocationPercent: allocationPercent,
            amount: amount,
            round: round,
            agentId: msg.agentId,
            agentName: msg.agentName,
            symbol: symbol
          });
        } else {
          // Legacy path: parse message content (backward compatibility)
          const content = msg.content || '';
          
          // Extract action from message content
          let action = 'hold';
          const contentLower = content.toLowerCase();
          const actionMatch = contentLower.match(/is\s+(buy|sell|hold|rebalance)/);
          if (actionMatch) {
            action = actionMatch[1];
          } else {
            if (contentLower.includes('rebalance')) {
              action = 'rebalance';
            } else if (contentLower.includes('buy')) {
              action = 'buy';
            } else if (contentLower.includes('sell')) {
              action = 'sell';
            } else if (contentLower.includes('hold')) {
              action = 'hold';
            }
          }
          
          // Extract confidence from message content
          const confidenceMatch = content.match(/confidence\s+([\d.]+)/i);
          let confidence = 50;
          if (confidenceMatch) {
            confidence = parseFloat(confidenceMatch[1]) || 50;
          } else {
            const agent = discussionAgents.find(a => a.id === msg.agentId);
            if (agent && typeof agent.confidence === 'number') {
              confidence = Math.max(0, Math.min(100, agent.confidence + 50));
            }
          }
          
          const reason = content || `Action proposed by ${msg.agentName || 'agent'}`;
          const amount = Math.round((confidence / 100) * 1000);
          
          let round = 1;
          if (Array.isArray(discussionRoom.checklistDraft)) {
            const draftItem = discussionRoom.checklistDraft.find(
              item => item.agentId === msg.agentId && item.text === content
            );
            if (draftItem && typeof draftItem.round === 'number') {
              round = draftItem.round;
            } else {
              const agentsPerRound = Math.max(1, discussionAgents.length);
              round = Math.floor(index / agentsPerRound) + 1;
            }
          } else {
            const agentsPerRound = Math.max(1, discussionAgents.length);
            round = Math.floor(index / agentsPerRound) + 1;
          }
          
          if (!itemsByRound.has(round)) {
            itemsByRound.set(round, []);
          }
          
          itemsByRound.get(round).push({
            action: action,
            reason: reason,
            confidence: Math.round(confidence * 10) / 10,
            amount: amount,
            round: round,
            agentId: msg.agentId,
            agentName: msg.agentName
          });
        }
      });

      // Refine items across rounds - later rounds should refine/consolidate earlier rounds
      // For multi-round refinement: take the most recent round's items, but incorporate insights from earlier rounds
      const legacyRefined = [];
      const rounds = Array.from(itemsByRound.keys()).sort((a, b) => a - b);
      
      if (rounds.length > 0) {
        // Get items from the latest round (most refined)
        const latestRound = Math.max(...rounds);
        const latestRoundItems = itemsByRound.get(latestRound) || [];
        
        // Group by action type and consolidate
        const itemsByAction = new Map();
        latestRoundItems.forEach(item => {
          const key = item.action;
          if (!itemsByAction.has(key)) {
            itemsByAction.set(key, []);
          }
          itemsByAction.get(key).push(item);
        });
        
        // Create consolidated items - one per action type with averaged confidence and summed amounts
        itemsByAction.forEach((items, action) => {
          const avgConfidence = items.reduce((sum, item) => sum + item.confidence, 0) / items.length;
          const totalAmount = items.reduce((sum, item) => sum + item.amount, 0);
          const reasons = items.map(item => item.reason).join('; ');
          
          // Create ChecklistItem with only required fields: action, reason, confidence, amount
          legacyRefined.push({
            action: action, // "buy" | "sell" | "hold" | "rebalance"
            reason: reasons || `Consolidated ${action} action from round ${latestRound}`,
            confidence: Math.round(avgConfidence * 10) / 10,
            amount: totalAmount
          });
        });
        
        // If we have earlier rounds, incorporate their insights into the reason
        if (rounds.length > 1) {
          legacyRefined.forEach(item => {
            const earlierRounds = rounds.filter(r => r < latestRound);
            if (earlierRounds.length > 0) {
              const earlierInsights = earlierRounds.map(round => {
                const roundItems = itemsByRound.get(round) || [];
                const matchingItems = roundItems.filter(i => i.action === item.action);
                return matchingItems.map(i => i.reason).join('; ');
              }).filter(Boolean).join(' | ');
              
              if (earlierInsights) {
                item.reason = `${item.reason} [Refined from earlier rounds: ${earlierInsights}]`;
              }
            }
          });
        }
      }

      refinedItems = legacyRefined;
    }

    // Validate: Ensure at least 1 item exists
    if (refinedItems.length === 0) {
      const warning = `[DiscussionEngine] Cannot finalize checklist for discussion ${discussionId}: No checklist items found. Discussion has ${allMessages.length} messages but no valid items could be extracted. Round: ${roundCount}`;
      console.warn(warning);
      // Update timestamp to track this attempt
      discussionRoom.updateLastChecklistItemTimestamp();
      await saveDiscussion(discussionRoom);
      throw new Error(warning);
    }
    
    console.log(`[DiscussionEngine] Generated ${refinedItems.length} checklist items for discussion ${discussionId} (Round ${roundCount})`);

    // Create the complete checklist object
    const checklist = {
      sectorId: discussionRoom.sectorId,
      items: refinedItems,
      createdBy: createdBy,
      createdAt: new Date(),
      roundCount: roundCount
    };

    // Update discussion room with checklist
    // Include agent information from the original messages for display purposes
    const checklistItemsWithRound = refinedItems.map((item, index) => {
      // Find the first message that contributed to this item (for agent info)
      const contributingMessage = allMessages.find(msg => {
        const msgContent = (msg.content || '').toLowerCase();
        const itemAction = (item.action || '').toLowerCase();
        return msgContent.includes(itemAction) || msgContent.includes(item.reason?.toLowerCase() || '');
      });
      
      return {
        id: `checklist-${discussionRoom.id}-${index}`,
        action: item.action,
        reason: item.reason,
        reasoning: item.reasoning || item.reason,
        confidence: item.confidence,
        workerConfidence: item.workerConfidence || item.confidence,
        allocationPercent: item.allocationPercent,
        amount: item.amount,
        round: roundCount, // Ensure round is set
        agentId: item.agentId || contributingMessage?.agentId,
        agentName: item.agentName || contributingMessage?.agentName,
        workerProposal: item.workerProposal || null,
        status: 'PENDING' // Initialize as PENDING for manager evaluation
      };
    });
    
    // Update checklist and timestamp
    discussionRoom.checklist = checklistItemsWithRound;
    discussionRoom.updateLastChecklistItemTimestamp();
    
    // Log checklist creation per agent
    const agentChecklistCounts = {};
    checklistItemsWithRound.forEach(item => {
      const agentId = item.agentId || item.sourceAgentId || 'unknown';
      agentChecklistCounts[agentId] = (agentChecklistCounts[agentId] || 0) + 1;
    });
    console.log(`[DiscussionEngine] Checklist items per agent for discussion ${discussionId}:`, agentChecklistCounts);

    // Also update checklistDraft for backward compatibility
    discussionRoom.checklistDraft = refinedItems.map((item, index) => ({
      id: `draft-final-${discussionRoom.id}-${index}`,
      action: item.action,
      reasoning: item.reasoning || item.reason,
      confidence: item.confidence,
      workerConfidence: item.workerConfidence || item.confidence,
      allocationPercent: item.allocationPercent,
      amount: item.amount,
      workerProposal: item.workerProposal || null,
      status: 'pending',
      createdAt: new Date().toISOString()
    }));

    // Save discussion with checklist
    await saveDiscussion(discussionRoom);

    // Transition to IN_PROGRESS if not already
    await transitionStatus(discussionId, STATUS.IN_PROGRESS, 'Checklist finalized, ready for manager review');

    console.log(`[DiscussionEngine] Finalized checklist for discussion ${discussionId}: ${refinedItems.length} items across ${roundCount} rounds`);

    // Trigger manager evaluation of checklist items
    try {
      const ManagerEngine = require('./ManagerEngine');
      const managerEngine = new ManagerEngine();
      await managerEngine.managerEvaluateChecklist(discussionId);
      console.log(`[DiscussionEngine] Manager evaluation completed for discussion ${discussionId}`);
    } catch (error) {
      console.error(`[DiscussionEngine] Error during manager evaluation:`, error);
      // Don't throw - allow discussion to continue even if evaluation fails
    }

    // Return the complete checklist object
    return checklist;
  }

  /**
   * Run all 3 rounds of discussion automatically
   * @param {Object} sector - Sector object
   * @param {Array<Object>} agents - Array of agent objects
   * @returns {Promise<Object>} Updated sector with completed discussion
   */
  async runAllRounds(sector, agents) {
    if (!sector || !sector.id) {
      throw new Error('Invalid sector: sector and sector.id are required');
    }

    // Find the active discussion for this sector
    const discussions = Array.isArray(sector.discussions) ? sector.discussions : [];
    if (discussions.length === 0) {
      throw new Error(`No discussion found for sector ${sector.id}`);
    }

    const discussionId = discussions[discussions.length - 1];
    let discussionData = await findDiscussionById(discussionId);
    if (!discussionData) {
      throw new Error(`Discussion ${discussionId} not found`);
    }

    let discussionRoom = DiscussionRoom.fromData(discussionData);

    // Run 2 rounds (reduced from 3 for faster lifecycle)
    for (let round = 1; round <= 2; round++) {
      // Reload discussion to get latest state
      discussionData = await findDiscussionById(discussionId);
      discussionRoom = DiscussionRoom.fromData(discussionData);
      
      // Get previous messages for context
      const previousMessages = Array.isArray(discussionRoom.messages) ? discussionRoom.messages : [];

      // Determine how many messages each agent should send
      let messagesPerAgent = 1;
      if (round === 1) {
        messagesPerAgent = 1; // Round 1: one initial message per agent
      } else {
        // Rounds 2-3: 1-2 follow-up messages per agent
        messagesPerAgent = Math.floor(Math.random() * 2) + 1; // Random 1 or 2
      }

      // Generate messages from each agent
      for (const agent of agents) {
        if (!agent || !agent.id) {
          continue;
        }

        // Only include agents that are part of this discussion
        if (!discussionRoom.agentIds.includes(agent.id)) {
          continue;
        }

        // Generate 1-2 messages per agent for this round
        for (let msgIndex = 0; msgIndex < messagesPerAgent; msgIndex++) {
          const messageData = await this.generateAgentMessageWithLLM(agent, sector, previousMessages);
          
          // Add message to discussion with analysis and proposal
          discussionRoom.addMessage({
            id: `${discussionRoom.id}-msg-${discussionRoom.messages.length}`,
            agentId: agent.id,
            agentName: agent.name || 'Unknown Agent',
            content: messageData.analysis, // Full LLM response as message content
            analysis: messageData.analysis, // Full LLM response
            proposal: messageData.proposal, // Structured proposal for checklist
            role: 'agent', // Always 'agent' for discussion messages
            timestamp: new Date().toISOString()
          });
        }
      }

      // Update round number (set to next round)
      discussionRoom.round = round + 1;

      // Save updated discussion
      await saveDiscussion(discussionRoom);
    }

    // After round 3, create draft checklist
    discussionData = await findDiscussionById(discussionId);
    discussionRoom = DiscussionRoom.fromData(discussionData);
    
    const useLlm = (process.env.USE_LLM || '').toLowerCase() === 'true';
    const checklistDraft = [];
    let agentsUpdated = false;

    if (useLlm) {
      const sectorTypeRaw = (
        sector?.sectorType ||
        sector?.type ||
        sector?.category ||
        sector?.assetClass ||
        ''
      ).toString().toLowerCase();
      const sectorType = ['crypto', 'equities', 'forex', 'commodities'].includes(sectorTypeRaw)
        ? sectorTypeRaw
        : 'other';

      const sectorState = {
        sectorName: sector?.sectorName || sector?.name || sector?.symbol || discussionRoom.sectorId,
        sectorType,
        simulatedPrice: typeof sector?.currentPrice === 'number' ? sector.currentPrice : 100,
        baselinePrice: typeof sector?.baselinePrice === 'number'
          ? sector.baselinePrice
          : (typeof sector?.initialPrice === 'number' ? sector.initialPrice : 100),
        volatility: typeof sector?.volatility === 'number' ? sector.volatility : (sector?.riskScore || 0) / 100,
        trendDescriptor: typeof sector?.changePercent === 'number'
          ? `${sector.changePercent}% change`
          : 'flat',
        trendPercent: typeof sector?.changePercent === 'number' ? sector.changePercent : undefined,
        balance: typeof sector?.balance === 'number' ? sector.balance : undefined,
        allowedSymbols: [
          sector?.symbol,
          sector?.sectorSymbol,
          sector?.ticker,
          sector?.name,
          sector?.sectorName,
        ].filter((sym) => typeof sym === 'string' && sym.trim() !== ''),
      };

      for (const agent of agents) {
        const agentProfile = {
          name: agent.name || agent.id || 'worker agent',
          roleDescription: agent.prompt || agent.description || agent.role || 'worker'
        };

        try {
          const proposal = await generateWorkerProposal({
            agentProfile,
            sectorState
          });

          const allocationAmount = typeof sector?.balance === 'number'
            ? Math.max(0, Math.round((proposal.allocationPercent / 100) * sector.balance))
            : Math.max(0, Math.round(proposal.allocationPercent * 10));

          checklistDraft.push({
            id: `draft-final-${discussionRoom.id}-${agent.id}-${checklistDraft.length}`,
            action: proposal.action,
            allocationPercent: proposal.allocationPercent,
            confidence: proposal.confidence,
            workerConfidence: proposal.confidence,
            reasoning: proposal.reasoning,
            symbol: proposal.symbol || sector?.symbol || sector?.sectorSymbol || '',
            amount: allocationAmount,
            status: 'pending',
            createdAt: new Date().toISOString(),
            agentId: agent.id,
            agentName: agent.name || 'Unknown Agent',
            workerProposal: proposal
          });

          const updatedConfidence = await this._applyProposalConfidence(agent, proposal.confidence, sector);
          if (updatedConfidence !== null) {
            agentsUpdated = true;
          }
        } catch (error) {
          console.warn(`[DiscussionEngine] Failed to generate worker proposal for ${agent.id}:`, error);
        }
      }
    }

    // Fallback to legacy placeholder if LLM disabled or produced no proposals
    if (!useLlm || checklistDraft.length === 0) {
      const allMessages = Array.isArray(discussionRoom.messages) ? discussionRoom.messages : [];
      const messageSummaries = allMessages.map(msg => msg.content).join(' ');
      const combinedSummary = messageSummaries || 'Discussion completed with agent input';

      checklistDraft.push({
        id: `draft-final-${discussionRoom.id}`,
        action: 'deploy capital',
        reasoning: combinedSummary,
        status: 'pending',
        createdAt: new Date().toISOString()
      });
    }

    discussionRoom.checklistDraft = checklistDraft;

    // Keep a matching checklist view for manager review
    discussionRoom.checklist = checklistDraft.map((item, index) => ({
      ...item,
      id: item.id || `checklist-${discussionRoom.id}-${index}`,
      status: 'PENDING',
      workerProposal: item.workerProposal || null
    }));

    // Save finalized discussion
    await saveDiscussion(discussionRoom);

    // Transition to IN_PROGRESS if not already
    await transitionStatus(discussionRoom.id, STATUS.IN_PROGRESS, 'Checklist finalized, ready for manager review');

    // Update sector
    const sectorUpdates = { discussions: discussions };
    if (agentsUpdated && Array.isArray(sector.agents)) {
      sectorUpdates.agents = sector.agents;
    }
    let updatedSector = await updateSector(sector.id, sectorUpdates);
    updatedSector.discussions = discussions;

    // Auto-approve the checklist via ManagerEngine
    try {
      const ManagerEngine = require('./ManagerEngine');
      const managerEngine = new ManagerEngine();
      updatedSector = await managerEngine.approveOrRejectChecklist(updatedSector);
      console.log(`[DiscussionEngine] Auto-approved checklist for discussion ${discussionId}`);
    } catch (error) {
      console.error(`[DiscussionEngine] Error auto-approving checklist:`, error);
      // Don't throw - discussion was created successfully, just approval failed
    }

    return updatedSector;
  }

  /**
   * Start a new discussion for a sector (by sectorId)
   * Multi-round: Creates a discussion with status 'OPEN'
   * @param {string} sectorId - Sector ID
   * @returns {Promise<Object>} Discussion object
   */
  async startDiscussionById(sectorId) {
    if (!sectorId) {
      throw new Error('sectorId is required');
    }

    const { getSectorById } = require('../utils/sectorStorage');
    const { loadDiscussions } = require('../utils/discussionStorage');
    const { loadAgents } = require('../utils/agentStorage');
    let sector = await getSectorById(sectorId);
    
    if (!sector) {
      throw new Error(`Sector ${sectorId} not found`);
    }

    // VALIDATION 0: Validate and auto-fill market data before starting discussion
    const { validateMarketDataForDiscussion } = require('../utils/marketDataValidation');
    sector = await validateMarketDataForDiscussion(sector);

    // VALIDATION 1: SERIAL EXECUTION LOCK - Check for existing active discussion (IN_PROGRESS or OPEN)
    // Only ONE active discussion per sector at a time
    // New discussion allowed ONLY after previous is CLOSED or DECIDED
    const { hasActiveDiscussion } = require('../utils/discussionStorage');
    const { hasActive, activeDiscussion } = await hasActiveDiscussion(sectorId);
    
    if (hasActive && activeDiscussion) {
      throw new Error(`Cannot start discussion: There is already an active discussion for this sector (ID: ${activeDiscussion.id}, status: ${activeDiscussion.status}). Only one active discussion per sector is allowed.`);
    }

    // VALIDATION 2: Check sector balance > 0
    const sectorBalance = typeof sector.balance === 'number' ? sector.balance : 0;
    if (sectorBalance <= 0) {
      throw new Error(`Cannot start discussion: Sector balance must be greater than 0. Current balance: ${sectorBalance}`);
    }

    // VALIDATION 3: Check all agents have confidence > 65
    const allAgents = await loadAgents();
    const allSectorAgents = allAgents.filter(a => a && a.id && a.sectorId === sectorId);
    
    if (allSectorAgents.length > 0) {
      const allAboveThreshold = allSectorAgents.every(agent => extractConfidence(agent) > 65);
      
      if (!allAboveThreshold) {
        const agentDetails = allSectorAgents.map(a => `${a.name || a.id}: ${extractConfidence(a)}`).join(', ');
        throw new Error(`Cannot start discussion: Not all agents have confidence > 65. Current confidences: ${agentDetails}`);
      }
    }

    const updatedSector = await this.startDiscussion(sector);
    
    // Return the discussion from the updated sector
    const discussions = Array.isArray(updatedSector.discussions) ? updatedSector.discussions : [];
    if (discussions.length === 0) {
      throw new Error('Discussion was created but not found in sector');
    }

    const discussionId = discussions[discussions.length - 1];
    const discussionData = await findDiscussionById(discussionId);
    
    if (!discussionData) {
      throw new Error(`Discussion ${discussionId} not found`);
    }

    return DiscussionRoom.fromData(discussionData);
  }

  /**
   * Submit checklist items for a round
   * Multi-round: Workers submit checklist items for the current round
   * @param {string} discussionId - Discussion ID
   * @param {Array<Object>} checklistItems - Array of checklist items
   * @returns {Promise<Object>} Updated discussion
   */
  async submitChecklistRound(discussionId, checklistItems) {
    if (!discussionId) {
      throw new Error('discussionId is required');
    }

    if (!Array.isArray(checklistItems)) {
      throw new Error('checklistItems must be an array');
    }

    const discussionData = await findDiscussionById(discussionId);
    if (!discussionData) {
      throw new Error(`Discussion ${discussionId} not found`);
    }

    const discussionRoom = DiscussionRoom.fromData(discussionData);

    // Ensure discussion is in_progress (not decided/closed)
    if (discussionRoom.status === 'decided' || discussionRoom.status === 'CLOSED' || discussionRoom.status === 'closed') {
      throw new Error(`Discussion ${discussionId} is already decided/closed. Current status: ${discussionRoom.status}`);
    }

    // Get sector to validate allowed symbols
    const sector = await getSectorById(discussionRoom.sectorId);
    if (!sector) {
      throw new Error(`Sector ${discussionRoom.sectorId} not found for discussion ${discussionId}`);
    }

    // Get allowed symbols from sector
    const allowedSymbols = Array.isArray(sector.allowedSymbols)
      ? sector.allowedSymbols
      : [sector.symbol, sector.name, sector.sectorSymbol].filter(
          (sym) => typeof sym === 'string' && sym.trim() !== ''
        );

    if (allowedSymbols.length === 0) {
      throw new Error(`Sector ${discussionRoom.sectorId} has no allowed symbols configured`);
    }

    // Validate each checklist item has executable payload
    // Import validation function (TypeScript module)
    const { validateChecklistItem } = require('../discussions/workflow/checklistBuilder');
    const currentRound = discussionRoom.currentRound || 1;

    const validatedItems = [];
    for (const item of checklistItems) {
      try {
        // Ensure required fields are present
        const itemToValidate = {
          ...item,
          id: item.id || `checklist-${discussionId}-${currentRound}-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`,
          status: item.status || 'PENDING',
        };

        // Validate the executable payload
        const validated = validateChecklistItem(itemToValidate, {
          allowedSymbols,
          allowZeroAmount: itemToValidate.actionType === 'HOLD',
        });

        // Add round number for tracking (not part of executable payload, but useful metadata)
        validatedItems.push({
          ...validated,
          round: item.round || currentRound,
        });
      } catch (error) {
        console.error(`[DiscussionEngine] Invalid checklist item rejected:`, error.message, item);
        throw new Error(
          `Invalid checklist item: ${error.message}. Checklist items MUST be created from parsed LLM output with valid executable payload.`
        );
      }
    }

    // Update checklist with validated items
    discussionRoom.checklist = validatedItems;
    discussionRoom.updatedAt = new Date().toISOString();

    await saveDiscussion(discussionRoom);

    // Trigger manager evaluation of newly submitted checklist items
    try {
      const ManagerEngine = require('./ManagerEngine');
      const managerEngine = new ManagerEngine();
      await managerEngine.managerEvaluateChecklist(discussionId);
      console.log(`[DiscussionEngine] Manager evaluation completed for submitted round in discussion ${discussionId}`);
    } catch (error) {
      console.error(`[DiscussionEngine] Error during manager evaluation:`, error);
      // Don't throw - allow discussion to continue even if evaluation fails
    }

    return discussionRoom;
  }

  /**
   * Advance discussion to next round after manager evaluation
   * Multi-round: Increments currentRound, saves snapshot to roundHistory
   * @param {string} discussionId - Discussion ID
   * @returns {Promise<Object>} Updated discussion
   */
  async advanceDiscussionRound(discussionId) {
    if (!discussionId) {
      throw new Error('discussionId is required');
    }

    const discussionData = await findDiscussionById(discussionId);
    if (!discussionData) {
      throw new Error(`Discussion ${discussionId} not found`);
    }

    const discussionRoom = DiscussionRoom.fromData(discussionData);

    // Ensure discussion is in_progress (not decided/closed)
    if (discussionRoom.status === 'decided' || discussionRoom.status === 'CLOSED' || discussionRoom.status === 'closed') {
      throw new Error(`Cannot advance round: Discussion ${discussionId} is already decided/closed. Current status: ${discussionRoom.status}`);
    }

    const currentRound = discussionRoom.currentRound || 1;
    
    // Check max rounds limit
    const ManagerEngine = require('./ManagerEngine');
    const managerEngine = new ManagerEngine();
    const MAX_ROUNDS = managerEngine.MAX_ROUNDS || 2;
    
    if (currentRound >= MAX_ROUNDS) {
      console.log(`[DiscussionEngine] Discussion ${discussionId} has reached max rounds (${MAX_ROUNDS}). Cannot advance further.`);
      // Force resolve pending items if not already done
      await managerEngine.forceResolvePendingItems(discussionId);
      return discussionRoom;
    }

    // Create snapshot of current round
    const roundSnapshot = {
      round: currentRound,
      checklist: Array.isArray(discussionRoom.checklist) ? [...discussionRoom.checklist] : [],
      managerDecisions: Array.isArray(discussionRoom.managerDecisions) ? [...discussionRoom.managerDecisions] : [],
      timestamp: new Date().toISOString()
    };

    // Add snapshot to roundHistory
    if (!Array.isArray(discussionRoom.roundHistory)) {
      discussionRoom.roundHistory = [];
    }
    discussionRoom.roundHistory.push(roundSnapshot);

    // Increment currentRound
    discussionRoom.currentRound = currentRound + 1;
    discussionRoom.round = discussionRoom.currentRound; // Keep round in sync for backward compatibility
    discussionRoom.updatedAt = new Date().toISOString();

    // Reset checklist for next round (workers will submit new items)
    // Keep items marked as REVISE_REQUIRED or RESUBMITTED in the checklist
    const itemsToKeep = Array.isArray(discussionRoom.checklist)
      ? discussionRoom.checklist.filter(item => 
          item.status === 'REVISE_REQUIRED' || item.status === 'RESUBMITTED'
        )
      : [];
    
    discussionRoom.checklist = itemsToKeep.map(item => ({
      ...item,
      status: item.status === 'RESUBMITTED' ? 'PENDING' : item.status, // RESUBMITTED becomes PENDING for re-evaluation
      round: discussionRoom.currentRound
    }));

    await saveDiscussion(discussionRoom);

    return discussionRoom;
  }

  /**
   * Get current discussion state
   * Multi-round: Returns current round, checklist, status, and roundHistory
   * @param {string} discussionId - Discussion ID
   * @returns {Promise<Object>} Current discussion state
   */
  async getCurrentDiscussionState(discussionId) {
    if (!discussionId) {
      throw new Error('discussionId is required');
    }

    const discussionData = await findDiscussionById(discussionId);
    if (!discussionData) {
      throw new Error(`Discussion ${discussionId} not found`);
    }

    const discussionRoom = DiscussionRoom.fromData(discussionData);

    return {
      id: discussionRoom.id,
      sectorId: discussionRoom.sectorId,
      status: discussionRoom.status,
      currentRound: discussionRoom.currentRound || 1,
      checklist: Array.isArray(discussionRoom.checklist) ? discussionRoom.checklist : [],
      roundHistory: Array.isArray(discussionRoom.roundHistory) ? discussionRoom.roundHistory : [],
      managerDecisions: Array.isArray(discussionRoom.managerDecisions) ? discussionRoom.managerDecisions : [],
      updatedAt: discussionRoom.updatedAt,
      createdAt: discussionRoom.createdAt
    };
  }

  /**
   * Clamp a confidence value to 0–100.
   * @param {number} value
   * @returns {number}
   */
_clampConfidence(value) {
  if (typeof value !== 'number' || !Number.isFinite(value)) {
    return 1;
  }
  return Math.max(1, Math.min(100, value));
}

  /**
   * Update an agent's confidence based on an LLM proposal and persist it.
   * Also mutates the provided sector's agents array to keep in sync for responses.
   * 
   * Confidence is now derived directly from LLM output - no automatic increases.
   * 
   * @param {Object} agent
   * @param {number} proposalConfidence - LLM-provided confidence value (1-100)
   * @param {Object|null} sector
   * @returns {Promise<number|null>} Updated confidence or null if agent invalid
   */
  async _applyProposalConfidence(agent, proposalConfidence, sector = null) {
    if (!agent || !agent.id) {
      return null;
    }

    // Get LLM confidence output (clamp to 1-100)
    const llmConfidenceOutput = this._clampConfidence(
      typeof proposalConfidence === 'number' ? proposalConfidence : 1
    );
    
    // Use LLM confidence directly - no automatic increases
    const updatedConfidence = llmConfidenceOutput;

    console.debug('[DiscussionEngine] Agent confidence update (LLM-derived)', {
      agentId: agent.id,
      llmConfidenceOutput: llmConfidenceOutput,
      updatedConfidence
    });

    try {
      await updateAgent(agent.id, { confidence: updatedConfidence });
    } catch (error) {
      console.warn(`[DiscussionEngine] Failed to persist confidence for ${agent.id}:`, error);
    }

    agent.confidence = updatedConfidence;

    if (sector && Array.isArray(sector.agents)) {
      sector.agents = sector.agents.map(a => {
        if (a && a.id === agent.id) {
          return { ...a, confidence: updatedConfidence };
        }
        return a;
      });
    }

    return updatedConfidence;
  }

  /**
   * Generate a message from an agent using LLM
   * @param {Object} agent - Agent object
   * @param {Object} sector - Sector object
   * @param {Array<Object>} previousMessages - Array of previous messages in the discussion
   * @returns {Promise<Object>} Generated message with {analysis, proposal} structure
   */
  async generateAgentMessageWithLLM(agent, sector, previousMessages = []) {
    const agentName = agent.name || 'Unknown Agent';
    
    // Skip manager agents
    if (agent.role === 'manager') {
      return {
        analysis: `${agentName}: Manager agents do not contribute to discussion rounds.`,
        proposal: {
          action: 'HOLD',
          symbol: sector?.symbol || sector?.name || 'UNKNOWN',
          allocationPercent: 0,
          confidence: 0,
          reasoning: 'Manager agents do not contribute to discussion rounds.'
        }
      };
    }

    // Build sector state for LLM context
    const sectorName = sector?.sectorName || sector?.name || sector?.id || 'Unknown Sector';
    const sectorTypeRaw = (
      sector?.sectorType ||
      sector?.type ||
      sector?.category ||
      sector?.assetClass ||
      ''
    ).toString().toLowerCase();
    const sectorType = ['crypto', 'equities', 'forex', 'commodities'].includes(sectorTypeRaw)
      ? sectorTypeRaw
      : 'other';

    // Extract agent properties
    const agentRole = agent.role || 'general';
    const agentStyle = agent.style || agent.personality?.decisionStyle || 'Balanced';
    const agentRiskLevel = agent.riskTolerance || agent.personality?.riskTolerance || 'medium';
    
    // Extract sector data
    const currentPrice = typeof sector?.currentPrice === 'number' ? sector.currentPrice : 100;
    const baselinePrice = typeof sector?.baselinePrice === 'number'
      ? sector.baselinePrice
      : (typeof sector?.initialPrice === 'number' ? sector.initialPrice : 100);
    const trendPercent = typeof sector?.changePercent === 'number' ? sector.changePercent : 0;
    const volatility = typeof sector?.volatility === 'number' ? sector.volatility : (sector?.riskScore || 0) / 100;
    const sectorBalance = typeof sector?.balance === 'number' ? sector.balance : 0;
    
    const allowedSymbols = [
      sector?.symbol,
      sector?.sectorSymbol,
      sector?.ticker,
      sector?.name,
      sector?.sectorName,
    ].filter((sym) => typeof sym === 'string' && sym.trim() !== '');

    // Use LLM for worker agents if enabled
    if (isLlmEnabled) {
      try {
        const { callLLM } = require('../ai/llmClient');
        
        // Build comprehensive system prompt with all required information
        const systemPrompt = [
          `You are ${agentName}, a trading agent participating in a discussion about the ${sectorName} sector.`,
          `Your role: ${agentRole}`,
          `Your style: ${agentStyle}`,
          `Your risk level: ${agentRiskLevel}`,
          `Sector: ${sectorName}`,
          `Current sector balance: $${sectorBalance.toFixed(2)}`,
          `Latest price: $${currentPrice.toFixed(2)}`,
          `Trend: ${trendPercent > 0 ? '+' : ''}${trendPercent.toFixed(2)}%`,
          `Volatility: ${(volatility * 100).toFixed(2)}%`,
          '',
          'You are analyzing market data and must propose a concrete trading action.',
          'Decision guidelines:',
          `- If trend is positive (>2%) and volatility is reasonable (<30%), strongly consider BUY with higher confidence (60-85%)`,
          `- If trend is negative (<-2%) and volatility is reasonable, consider SELL with appropriate confidence (50-80%)`,
          `- Only choose HOLD if market signals are truly neutral or uncertain (confidence should be low: 5-30%)`,
          `- Your confidence MUST reflect the strength of market signals: strong trends = higher confidence, weak signals = lower confidence`,
          `- For BUY/SELL actions, allocation_percent should be 10-30% based on confidence and risk`,
          `- For HOLD actions, allocation_percent should be 0%`,
          'Your response should be a clear, concise analysis with a specific recommendation.',
          'Focus on the current market conditions, price trends, and risk factors.',
          'Use the actual market data provided above to justify your decision.',
        ].join('\n');

        // Build user prompt that asks for structured JSON output
        const userPrompt = [
          'Analyze the current market data and provide your trading recommendation.',
          '',
          'You MUST respond with a JSON object containing:',
          '{',
          '  "action": "BUY" | "SELL" | "HOLD",',
          '  "allocationPercent": number (0-100),',
          '  "confidence": number (0-100),',
          '  "reasoning": string or string[] (your analysis and reasoning),',
          '  "riskNotes": string or string[] (optional risk assessment)',
          '}',
          '',
          'Important:',
          '- Your confidence MUST be based on the strength of market signals and your reasoning',
          '- Strong conviction with clear signals (trend >2% or <-2%) should have confidence 60-85',
          '- Moderate signals should have confidence 40-60',
          '- Weak/uncertain signals (HOLD) should have confidence 5-30',
          '- Reference specific numbers from the market data in your reasoning',
          '- Provide a clear, detailed analysis in the reasoning field that explains your confidence level.',
        ].join('\n');

        // Call LLM in JSON mode to get structured output
        console.log(`[DiscussionEngine] Calling LLM in JSON mode for agent ${agentName} (${agent.id}) in sector ${sectorName}`);
        let structuredProposal;
        let analysisText = '';
        
        try {
          const jsonResponse = await callLLM({
            systemPrompt,
            userPrompt,
            jsonMode: true,
            maxTokens: 1000
          });

          // Parse JSON response - use normalizeLLMDecision for graceful error handling
          let parsed;
          try {
            parsed = JSON.parse(jsonResponse);
          } catch (parseError) {
            // JSON parsing failed - use normalizeLLMDecision to create valid fallback
            console.warn(`[DiscussionEngine] Failed to parse LLM JSON response for agent ${agent.id}: ${parseError.message}`);
            parsed = null; // Will trigger normalizeLLMDecision fallback
          }

          // Use normalizeLLMDecision to handle all parsing/validation failures gracefully
          const { normalizeLLMDecision } = require('../ai/normalizeLLMDecision');
          const normalized = normalizeLLMDecision(
            parsed,
            `${agentName} recommends maintaining current position due to insufficient market signals.`
          );

          // Determine symbol from allowed symbols
          const symbol = allowedSymbols.length > 0 ? allowedSymbols[0] : sectorName;

          structuredProposal = {
            action: normalized.action,
            symbol: symbol,
            allocationPercent: normalized.allocationPercent,
            confidence: normalized.confidence,
            reasoning: normalized.reasoning,
            riskNotes: parsed && parsed.riskNotes 
              ? (Array.isArray(parsed.riskNotes) ? parsed.riskNotes.join(' ').trim() : parsed.riskNotes.trim())
              : undefined
          };

          // Create analysis text from the structured data for display (user-friendly, no error messages)
          // Include confidence reasoning in the message
          const confidenceReasoning = structuredProposal.confidence >= 50 
            ? `High confidence (${structuredProposal.confidence}%) - strong conviction in ${structuredProposal.action} recommendation.`
            : structuredProposal.confidence >= 25
            ? `Moderate confidence (${structuredProposal.confidence}%) - ${structuredProposal.action} with some uncertainty.`
            : `Low confidence (${structuredProposal.confidence}%) - ${structuredProposal.action} due to limited conviction.`;
          
          analysisText = [
            `${agentName} recommends: ${structuredProposal.action}`,
            `Allocation: ${structuredProposal.allocationPercent}%`,
            `Confidence: ${structuredProposal.confidence}%`,
            `Confidence Reasoning: ${confidenceReasoning}`,
            '',
            `Reasoning: ${structuredProposal.reasoning}`,
            structuredProposal.riskNotes ? `\nRisk Notes: ${structuredProposal.riskNotes}` : ''
          ].join('\n').trim();

          console.log(`[DiscussionEngine] Parsed structured proposal for agent ${agentName}:`, {
            action: structuredProposal.action,
            allocationPercent: structuredProposal.allocationPercent,
            confidence: structuredProposal.confidence,
            reasoningLength: structuredProposal.reasoning.length
          });
        } catch (llmError) {
          // LLM call failed - create fallback proposal with user-friendly message
          console.error(`[DiscussionEngine] LLM call failed for agent ${agent.id}: ${llmError.message}`);
          const fallbackSymbol = allowedSymbols && allowedSymbols.length > 0 
            ? allowedSymbols[0] 
            : (sector?.symbol || sector?.name || 'UNKNOWN');
          structuredProposal = {
            action: 'HOLD',
            symbol: fallbackSymbol,
            allocationPercent: 0,
            confidence: 1,
            reasoning: `${agentName} recommends maintaining current position due to insufficient market signals.`
          };
          analysisText = [
            `${agentName} recommends: HOLD`,
            `Allocation: 0%`,
            `Confidence: 1%`,
            `Confidence Reasoning: Low confidence (1%) - HOLD due to insufficient market signals.`,
            '',
            `Reasoning: ${structuredProposal.reasoning}`
          ].join('\n').trim();
        }

        return {
          analysis: analysisText, // Formatted analysis text for display
          proposal: structuredProposal // Structured proposal object for checklist
        };
      } catch (error) {
        console.error(`[DiscussionEngine] Failed to generate LLM message for agent ${agent.id}:`, error.message);
        console.error(`[DiscussionEngine] Full error:`, error);
        console.error(`[DiscussionEngine] Error stack:`, error.stack);
        // Fallback to simple message if LLM fails - but still create a valid message with user-friendly text
        const fallbackSymbol = allowedSymbols && allowedSymbols.length > 0 
          ? allowedSymbols[0] 
          : (sector?.symbol || sector?.name || 'UNKNOWN');
        const fallbackReasoning = `${agentName} recommends maintaining current position due to insufficient market signals.`;
        return {
          analysis: [
            `${agentName} recommends: HOLD`,
            `Allocation: 0%`,
            `Confidence: 1%`,
            `Confidence Reasoning: Low confidence (1%) - HOLD due to insufficient market signals.`,
            '',
            `Reasoning: ${fallbackReasoning}`
          ].join('\n').trim(),
          proposal: {
            action: 'HOLD',
            symbol: fallbackSymbol,
            allocationPercent: 0,
            confidence: 1,
            reasoning: fallbackReasoning
          }
        };
      }
    } else {
      // Fallback when LLM is disabled
      return {
        analysis: `${agentName}: LLM is disabled. Cannot generate proposal.`,
        proposal: {
          action: 'HOLD',
          symbol: sector?.symbol || sector?.name || 'UNKNOWN',
          allocationPercent: 0,
          confidence: 0,
          reasoning: 'LLM is disabled. Cannot generate proposal.'
        }
      };
    }
  }

  /**
   * @deprecated Use generateAgentMessageWithLLM instead. This method generates placeholder messages.
   * Generate a message from an agent using template format
   * @param {Object} agent - Agent object
   * @param {string} sectorName - Sector name
   * @param {Array<Object>} previousMessages - Array of previous messages in the discussion
   * @param {number} currentRound - Current round number (1, 2, or 3)
   * @param {number} messageIndex - Index of message within the round (0, 1, etc.)
   * @returns {string} Generated message content
   */
  generateAgentMessage(agent, sectorName = 'Unknown Sector', previousMessages = [], currentRound = 1, messageIndex = 0) {
    const agentName = agent.name || 'Unknown Agent';
    let agentConfidence = typeof agent.confidence === 'number' ? agent.confidence : 0;
    
    // Add variation to confidence for test agents to generate diverse actions
    // This ensures test agents don't always generate the same action type
    if (agentName.includes('TEST') || agentName.includes('test')) {
      // For test agents, add variation based on message index and round
      // This creates a pattern: different actions across different messages
      const variationSeed = (messageIndex * 7 + currentRound * 13) % 100;
      const variation = (variationSeed - 50) * 0.8; // Range: -40 to +40
      agentConfidence = agentConfidence + variation;
    }
    
    // Determine action based on confidence value
    // Positive confidence -> buy, negative -> sell, near zero -> rebalance, very near zero -> hold
    let action = 'hold';
    if (agentConfidence > 30) {
      action = 'buy';
    } else if (agentConfidence < -30) {
      action = 'sell';
    } else if (agentConfidence >= -10 && agentConfidence <= 10) {
      // Near-zero confidence suggests rebalancing is needed
      action = 'rebalance';
    } else {
      // Moderate confidence (between -30 and -10, or 10 and 30) -> hold
      action = 'hold';
    }
    
    // Format confidence value for display (0-100 scale)
    const confidenceValue = Math.max(0, Math.min(100, agentConfidence + 50)); // Convert from -50/+50 to 0-100
    
    // Use template format: "Agent {name}: Proposed action for {sector} is {buy/hold/sell/rebalance} because of confidence {value}"
    return `Agent ${agentName}: Proposed action for ${sectorName} is ${action} because of confidence ${confidenceValue.toFixed(1)}`;
  }

  /**
   * Worker reaction system for rejected checklist items
   * Automatically decides whether to revise or accept rejection based on decision logic
   * @param {string} discussionId - Discussion ID
   * @param {string} itemId - Checklist item ID
   * @returns {Promise<Object>} Updated discussion with worker response
   */
  async workerRespondToRejection(discussionId, itemId) {
    if (!discussionId) {
      throw new Error('discussionId is required');
    }
    if (!itemId) {
      throw new Error('itemId is required');
    }

    const discussionData = await findDiscussionById(discussionId);
    if (!discussionData) {
      throw new Error(`Discussion ${discussionId} not found`);
    }

    const discussionRoom = DiscussionRoom.fromData(discussionData);
    const checklistItems = Array.isArray(discussionRoom.checklist) ? discussionRoom.checklist : [];
    
    // Find the item
    const itemIndex = checklistItems.findIndex(item => item.id === itemId);
    if (itemIndex === -1) {
      throw new Error(`Checklist item ${itemId} not found in discussion ${discussionId}`);
    }

    const item = checklistItems[itemIndex];
    
    // Verify item is in REVISE_REQUIRED status
    if (item.status !== 'REVISE_REQUIRED' && !item.requiresRevision) {
      console.log(`[Worker Response] Item ${itemId} is not in REVISE_REQUIRED status. Current: ${item.status}`);
      return discussionRoom;
    }

    const managerReason = item.managerReason || '';
    const revisionCount = item.revisionCount || 0;

    // Decision logic:
    // 1. If idea rejected 2+ times → accept
    if (revisionCount >= 2) {
      item.status = 'ACCEPT_REJECTION';
      item.requiresRevision = false;
      console.log(`[Worker Response] Worker accepted rejection for item ${itemId} (rejected ${revisionCount} times)`);
    }
    // 2. If hard constraint (rule violation) → accept
    else if (this.isHardConstraint(managerReason)) {
      item.status = 'ACCEPT_REJECTION';
      item.requiresRevision = false;
      console.log(`[Worker Response] Worker accepted rejection for item ${itemId} (hard constraint: ${managerReason})`);
    }
    // 3. If managerReason is fixable → revise
    // 4. If risk too high but fixable → revise with lower size
    else {
      // Determine if we should reduce size due to risk
      const shouldReduceSize = this.isRiskTooHigh(managerReason);
      
      // Store current version in previousVersions before updating
      if (!item.previousVersions) {
        item.previousVersions = [];
      }
      item.previousVersions.push({
        action: item.action,
        amount: item.amount,
        reason: item.reason || item.reasoning || '',
        confidence: item.confidence,
        timestamp: new Date().toISOString()
      });

      // Modify item content based on manager reason
      this.applyRevision(item, managerReason, shouldReduceSize);

      // Update revision metadata
      item.revisionCount = revisionCount + 1;
      item.status = 'RESUBMITTED';
      item.requiresRevision = false;
      item.revisedAt = new Date().toISOString();
      
      // Clear manager decision for this item (will be re-evaluated)
      if (Array.isArray(discussionRoom.managerDecisions)) {
        const decisionIndex = discussionRoom.managerDecisions.findIndex(d => 
          d.item && d.item.id === itemId
        );
        if (decisionIndex !== -1) {
          discussionRoom.managerDecisions.splice(decisionIndex, 1);
        }
      }

      const sizeNote = shouldReduceSize ? ' with reduced size' : '';
      console.log(`[Worker Response] Worker revised item ${itemId}${sizeNote} (revision ${item.revisionCount})`);
    }

    // Update the item in checklist
    checklistItems[itemIndex] = item;
    discussionRoom.checklist = checklistItems;
    discussionRoom.updatedAt = new Date().toISOString();

    // Save updated discussion
    await saveDiscussion(discussionRoom);

    return discussionRoom;
  }

  /**
   * Check if manager reason indicates a hard constraint (rule violation)
   * @param {string} managerReason - Manager's rejection reason
   * @returns {boolean} True if hard constraint
   */
  isHardConstraint(managerReason) {
    if (!managerReason) return false;
    
    const reasonLower = managerReason.toLowerCase();
    const hardConstraintKeywords = [
      'violates rule',
      'rule violation',
      'not allowed',
      'forbidden',
      'prohibited',
      'invalid action',
      'constraint violation',
      'against policy',
      'policy violation'
    ];
    
    return hardConstraintKeywords.some(keyword => reasonLower.includes(keyword));
  }

  /**
   * Check if manager reason indicates risk is too high
   * @param {string} managerReason - Manager's rejection reason
   * @returns {boolean} True if risk too high
   */
  isRiskTooHigh(managerReason) {
    if (!managerReason) return false;
    
    const reasonLower = managerReason.toLowerCase();
    const riskKeywords = [
      'risk too high',
      'too risky',
      'excessive risk',
      'high risk',
      'risk threshold',
      'reduce size',
      'amount too large',
      'too much capital',
      'excessive amount'
    ];
    
    return riskKeywords.some(keyword => reasonLower.includes(keyword));
  }

  /**
   * Apply revision to item based on manager reason
   * @param {Object} item - Checklist item to revise
   * @param {string} managerReason - Manager's rejection reason
   * @param {boolean} shouldReduceSize - Whether to reduce the amount/size
   */
  applyRevision(item, managerReason, shouldReduceSize) {
    // If risk too high, reduce amount by 50%
    if (shouldReduceSize && item.amount && typeof item.amount === 'number') {
      item.amount = Math.max(1, Math.floor(item.amount * 0.5));
      // Also reduce confidence slightly
      if (item.confidence && typeof item.confidence === 'number') {
        item.confidence = Math.max(0.1, item.confidence * 0.9);
      }
    }

    // Adjust confidence if mentioned in reason
    const reasonLower = managerReason.toLowerCase();
    if (reasonLower.includes('confidence') || reasonLower.includes('low confidence')) {
      if (item.confidence && typeof item.confidence === 'number') {
        // Increase confidence slightly if it was too low
        item.confidence = Math.min(1.0, item.confidence * 1.1);
      }
    }

    // Update reasoning to acknowledge revision
    const revisionNote = shouldReduceSize 
      ? ' (Revised with reduced size based on risk feedback)'
      : ' (Revised based on feedback)';
    
    if (item.reason) {
      item.reason = item.reason.replace(/ \(Revised.*?\)$/, '') + revisionNote;
    } else if (item.reasoning) {
      item.reasoning = item.reasoning.replace(/ \(Revised.*?\)$/, '') + revisionNote;
    }
  }
}

module.exports = DiscussionEngine;
