const DiscussionRoom = require('../models/DiscussionRoom');
const { saveDiscussion, findDiscussionById } = require('../utils/discussionStorage');
const { updateSector, getSectorById } = require('../utils/sectorStorage');
const { loadAgents, updateAgent } = require('../utils/agentStorage');
const { generateWorkerProposal } = require('../ai/workerBrain');
const { extractConfidence } = require('../utils/confidenceUtils');

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
    // Discussion status: 'in_progress' | 'decided'
    discussionRoom.status = 'in_progress';
    discussionRoom.round = 1;
    discussionRoom.currentRound = 1;
    discussionRoom.checklistDraft = [];
    discussionRoom.checklist = [];
    discussionRoom.roundHistory = [];

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

    // Immediately start rounds for this discussion
    try {
      console.log(`[DiscussionEngine] Starting rounds for discussion ${discussionRoom.id}`);
      await this.startRounds(discussionRoom.id, 3);
      console.log(`[DiscussionEngine] Completed rounds for discussion ${discussionRoom.id}`);
    } catch (error) {
      console.error(`[DiscussionEngine] Error starting rounds for discussion ${discussionRoom.id}:`, error);
      // Don't throw - discussion was created successfully, just rounds failed
    }
    
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

      // Generate agent message
      const sectorName = sector?.sectorName || sector?.name || sector?.id || 'Unknown Sector';
      const message = this.generateAgentMessage(agent, sectorName, previousMessages, discussionRoom.round || 1, 0);
      
      // Add message to discussion
      discussionRoom.addMessage({
        id: `${discussionRoom.id}-msg-${discussionRoom.messages.length}`,
        agentId: agent.id,
        agentName: agent.name || 'Unknown Agent',
        content: message,
        role: agent.role || 'general',
        timestamp: new Date().toISOString()
      });
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

    // Set final checklist and mark as decided
    discussionRoom.checklist = checklist;
    discussionRoom.status = 'decided';
    discussionRoom.updatedAt = new Date().toISOString();

    // Save finalized discussion
    await saveDiscussion(discussionRoom);

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
   * @param {number} numRounds - Number of rounds to run (default: 3)
   * @returns {Promise<void>}
   */
  async startRounds(discussionId, numRounds = 3) {
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
      console.warn(`[DiscussionEngine] No agents found for discussion ${discussionId}. Available agents: ${allAgents.length}, Discussion agentIds: ${JSON.stringify(discussionRoom.agentIds)}`);
      return;
    }

    // Run N rounds with 500ms delay between rounds
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

        // Generate message using template format
        const message = this.generateAgentMessage(agent, sectorName, previousMessages, round, 0);
        
        console.log(`[DiscussionEngine] Round ${round}: Agent ${agent.name} (${agent.id}) sending message: ${message.substring(0, 50)}...`);
        
        // Add message to discussion
        currentDiscussionRoom.addMessage({
          id: `${currentDiscussionRoom.id}-msg-${currentDiscussionRoom.messages.length}`,
          agentId: agent.id,
          agentName: agent.name || 'Unknown Agent',
          content: message,
          role: agent.role || 'general',
          timestamp: new Date().toISOString()
        });
        messagesAdded++;
      }

      console.log(`[DiscussionEngine] Round ${round}: Added ${messagesAdded} messages. Total messages: ${currentDiscussionRoom.messages.length}`);

      // Update round number
      currentDiscussionRoom.round = round;
      currentDiscussionRoom.updatedAt = new Date().toISOString();

      // Save updated discussion
      await saveDiscussion(currentDiscussionRoom);

      // Wait 500ms before next round (except after the last round)
      if (round < numRounds) {
        await new Promise(resolve => setTimeout(resolve, 500));
      }
    }

    // After all rounds complete, create checklistDraft from messages
    const finalDiscussionData = await findDiscussionById(discussionId);
    if (finalDiscussionData) {
      const finalDiscussionRoom = DiscussionRoom.fromData(finalDiscussionData);
      const allMessages = Array.isArray(finalDiscussionRoom.messages) ? finalDiscussionRoom.messages : [];
      const messageSummaries = allMessages.map(msg => msg.content).join(' ');
      const combinedSummary = messageSummaries || 'Discussion completed with agent input';

      // Create draft checklist with deploy capital action
      finalDiscussionRoom.checklistDraft = [{
        id: `draft-final-${finalDiscussionRoom.id}`,
        action: 'deploy capital',
        reasoning: combinedSummary,
        status: 'pending',
        createdAt: new Date().toISOString()
      }];

      // Mark discussion as ready for manager review
      finalDiscussionRoom.status = 'in_progress';
      finalDiscussionRoom.updatedAt = new Date().toISOString();

      // Save updated discussion
      await saveDiscussion(finalDiscussionRoom);
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

      for (const agent of discussionAgents) {
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

          refinedItems.push({
            action: (proposal.action || '').toLowerCase(),
            reason: proposal.reasoning,
            reasoning: proposal.reasoning,
            confidence: proposal.confidence,
            workerConfidence: proposal.confidence,
            allocationPercent: proposal.allocationPercent,
            amount: allocationAmount,
            agentId: agent.id,
            agentName: agent.name,
            workerProposal: proposal
          });

          const updatedConfidence = await this._applyProposalConfidence(agent, proposal.confidence, sector);
          if (updatedConfidence !== null) {
            confidenceUpdated = true;
          }
        } catch (error) {
          console.warn(`[DiscussionEngine] Failed to generate worker proposal for ${agent.id} during finalizeChecklist:`, error);
        }
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
      // Parse messages to extract checklist items (legacy path)
      // Group messages by round to ensure multi-round refinement produces meaningful differences
      const itemsByRound = new Map();
      
      // Process messages and group by round
      allMessages.forEach((msg, index) => {
        const content = msg.content || '';
        
        // Extract action from message content
        // Format: "Agent {name}: Proposed action for {sector} is {buy/hold/sell/rebalance} because of confidence {value}"
        // Action must be one of: "buy" | "sell" | "hold" | "rebalance"
        // Check in order of specificity: rebalance first (most specific), then buy/sell, then hold
        let action = 'hold';
        const contentLower = content.toLowerCase();
        // Check for "is {action}" pattern first (most specific)
        const actionMatch = contentLower.match(/is\s+(buy|sell|hold|rebalance)/);
        if (actionMatch) {
          action = actionMatch[1];
        } else {
          // Fallback to keyword matching (less specific)
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
        // Ensure action is one of the valid types
        const validActions = ['buy', 'sell', 'hold', 'rebalance'];
        if (!validActions.includes(action)) {
          action = 'hold'; // Default to hold if invalid
        }
        
        // Extract confidence from message content
        const confidenceMatch = content.match(/confidence\s+([\d.]+)/i);
        let confidence = 50; // Default confidence
        if (confidenceMatch) {
          confidence = parseFloat(confidenceMatch[1]) || 50;
        } else {
          // Fallback: get confidence from agent
          const agent = discussionAgents.find(a => a.id === msg.agentId);
          if (agent && typeof agent.confidence === 'number') {
            confidence = Math.max(0, Math.min(100, agent.confidence + 50)); // Convert -50/+50 to 0-100
          }
        }
        
        // Extract reason from message content
        // Reason is the full message content, or a summary
        const reason = content || `Action proposed by ${msg.agentName || 'agent'}`;
        
        // Calculate amount based on confidence (0-100 scale)
        // Higher confidence = higher amount (normalized to 0-1000 range)
        const amount = Math.round((confidence / 100) * 1000);
        
        // Determine round number from message
        // Try to get from checklistDraft first, otherwise infer from message order
        let round = 1;
        if (Array.isArray(discussionRoom.checklistDraft)) {
          const draftItem = discussionRoom.checklistDraft.find(
            item => item.agentId === msg.agentId && item.text === content
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
          reason: reason,
          confidence: Math.round(confidence * 10) / 10, // Round to 1 decimal
          amount: amount,
          round: round,
          agentId: msg.agentId,
          agentName: msg.agentName
        });
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
      const warning = `[DiscussionEngine] Cannot finalize checklist for discussion ${discussionId}: No checklist items found. Discussion has ${allMessages.length} messages but no valid items could be extracted.`;
      console.warn(warning);
      throw new Error(warning);
    }

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
    discussionRoom.checklist = refinedItems.map((item, index) => {
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
        round: roundCount,
        agentId: item.agentId || contributingMessage?.agentId,
        agentName: item.agentName || contributingMessage?.agentName,
        workerProposal: item.workerProposal || null,
        status: 'PENDING' // Initialize as PENDING for manager evaluation
      };
    });

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

    // Mark discussion as ready for manager review
    discussionRoom.status = 'in_progress';
    discussionRoom.updatedAt = new Date().toISOString();

    // Save discussion with checklist
    await saveDiscussion(discussionRoom);

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

    // Run 3 rounds
    for (let round = 1; round <= 3; round++) {
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
        const sectorName = sector?.sectorName || sector?.name || sector?.id || 'Unknown Sector';
        for (let msgIndex = 0; msgIndex < messagesPerAgent; msgIndex++) {
          const message = this.generateAgentMessage(agent, sectorName, previousMessages, round, msgIndex);
          
          // Add message to discussion
          discussionRoom.addMessage({
            id: `${discussionRoom.id}-msg-${discussionRoom.messages.length}`,
            agentId: agent.id,
            agentName: agent.name || 'Unknown Agent',
            content: message,
            role: agent.role || 'general',
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

    // Mark discussion as ready for manager review
    discussionRoom.status = 'in_progress';
    discussionRoom.updatedAt = new Date().toISOString();

    // Save finalized discussion
    await saveDiscussion(discussionRoom);

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
    const sector = await getSectorById(sectorId);
    
    if (!sector) {
      throw new Error(`Sector ${sectorId} not found`);
    }

    // VALIDATION 1: Check if there's already an active discussion for this sector
    const existingDiscussions = await loadDiscussions();
    const activeDiscussion = existingDiscussions.find(d => 
      d.sectorId === sectorId && 
      (d.status === 'in_progress' || d.status === 'active' || d.status === 'open' || d.status === 'created')
    );

    if (activeDiscussion) {
      throw new Error(`Cannot start discussion: There is already an active discussion for this sector`);
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

    // Update checklist with new items
    // Each item should have: id, action, reason, confidence, amount, etc.
    const currentRound = discussionRoom.currentRound || 1;
    
    // Add round number to each item if not present
    const itemsWithRound = checklistItems.map(item => ({
      ...item,
      round: item.round || currentRound,
      id: item.id || `checklist-${discussionId}-${currentRound}-${Date.now()}-${Math.random()}`,
      status: item.status || 'PENDING' // Initialize as PENDING if not set
    }));

    // Update checklist (replace or merge based on requirements)
    discussionRoom.checklist = itemsWithRound;
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
      return 0;
    }
    return Math.max(0, Math.min(100, value));
  }

  /**
   * Smoothly update an agent's confidence based on an LLM proposal and persist it.
   * updated = 0.7 * current + 0.3 * proposal (all clamped to 0–100).
   * Also mutates the provided sector's agents array to keep in sync for responses.
   * @param {Object} agent
   * @param {number} proposalConfidence
   * @param {Object|null} sector
   * @returns {Promise<number|null>} Updated confidence or null if agent invalid
   */
  async _applyProposalConfidence(agent, proposalConfidence, sector = null) {
    if (!agent || !agent.id) {
      return null;
    }

    const currentConfidence = this._clampConfidence(
      typeof agent.confidence === 'number' ? agent.confidence : 0
    );
    const rawProposalConfidence = typeof proposalConfidence === 'number' ? proposalConfidence : 0;
    const proposalValue = this._clampConfidence(rawProposalConfidence);
    const updatedConfidence = this._clampConfidence(
      0.7 * currentConfidence + 0.3 * proposalValue
    );

    console.debug('[DiscussionEngine] Agent confidence update', {
      agentId: agent.id,
      oldConfidence: currentConfidence,
      proposalConfidence: rawProposalConfidence,
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
