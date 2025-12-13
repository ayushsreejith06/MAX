/**
 * Discussion Lifecycle Service
 * 
 * Manages the complete discussion lifecycle:
 * 1. Create - Automatically create discussion rooms when decisions are needed
 * 2. Discuss - Collect agent arguments and messages
 * 3. Decide - Aggregate votes and produce decisions
 * 4. Close - Close discussion rooms after decisions
 * 5. Archive - Archive closed discussions
 */

const DiscussionRoom = require('../../models/DiscussionRoom');
const { loadDiscussions, saveDiscussion, findDiscussionById } = require('../../utils/discussionStorage');
const { loadAgents } = require('../../utils/agentStorage');
const { loadSectors } = require('../../utils/storage');
const { vote } = require('../../manager/voting');
const { aggregateConfidenceForAction } = require('../../manager/confidence');
const { detectConflict, resolveConflict } = require('../../manager/conflict');
const ManagerAgent = require('../manager/ManagerAgent');
const { extractConfidence } = require('../../utils/confidenceUtils');
const DiscussionEngine = require('../../core/DiscussionEngine');
const { getSystemMode } = require('../../core/SystemMode');
const { transitionStatus, STATUS } = require('../../utils/discussionStatusService');

/**
 * Start a discussion for a sector
 * @param {string} sectorId - Sector ID
 * @param {string} title - Discussion title
 * @param {Array<string>} agentIds - Optional agent IDs to include
 * @param {boolean} skipThresholdCheck - Optional flag to skip confidence threshold check (for manual API calls)
 * @returns {Promise<DiscussionRoom>} Created discussion room
 */
async function startDiscussion(sectorId, title, agentIds = null, skipThresholdCheck = false) {
  try {
    // VALIDATION 1: SERIAL EXECUTION LOCK - Check for existing active discussion (IN_PROGRESS or OPEN) FIRST
    // Only ONE active discussion per sector at a time
    // New discussion allowed ONLY after previous is CLOSED or DECIDED
    // This check should happen BEFORE any other processing
    const { hasActiveDiscussion } = require('../../utils/discussionStorage');
    const { hasActive, activeDiscussion } = await hasActiveDiscussion(sectorId);
    
    if (hasActive && activeDiscussion) {
      console.log(`[DiscussionLifecycle] Cannot start discussion - Active discussion already exists for sector ${sectorId}: ${activeDiscussion.id} (status: ${activeDiscussion.status})`);
      throw new Error(`Cannot start discussion: There is already an active discussion for this sector (ID: ${activeDiscussion.id}, status: ${activeDiscussion.status}). Only one active discussion per sector is allowed.`);
    }

    // If agentIds not provided, get all agents in the sector
    if (!agentIds || agentIds.length === 0) {
      const agents = await loadAgents();
      const sectorAgents = agents.filter(a => 
        a.sectorId === sectorId && a.role !== 'manager'
      );
      agentIds = sectorAgents.map(a => a.id);
    }

    // VALIDATION 2: STRICT THRESHOLD CHECK (unless bypassed for manual API calls)
    // This check ensures ALL participating agents (non-manager) have confidence >= 65 before creating a discussion
    if (!skipThresholdCheck) {
      // GUARD: Reload agents from storage to prevent stale confidence values
      // This ensures we read confidence AFTER it was updated from LLM output
      // Flow order: LLM reasoning → extract confidence → discussion check
      const agents = await loadAgents();
      
      // Get participating agents (non-manager agents only)
      // If agentIds provided, use those; otherwise get all non-manager agents in sector
      let participatingAgents = [];
      if (agentIds && agentIds.length > 0) {
        participatingAgents = agents.filter(a => a && a.id && agentIds.includes(a.id));
      } else {
        participatingAgents = agents.filter(a => 
          a && a.id && 
          a.sectorId === sectorId && 
          a.role !== 'manager' && 
          !(a.role || '').toLowerCase().includes('manager')
        );
      }
      
      if (participatingAgents.length > 0) {
        // Check ALL participating agents (non-manager) have confidence >= 65
        // Manager confidence alone is insufficient - only participating agents are checked
        // extractConfidence reads from agent.llmAction.confidence (if LLM reasoning happened)
        // or agent.confidence (which is now LLM-derived)
        const allAboveThreshold = participatingAgents.every(agent => extractConfidence(agent) >= 65);
        
        if (!allAboveThreshold) {
          const agentDetails = participatingAgents.map(a => `${a.name || a.id}: ${extractConfidence(a)}`).join(', ');
          console.log(`[DiscussionLifecycle] DISCUSSION_SKIPPED - reason: LOW_CONFIDENCE - Not all participating agents meet threshold (>= 65). Agents: ${agentDetails}`);
          throw new Error(`Cannot start discussion: Not all participating agents have confidence >= 65. Current confidences: ${agentDetails}`);
        }
      } else {
        // No participating agents found
        console.log(`[DiscussionLifecycle] DISCUSSION_SKIPPED - reason: LOW_CONFIDENCE - No participating agents found for sector ${sectorId}`);
        throw new Error(`Cannot start discussion: No participating agents found for sector ${sectorId}`);
      }
    }

    // Check sector balance > 0
    const { getSectorById } = require('../../utils/sectorStorage');
    let sector = await getSectorById(sectorId);
    
    if (!sector) {
      throw new Error(`Sector ${sectorId} not found`);
    }

    // Validate and auto-fill market data before starting discussion
    const { validateMarketDataForDiscussion } = require('../../utils/marketDataValidation');
    sector = await validateMarketDataForDiscussion(sector);

    const sectorBalance = typeof sector.balance === 'number' ? sector.balance : 0;
    if (sectorBalance <= 0) {
      console.log(`[DiscussionLifecycle] Cannot start discussion - Sector balance (${sectorBalance}) must be greater than 0`);
      throw new Error(`Cannot start discussion: Sector balance must be greater than 0. Current balance: ${sectorBalance}`);
    }

    // Create new discussion room
    const discussionRoom = new DiscussionRoom(sectorId, title, agentIds);
    await saveDiscussion(discussionRoom);

    // Update agent statuses to DISCUSSING when they join the discussion
    const { updateMultipleAgentStatuses, STATUS: AGENT_STATUS } = require('../../utils/agentStatusService');
    try {
      await updateMultipleAgentStatuses(agentIds, AGENT_STATUS.DISCUSSING, `Joined discussion ${discussionRoom.id}`);
    } catch (error) {
      console.warn(`[DiscussionLifecycle] Failed to update agent statuses when starting discussion:`, error.message);
    }

    console.log(`[DiscussionLifecycle] Started discussion ${discussionRoom.id} for sector ${sectorId}`);

    // Immediately start rounds for this discussion
    try {
      const discussionEngine = new DiscussionEngine();
      console.log(`[DiscussionLifecycle] Starting rounds for discussion ${discussionRoom.id}`);
      await discussionEngine.startRounds(discussionRoom.id, 2); // Reduced to 2 rounds for faster lifecycle
      console.log(`[DiscussionLifecycle] Completed rounds for discussion ${discussionRoom.id}`);
      
      // Verify that messages were actually created
      const { findDiscussionById } = require('../../utils/discussionStorage');
      const updatedDiscussionData = await findDiscussionById(discussionRoom.id);
      if (updatedDiscussionData) {
        const messages = Array.isArray(updatedDiscussionData.messages) ? updatedDiscussionData.messages : [];
        if (messages.length === 0) {
          console.error(`[DiscussionLifecycle] WARNING: Discussion ${discussionRoom.id} was created but has no messages after rounds completed. Marking as CLOSED.`);
          // Mark discussion as CLOSED to prevent empty discussions
          await transitionStatus(discussionRoom.id, STATUS.CLOSED, 'No messages after rounds completed');
          throw new Error(`Discussion created but no messages were generated. Discussion marked as CLOSED.`);
        }
      }
    } catch (error) {
      console.error(`[DiscussionLifecycle] Error starting rounds for discussion ${discussionRoom.id}:`, error);
      
      // If rounds fail, mark the discussion as CLOSED to prevent empty discussions
      try {
        await transitionStatus(discussionRoom.id, STATUS.CLOSED, 'Round failure');
        console.error(`[DiscussionLifecycle] Marked discussion ${discussionRoom.id} as CLOSED due to round failure`);
      } catch (saveError) {
        console.error(`[DiscussionLifecycle] Failed to mark discussion as CLOSED:`, saveError);
      }
      
      // Re-throw the error so the caller knows the discussion creation failed
      throw new Error(`Failed to start rounds for discussion: ${error.message}`);
    }

    return discussionRoom;
  } catch (error) {
    console.error(`[DiscussionLifecycle] Error starting discussion:`, error);
    throw error;
  }
}

/**
 * Collect arguments from agents in a discussion
 * @param {string} discussionId - Discussion ID
 * @returns {Promise<Array>} Array of agent arguments/signals
 */
async function collectArguments(discussionId) {
  try {
    const discussionData = await findDiscussionById(discussionId);
    if (!discussionData) {
      throw new Error(`Discussion ${discussionId} not found`);
    }

    const discussionRoom = DiscussionRoom.fromData(discussionData);
    const agents = await loadAgents();
    const sectors = await loadSectors();
    
    // Get sector data for context
    const sector = sectors.find(s => s.id === discussionRoom.sectorId);
    const sectorAgents = agents.filter(a => 
      discussionRoom.agentIds.includes(a.id) && a.role !== 'manager'
    );

    const arguments = [];

    // For each agent, generate an argument/signal
    for (const agent of sectorAgents) {
      try {
        // Set agent status to DISCUSSING when participating
        const { setAgentDiscussing, setAgentThinking } = require('../../utils/agentStatusService');
        try {
          await setAgentDiscussing(agent.id, discussionId);
        } catch (error) {
          console.warn(`[DiscussionLifecycle] Failed to update agent ${agent.id} status to DISCUSSING:`, error.message);
        }

        let signal = null;
        let argumentText = '';

        // Try to use ResearchAgent if agent role is 'research'
        if (agent.role === 'research' || agent.role === 'analyst') {
          try {
            // Set status to THINKING when generating research signal
            try {
              await setAgentThinking(agent.id, `Producing research signal for discussion ${discussionId}`);
            } catch (error) {
              console.warn(`[DiscussionLifecycle] Failed to update agent ${agent.id} status to THINKING:`, error.message);
            }

            const ResearchAgent = require('../research/ResearchAgent');
            const researchAgent = new ResearchAgent({
              id: agent.id,
              name: agent.name,
              sectorId: agent.sectorId,
              personality: agent.personality || {},
              performance: agent.performance || {}
            });

            // Generate research signal
            const sectorSymbol = sector?.sectorSymbol || sector?.symbol || 'UNKNOWN';
            const researchSignal = await researchAgent.produceResearchSignal(sectorSymbol);
            
            // Set back to DISCUSSING after research signal generation
            try {
              await setAgentDiscussing(agent.id, discussionId);
            } catch (error) {
              console.warn(`[DiscussionLifecycle] Failed to update agent ${agent.id} status back to DISCUSSING:`, error.message);
            }
            
            if (researchSignal && researchSignal.action) {
              signal = {
                agentId: agent.id,
                action: researchSignal.action,
                confidence: researchSignal.confidence || 0.5,
                argument: researchSignal.rationale || `Based on research analysis: ${researchSignal.action}`
              };
              argumentText = signal.argument;
            }
          } catch (researchError) {
            console.warn(`[DiscussionLifecycle] Could not use ResearchAgent for ${agent.id}:`, researchError.message);
            // Fall through to default signal generation
          }
        }

        // If no research signal, generate signal based on agent personality and sector data
        if (!signal) {
          signal = generateAgentSignal(agent, sector);
          argumentText = signal.argument;
        }

        // Add message to discussion
        discussionRoom.addMessage({
          agentId: agent.id,
          agentName: agent.name,
          content: argumentText,
          role: agent.role || 'agent'
        });

        arguments.push(signal);
      } catch (error) {
        console.error(`[DiscussionLifecycle] Error collecting argument from agent ${agent.id}:`, error);
        // Add a fallback message even if signal generation fails
        try {
          discussionRoom.addMessage({
            agentId: agent.id,
            agentName: agent.name,
            content: `${agent.name} is analyzing the situation...`,
            role: agent.role || 'agent'
          });
        } catch (msgError) {
          console.error(`[DiscussionLifecycle] Failed to add fallback message:`, msgError);
        }
      }
    }

    // Normalize legacy statuses to IN_PROGRESS
    const currentStatus = (discussionRoom.status || '').toUpperCase();
    if (currentStatus === 'OPEN' || currentStatus === 'CREATED' || currentStatus === 'ACTIVE') {
      await transitionStatus(discussionId, STATUS.IN_PROGRESS, 'Collecting arguments');
    }

    await saveDiscussion(discussionRoom);

    console.log(`[DiscussionLifecycle] Collected ${arguments.length} arguments for discussion ${discussionId}`);
    return arguments;
  } catch (error) {
    console.error(`[DiscussionLifecycle] Error collecting arguments:`, error);
    throw error;
  }
}

/**
 * Generate a trading signal for an agent based on personality, performance, and sector data
 * @param {Object} agent - Agent object
 * @param {Object} sector - Sector object (optional)
 * @returns {Object} Signal object with action, confidence, and argument
 */
function generateAgentSignal(agent, sector = null) {
  const personality = agent.personality || {};
  const performance = agent.performance || {};
  const riskTolerance = personality.riskTolerance || 'medium';
  const decisionStyle = personality.decisionStyle || 'balanced';
  const winRate = performance.winRate || 0;
  const pnl = performance.pnl || 0;

  // Get sector context
  const currentPrice = sector?.currentPrice || 100;
  const changePercent = sector?.changePercent || 0;
  const volatility = sector?.volatility || 0.02;
  const riskScore = sector?.riskScore || 50;

  // Base confidence on agent performance
  let baseConfidence = 0.5;
  if (winRate > 0.6) {
    baseConfidence = 0.7;
  } else if (winRate > 0.4) {
    baseConfidence = 0.6;
  } else if (winRate < 0.3) {
    baseConfidence = 0.3;
  }

  // Adjust confidence based on risk tolerance
  if (riskTolerance === 'high') {
    baseConfidence = Math.min(baseConfidence + 0.1, 0.9);
  } else if (riskTolerance === 'low') {
    baseConfidence = Math.max(baseConfidence - 0.1, 0.2);
  }

  // Determine action based on sector trends and agent personality
  let action = 'HOLD';
  let confidence = baseConfidence;
  const rationaleParts = [];

  // Price trend analysis
  if (changePercent > 3) {
    // Strong upward trend
    if (riskTolerance === 'high' || decisionStyle === 'aggressive') {
      action = 'BUY';
      confidence = Math.min(baseConfidence + 0.2, 0.9);
      rationaleParts.push(`Strong upward trend (+${changePercent.toFixed(2)}%) suggests buying opportunity`);
    } else if (decisionStyle === 'conservative') {
      action = 'HOLD';
      rationaleParts.push(`Strong upward trend (+${changePercent.toFixed(2)}%) but conservative approach suggests waiting`);
    } else {
      action = 'BUY';
      confidence = baseConfidence + 0.1;
      rationaleParts.push(`Upward trend (+${changePercent.toFixed(2)}%) indicates potential gains`);
    }
  } else if (changePercent < -3) {
    // Strong downward trend
    if (riskTolerance === 'high' || decisionStyle === 'aggressive') {
      action = 'SELL';
      confidence = Math.min(baseConfidence + 0.2, 0.9);
      rationaleParts.push(`Strong downward trend (${changePercent.toFixed(2)}%) suggests selling to limit losses`);
    } else if (decisionStyle === 'conservative') {
      action = 'SELL';
      confidence = baseConfidence + 0.15;
      rationaleParts.push(`Downward trend (${changePercent.toFixed(2)}%) requires defensive action`);
    } else {
      action = 'HOLD';
      rationaleParts.push(`Downward trend (${changePercent.toFixed(2)}%) but balanced approach suggests waiting`);
    }
  } else if (changePercent > 1) {
    // Moderate upward trend
    if (decisionStyle === 'aggressive') {
      action = 'BUY';
      confidence = baseConfidence;
      rationaleParts.push(`Moderate upward trend (+${changePercent.toFixed(2)}%) supports buying`);
    } else {
      action = 'HOLD';
      rationaleParts.push(`Moderate upward trend (+${changePercent.toFixed(2)}%) - monitoring for stronger signals`);
    }
  } else if (changePercent < -1) {
    // Moderate downward trend
    if (decisionStyle === 'conservative') {
      action = 'SELL';
      confidence = baseConfidence;
      rationaleParts.push(`Moderate downward trend (${changePercent.toFixed(2)}%) suggests caution`);
    } else {
      action = 'HOLD';
      rationaleParts.push(`Moderate downward trend (${changePercent.toFixed(2)}%) - monitoring for clearer direction`);
    }
  } else {
    // Stable price
    action = 'HOLD';
    confidence = baseConfidence;
    rationaleParts.push(`Price is stable (${changePercent.toFixed(2)}%) - no clear directional signal`);
  }

  // Adjust for volatility
  if (volatility > 0.05) {
    confidence = Math.max(confidence - 0.1, 0.2);
    rationaleParts.push(`High volatility (${(volatility * 100).toFixed(1)}%) reduces confidence`);
  }

  // Add agent-specific context
  if (winRate > 0.5) {
    rationaleParts.push(`Strong track record (${(winRate * 100).toFixed(0)}% win rate) supports this view`);
  } else if (winRate < 0.3) {
    rationaleParts.push(`Cautious approach given recent performance (${(winRate * 100).toFixed(0)}% win rate)`);
  }

  if (pnl > 0) {
    rationaleParts.push(`Positive P&L (+${pnl.toFixed(2)}) indicates good decision-making`);
  } else if (pnl < -100) {
    rationaleParts.push(`Negative P&L (${pnl.toFixed(2)}) suggests need for careful analysis`);
  }

  // Build final argument text
  const argument = `${agent.name} (${riskTolerance} risk, ${decisionStyle} style): ${rationaleParts.join('. ')}. Recommendation: ${action} with ${(confidence * 100).toFixed(0)}% confidence.`;

  return {
    agentId: agent.id,
    action: action,
    confidence: Math.max(0.1, Math.min(0.95, confidence)), // Clamp between 0.1 and 0.95
    argument: argument
  };
}

/**
 * Aggregate votes from agent arguments
 * @param {Array} arguments - Array of agent arguments/signals
 * @returns {Promise<Object>} Voting result with action and vote breakdown
 */
async function aggregateVotes(arguments) {
  try {
    if (!arguments || arguments.length === 0) {
      return {
        action: 'HOLD',
        votes: { BUY: 0, SELL: 0, HOLD: 0 },
        confidenceSums: { BUY: 0, SELL: 0, HOLD: 0 }
      };
    }

    // Convert arguments to signals format
    const signals = arguments.map(arg => ({
      action: arg.action,
      confidence: arg.confidence,
      agentId: arg.agentId
    }));

    // Perform voting
    const votingResult = vote(signals);

    return votingResult;
  } catch (error) {
    console.error(`[DiscussionLifecycle] Error aggregating votes:`, error);
    throw error;
  }
}

/**
 * Produce a decision for a discussion
 * @param {string} discussionId - Discussion ID
 * @returns {Promise<Object>} Decision object
 */
async function produceDecision(discussionId) {
  try {
    const discussionData = await findDiscussionById(discussionId);
    if (!discussionData) {
      throw new Error(`Discussion ${discussionId} not found`);
    }

    const discussionRoom = DiscussionRoom.fromData(discussionData);

    // Collect arguments if not already done
    const arguments = await collectArguments(discussionId);

    if (arguments.length === 0) {
      throw new Error('No arguments collected for discussion');
    }

    // Aggregate votes
    const votingResult = await aggregateVotes(arguments);

    // Load agents for win rate data
    const agents = await loadAgents();
    const sectorAgents = agents.filter(a => 
      discussionRoom.agentIds.includes(a.id)
    );

    // Enrich signals with agent win rates
    const agentWinRates = {};
    sectorAgents.forEach(agent => {
      if (agent.id && agent.performance) {
        agentWinRates[agent.id] = agent.performance.winRate || 0;
      }
    });

    const enrichedSignals = arguments.map(arg => ({
      ...arg,
      winRate: agentWinRates[arg.agentId] || 0
    }));

    // Detect conflicts
    const conflictResult = detectConflict(enrichedSignals, 0.5);

    // Determine final action
    let finalAction = votingResult.action;
    let rationale = `Majority vote: ${votingResult.votes[finalAction]} agents voted ${finalAction}`;

    if (conflictResult.needsReview) {
      finalAction = resolveConflict(enrichedSignals);
      rationale = `Conflict detected (score: ${conflictResult.conflictScore.toFixed(2)}). Resolved using highest win-rate cluster: ${finalAction}`;
    }

    // Calculate final confidence
    const finalConfidence = aggregateConfidenceForAction(
      enrichedSignals,
      finalAction,
      agentWinRates
    );

    // Find selected agent (agent with highest confidence for the final action)
    const selectedAgentSignal = enrichedSignals
      .filter(s => s.action === finalAction)
      .sort((a, b) => (b.confidence * (1 + b.winRate)) - (a.confidence * (1 + a.winRate)))[0];

    // Get current sector price to track decision outcome later
    let priceAtDecision = null;
    try {
      const { loadSectors } = require('../../core/utils/sectorStorage');
      const sectors = await loadSectors();
      const sector = sectors.find(s => s.id === discussionRoom.sectorId);
      if (sector) {
        priceAtDecision = sector.currentPrice || sector.simulatedPrice || sector.lastSimulatedPrice || 100;
      }
    } catch (error) {
      console.warn(`[DiscussionLifecycle] Could not load sector price for decision tracking:`, error);
    }

    const decision = {
      action: finalAction,
      confidence: finalConfidence,
      rationale: rationale,
      voteBreakdown: votingResult.votes,
      conflictScore: conflictResult.conflictScore,
      selectedAgent: selectedAgentSignal?.agentId || null,
      priceAtDecision: priceAtDecision,
      timestamp: new Date().toISOString()
    };

    // Set decision on discussion room
    discussionRoom.setDecision(decision);
    await saveDiscussion(discussionRoom);

    // Update agent confidence after consensus is reached (no automatic adjustments; rely on LLM inputs)
    const updatedAgents = [];

    console.log(`[DiscussionLifecycle] Decision produced for discussion ${discussionId}: ${finalAction} (confidence: ${finalConfidence.toFixed(2)})`);

    // Add updated agents to decision result
    decision.updatedAgents = updatedAgents;

    return decision;
  } catch (error) {
    console.error(`[DiscussionLifecycle] Error producing decision:`, error);
    throw error;
  }
}

/**
 * Close a discussion (DEPRECATED - use ManagerEngine.closeDiscussion instead)
 * 
 * NOTE: Discussion closure is now controlled ONLY by the manager agent via ManagerEngine.closeDiscussion().
 * This function is kept for backward compatibility but should not be used for new code.
 * 
 * @deprecated Use ManagerEngine.closeDiscussion() instead for proper validation and closure logic
 * @param {string} discussionId - Discussion ID
 * @returns {Promise<DiscussionRoom>} Closed discussion room
 */
async function closeDiscussion(discussionId) {
  try {
    // Delegate to ManagerEngine for proper closure logic
    const ManagerEngine = require('../../core/ManagerEngine');
    const managerEngine = new ManagerEngine();
    
    console.warn(`[DiscussionLifecycle] closeDiscussion() is deprecated. Use ManagerEngine.closeDiscussion() instead.`);
    
    try {
      // Try to use the new manager-controlled closure
      return await managerEngine.closeDiscussion(discussionId);
    } catch (error) {
      // If manager closure fails (e.g., validation), fall back to legacy behavior
      // but log a warning
      console.warn(`[DiscussionLifecycle] Manager closure failed, using legacy closure: ${error.message}`);
      
      const discussionData = await findDiscussionById(discussionId);
      if (!discussionData) {
        throw new Error(`Discussion ${discussionId} not found`);
      }

      let discussionRoom = DiscussionRoom.fromData(discussionData);

      // If no decision has been made, produce one
      if (!discussionRoom.finalDecision) {
        await produceDecision(discussionId);
        // Reload discussion data after decision
        const updatedData = await findDiscussionById(discussionId);
        discussionRoom = DiscussionRoom.fromData(updatedData);
      }

      // Transition to AWAITING_EXECUTION when all items are terminal
      // Will transition to DECIDED when all ACCEPTED items are executed
      const { checkAndTransitionToAwaitingExecution } = require('../../utils/discussionStatusService');
      await checkAndTransitionToAwaitingExecution(discussionId);

      console.log(`[DiscussionLifecycle] Marked discussion ${discussionId} as AWAITING_EXECUTION (legacy mode)`);
      return discussionRoom;
    }
  } catch (error) {
    console.error(`[DiscussionLifecycle] Error closing discussion:`, error);
    throw error;
  }
}

/**
 * Archive a discussion (marks as decided)
 * @param {string} discussionId - Discussion ID
 * @returns {Promise<DiscussionRoom>} Decided discussion room
 */
async function archiveDiscussion(discussionId) {
  try {
    const discussionData = await findDiscussionById(discussionId);
    if (!discussionData) {
      throw new Error(`Discussion ${discussionId} not found`);
    }

    let discussionRoom = DiscussionRoom.fromData(discussionData);

    // Ensure discussion is decided before archiving
    const currentStatus = (discussionRoom.status || '').toUpperCase();
    if (currentStatus !== 'DECIDED' && currentStatus !== 'CLOSED') {
      await closeDiscussion(discussionId);
      // Reload discussion data after closing
      const updatedData = await findDiscussionById(discussionId);
      discussionRoom = DiscussionRoom.fromData(updatedData);
    }

    // Transition to AWAITING_EXECUTION when all items are terminal
    // Will transition to DECIDED when all ACCEPTED items are executed
    const updatedStatus = (discussionRoom.status || '').toUpperCase();
    if (updatedStatus !== 'DECIDED' && updatedStatus !== 'CLOSED' && updatedStatus !== 'AWAITING_EXECUTION') {
      const { checkAndTransitionToAwaitingExecution } = require('../../utils/discussionStatusService');
      await checkAndTransitionToAwaitingExecution(discussionId);
    }

    console.log(`[DiscussionLifecycle] Marked discussion ${discussionId} as decided`);
    return discussionRoom;
  } catch (error) {
    console.error(`[DiscussionLifecycle] Error marking discussion as decided:`, error);
    throw error;
  }
}

/**
 * Create a discussion room for a sector when a decision is needed
 * @param {string} sectorId - Sector ID
 * @param {string} triggerReason - Reason for creating the discussion
 * @returns {Promise<DiscussionRoom>} Created discussion room
 */
async function createDiscussionRoomForSector(sectorId, triggerReason = 'Decision needed') {
  try {
    const sectors = await loadSectors();
    const sector = sectors.find(s => s.id === sectorId);
    
    if (!sector) {
      throw new Error(`Sector ${sectorId} not found`);
    }

    const sectorName = sector.sectorName || sector.name || sectorId;
    const title = `Discussion: ${sectorName} - ${triggerReason}`;

    return await startDiscussion(sectorId, title);
  } catch (error) {
    console.error(`[DiscussionLifecycle] Error creating discussion room for sector:`, error);
    throw error;
  }
}

/**
 * Auto-discussion loop - checks sectors and creates/manages discussions
 * @param {number} intervalMs - Interval in milliseconds (default: 10000 = 10 seconds)
 * @returns {Object} Object with stop() method to stop the loop
 */
function autoDiscussionLoop(intervalMs = 10000) {
  let intervalId = null;
  let isRunning = false;

  const runLoop = async () => {
    if (isRunning) return;
    isRunning = true;

    try {
      const isSimulationMode = getSystemMode().isSimulationMode();
      const sectors = await loadSectors();
      const agents = await loadAgents();
      const discussions = await loadDiscussions();

      for (const sector of sectors) {
        try {
          // Get agents in this sector
          const sectorAgents = agents.filter(a => 
            a.sectorId === sector.id && a.role !== 'manager'
          );

          // Skip if no agents
          if (sectorAgents.length === 0) {
            continue;
          }

          // SERIAL EXECUTION LOCK - Check for existing active discussion (IN_PROGRESS or OPEN)
          // Only ONE active discussion per sector at a time
          const { hasActiveDiscussion } = require('../../utils/discussionStorage');
          const { hasActive, activeDiscussion } = await hasActiveDiscussion(sector.id);
          
          if (hasActive && activeDiscussion) {
            // Process existing active discussion
            const openDiscussion = activeDiscussion;
            
            if (openDiscussion) {
              // Process existing discussion
              const discussionRoom = DiscussionRoom.fromData(openDiscussion);

              // Normalize legacy statuses - ensure CREATED/OPEN transitions to IN_PROGRESS when processing
              const statusUpper = (discussionRoom.status || '').toUpperCase();
              if (statusUpper === 'OPEN' || statusUpper === 'CREATED' || statusUpper === 'ACTIVE') {
                // If it has messages, it should be IN_PROGRESS
                if (discussionRoom.messages && discussionRoom.messages.length > 0) {
                  await transitionStatus(discussionRoom.id, STATUS.IN_PROGRESS, 'Messages exist, discussion active');
                }
              }

              // If discussion has no messages, collect arguments
              if (discussionRoom.messages.length === 0) {
                try {
                  await collectArguments(discussionRoom.id);
                } catch (error) {
                  console.error(`[DiscussionLifecycle] Error collecting arguments for ${discussionRoom.id}:`, error.message);
                  // Continue processing other discussions even if one fails
                }
              }

              // If discussion is in_progress and has messages but no decision, produce decision
              const statusUpper2 = (discussionRoom.status || '').toUpperCase();
              if ((statusUpper2 === 'IN_PROGRESS' || statusUpper2 === 'OPEN') && 
                  discussionRoom.messages.length > 0 && 
                  !discussionRoom.finalDecision) {
                try {
                  await produceDecision(discussionRoom.id);
                } catch (error) {
                  console.error(`[DiscussionLifecycle] Error producing decision for ${discussionRoom.id}:`, error.message);
                  // Continue processing other discussions even if one fails
                }
              }

              // NOTE: Discussion closure is now controlled ONLY by the manager agent
              // via ManagerEngine.closeDiscussion(). Automatic closure has been removed.
              // The manager will evaluate checklist state and close when all items are resolved.
            }
          } else {
            if (!isSimulationMode) {
              continue;
            }
            // STRICT THRESHOLD: Check if we should create a new discussion
            // Create a discussion ONLY if:
            // 1. ALL participating agents (non-manager) have confidence >= 65
            // 2. Sector has balance > 0 (money available to deploy)
            // 3. Has agents to participate
            // 4. No recent discussion (within last minute)
            // 5. No active/in-progress discussions
            // Manager confidence alone is insufficient - only participating agents are checked
            
            // Get participating agents for the sector (non-manager agents only)
            // NOTE: Agents are loaded at the start of the loop (line 632)
            // For the main tick flow, SystemOrchestrator ensures agents are reloaded
            // after confidence updates to prevent stale values
            const participatingAgents = agents.filter(a => 
              a && a.id && 
              a.sectorId === sector.id && 
              a.role !== 'manager' && 
              !(a.role || '').toLowerCase().includes('manager')
            );
            
            if (participatingAgents.length === 0) {
              // No participating agents, skip
              console.log(`[DiscussionLifecycle] DISCUSSION_SKIPPED - reason: LOW_CONFIDENCE - No participating agents found for sector ${sector.id}`);
              continue;
            }
            
            // Check ALL participating agents (non-manager) have confidence >= 65
            // Manager confidence alone is insufficient - only participating agents are checked
            // extractConfidence reads from agent.llmAction.confidence (if LLM reasoning happened)
            // or agent.confidence (which is now LLM-derived)
            const allAboveThreshold = participatingAgents.every(agent => extractConfidence(agent) >= 65);
            
            if (!allAboveThreshold) {
              // Skip - not all participating agents meet threshold
              const agentDetails = participatingAgents.map(a => `${a.name || a.id}: ${extractConfidence(a)}`).join(', ');
              console.log(`[DiscussionLifecycle] DISCUSSION_SKIPPED - reason: LOW_CONFIDENCE - Not all participating agents meet threshold (>= 65) for sector ${sector.id}. Agents: ${agentDetails}`);
              continue;
            }
            
            // SERIAL EXECUTION LOCK - Check for existing active discussion (IN_PROGRESS or OPEN)
            // Only ONE active discussion per sector at a time
            // New discussion allowed ONLY after previous is CLOSED or DECIDED
            const { hasActiveDiscussion } = require('../../utils/discussionStorage');
            const { hasActive, activeDiscussion } = await hasActiveDiscussion(sector.id);
            
            if (hasActive && activeDiscussion) {
              // Skip - active discussion exists
              continue;
            }
            
            // Check sector balance
            const sectorBalance = typeof sector.balance === 'number' ? sector.balance : 0;
            
            if (sectorBalance > 0 && sectorAgents.length > 0) {
              // All strict checks passed - create a new discussion
              const sectorName = sector.sectorName || sector.name || sector.id;
              console.log(`[DiscussionLifecycle] Auto-creating discussion for sector ${sectorName} - All agents meet threshold (> 65), balance: ${sectorBalance}`);
              const newDiscussion = await createDiscussionRoomForSector(
                sector.id, 
                `Deploy available capital (Balance: ${sectorBalance})`
              );
              console.log(`[DiscussionLifecycle] AUTO_DISCUSSION_OPEN`, {
                event: 'AUTO_DISCUSSION_OPEN',
                sectorId: sector.id,
                discussionId: newDiscussion?.id,
                reason: 'all_agents_confident_balance_positive'
              });
            }
          }
        } catch (error) {
          console.error(`[DiscussionLifecycle] Error processing sector ${sector.id}:`, error);
        }
      }
    } catch (error) {
      console.error(`[DiscussionLifecycle] Error in auto-discussion loop:`, error);
    } finally {
      isRunning = false;
    }
  };

  const start = () => {
    if (intervalId) return;
    console.log(`[DiscussionLifecycle] Starting auto-discussion loop (interval: ${intervalMs}ms)`);
    intervalId = setInterval(runLoop, intervalMs);
    // Run immediately
    runLoop();
  };

  const stop = () => {
    if (intervalId) {
      clearInterval(intervalId);
      intervalId = null;
      console.log(`[DiscussionLifecycle] Stopped auto-discussion loop`);
    }
  };

  return {
    start,
    stop
  };
}

module.exports = {
  startDiscussion,
  collectArguments,
  aggregateVotes,
  produceDecision,
  closeDiscussion,
  archiveDiscussion,
  createDiscussionRoomForSector,
  autoDiscussionLoop
};

