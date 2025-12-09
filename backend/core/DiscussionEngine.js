const DiscussionRoom = require('../models/DiscussionRoom');
const { saveDiscussion, findDiscussionById } = require('../utils/discussionStorage');
const { updateSector } = require('../utils/sectorStorage');
const { loadAgents } = require('../utils/agentStorage');

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
    discussionRoom.status = 'active';
    discussionRoom.round = 1;
    discussionRoom.checklistDraft = [];
    discussionRoom.checklist = [];

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

    // Set final checklist and mark as completed
    discussionRoom.checklist = checklist;
    discussionRoom.status = 'completed';
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

    // Parse messages to extract checklist items
    // Group messages by round to ensure multi-round refinement produces meaningful differences
    const itemsByRound = new Map();
    
    // Process messages and group by round
    allMessages.forEach((msg, index) => {
      const content = msg.content || '';
      
      // Extract action from message content
      // Format: "Agent {name}: Proposed action for {sector} is {buy/hold/sell} because of confidence {value}"
      // Action must be one of: "buy" | "sell" | "hold" | "rebalance"
      let action = 'hold';
      const contentLower = content.toLowerCase();
      if (contentLower.includes('is buy') || contentLower.includes('buy')) {
        action = 'buy';
      } else if (contentLower.includes('is sell') || contentLower.includes('sell')) {
        action = 'sell';
      } else if (contentLower.includes('rebalance')) {
        action = 'rebalance';
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
    const refinedItems = [];
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
        refinedItems.push({
          action: action, // "buy" | "sell" | "hold" | "rebalance"
          reason: reasons || `Consolidated ${action} action from round ${latestRound}`,
          confidence: Math.round(avgConfidence * 10) / 10,
          amount: totalAmount
        });
      });
      
      // If we have earlier rounds, incorporate their insights into the reason
      if (rounds.length > 1) {
        refinedItems.forEach(item => {
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
        confidence: item.confidence,
        amount: item.amount,
        round: roundCount,
        agentId: item.agentId || contributingMessage?.agentId,
        agentName: item.agentName || contributingMessage?.agentName
      };
    });

    // Also update checklistDraft for backward compatibility
    discussionRoom.checklistDraft = refinedItems.map((item, index) => ({
      id: `draft-final-${discussionRoom.id}-${index}`,
      action: item.action,
      reasoning: item.reason,
      confidence: item.confidence,
      amount: item.amount,
      status: 'pending',
      createdAt: new Date().toISOString()
    }));

    // Mark discussion as ready for manager review
    discussionRoom.status = 'in_progress';
    discussionRoom.updatedAt = new Date().toISOString();

    // Save discussion with checklist
    await saveDiscussion(discussionRoom);

    console.log(`[DiscussionEngine] Finalized checklist for discussion ${discussionId}: ${refinedItems.length} items across ${roundCount} rounds`);

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
    
    // Create combined summary from all messages
    const allMessages = Array.isArray(discussionRoom.messages) ? discussionRoom.messages : [];
    const messageSummaries = allMessages.map(msg => msg.content).join(' ');
    const combinedSummary = messageSummaries || 'Discussion completed with agent input';

    // Create draft checklist with deploy capital action
    discussionRoom.checklistDraft = [{
      id: `draft-final-${discussionRoom.id}`,
      action: 'deploy capital',
      reasoning: combinedSummary,
      status: 'pending',
      createdAt: new Date().toISOString()
    }];

    // Mark discussion as ready for manager review
    discussionRoom.status = 'in_progress';
    discussionRoom.updatedAt = new Date().toISOString();

    // Save finalized discussion
    await saveDiscussion(discussionRoom);

    // Update sector
    let updatedSector = await updateSector(sector.id, {
      discussions: discussions
    });
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
    const agentConfidence = typeof agent.confidence === 'number' ? agent.confidence : 0;
    
    // Determine action based on confidence value
    // Positive confidence -> buy, negative -> sell, near zero -> hold
    let action = 'hold';
    if (agentConfidence > 20) {
      action = 'buy';
    } else if (agentConfidence < -20) {
      action = 'sell';
    }
    
    // Format confidence value for display (0-100 scale)
    const confidenceValue = Math.max(0, Math.min(100, agentConfidence + 50)); // Convert from -50/+50 to 0-100
    
    // Use template format: "Agent {name}: Proposed action for {sector} is {buy/hold/sell} because of confidence {value}"
    return `Agent ${agentName}: Proposed action for ${sectorName} is ${action} because of confidence ${confidenceValue.toFixed(1)}`;
  }
}

module.exports = DiscussionEngine;
