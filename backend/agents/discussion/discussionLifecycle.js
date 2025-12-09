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
const { updateAgentsConfidenceAfterConsensus } = require('../../simulation/confidence');
const DiscussionEngine = require('../../core/DiscussionEngine');

/**
 * Start a discussion for a sector
 * @param {string} sectorId - Sector ID
 * @param {string} title - Discussion title
 * @param {Array<string>} agentIds - Optional agent IDs to include
 * @returns {Promise<DiscussionRoom>} Created discussion room
 */
async function startDiscussion(sectorId, title, agentIds = null) {
  try {
    // If agentIds not provided, get all agents in the sector
    if (!agentIds || agentIds.length === 0) {
      const agents = await loadAgents();
      const sectorAgents = agents.filter(a => 
        a.sectorId === sectorId && a.role !== 'manager'
      );
      agentIds = sectorAgents.map(a => a.id);
    }

    // Check if there's already an open discussion for this sector
    const existingDiscussions = await loadDiscussions();
    const openDiscussion = existingDiscussions.find(d => 
      d.sectorId === sectorId && 
      (d.status === 'open' || d.status === 'created' || d.status === 'in_progress')
    );

    if (openDiscussion) {
      console.log(`[DiscussionLifecycle] Open discussion already exists for sector ${sectorId}: ${openDiscussion.id}`);
      return DiscussionRoom.fromData(openDiscussion);
    }

    // Create new discussion room
    const discussionRoom = new DiscussionRoom(sectorId, title, agentIds);
    await saveDiscussion(discussionRoom);

    console.log(`[DiscussionLifecycle] Started discussion ${discussionRoom.id} for sector ${sectorId}`);

    // Immediately start rounds for this discussion
    try {
      const discussionEngine = new DiscussionEngine();
      console.log(`[DiscussionLifecycle] Starting rounds for discussion ${discussionRoom.id}`);
      await discussionEngine.startRounds(discussionRoom.id, 3);
      console.log(`[DiscussionLifecycle] Completed rounds for discussion ${discussionRoom.id}`);
    } catch (error) {
      console.error(`[DiscussionLifecycle] Error starting rounds for discussion ${discussionRoom.id}:`, error);
      // Don't throw - discussion was created successfully, just rounds failed
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
        let signal = null;
        let argumentText = '';

        // Try to use ResearchAgent if agent role is 'research'
        if (agent.role === 'research' || agent.role === 'analyst') {
          try {
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

    // Update discussion status to 'in_progress' if it was 'open' or 'created'
    if (discussionRoom.status === 'open' || discussionRoom.status === 'created') {
      discussionRoom.status = 'in_progress';
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

    const decision = {
      action: finalAction,
      confidence: finalConfidence,
      rationale: rationale,
      voteBreakdown: votingResult.votes,
      conflictScore: conflictResult.conflictScore,
      selectedAgent: selectedAgentSignal?.agentId || null
    };

    // Set decision on discussion room
    discussionRoom.setDecision(decision);
    await saveDiscussion(discussionRoom);

    // Update agent confidence after consensus is reached
    let updatedAgents = [];
    try {
      // Get sector data for price change context
      const sectors = await loadSectors();
      const sector = sectors.find(s => s.id === discussionRoom.sectorId);
      const priceChangePercent = sector?.changePercent || 0;

      updatedAgents = await updateAgentsConfidenceAfterConsensus(
        discussionRoom.agentIds,
        {
          consensusReached: !conflictResult.needsReview || conflictResult.conflictScore < 0.7,
          finalAction: finalAction,
          finalConfidence: finalConfidence,
          priceChangePercent: priceChangePercent
        }
      );
    } catch (error) {
      console.error(`[DiscussionLifecycle] Error updating agent confidence after consensus:`, error);
    }

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
 * Close a discussion
 * @param {string} discussionId - Discussion ID
 * @returns {Promise<DiscussionRoom>} Closed discussion room
 */
async function closeDiscussion(discussionId) {
  try {
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

    discussionRoom.status = 'closed';
    discussionRoom.updatedAt = new Date().toISOString();
    await saveDiscussion(discussionRoom);

    console.log(`[DiscussionLifecycle] Closed discussion ${discussionId}`);
    return discussionRoom;
  } catch (error) {
    console.error(`[DiscussionLifecycle] Error closing discussion:`, error);
    throw error;
  }
}

/**
 * Archive a discussion
 * @param {string} discussionId - Discussion ID
 * @returns {Promise<DiscussionRoom>} Archived discussion room
 */
async function archiveDiscussion(discussionId) {
  try {
    const discussionData = await findDiscussionById(discussionId);
    if (!discussionData) {
      throw new Error(`Discussion ${discussionId} not found`);
    }

    let discussionRoom = DiscussionRoom.fromData(discussionData);

    // Ensure discussion is closed before archiving
    if (discussionRoom.status !== 'closed') {
      await closeDiscussion(discussionId);
      // Reload discussion data after closing
      const updatedData = await findDiscussionById(discussionId);
      discussionRoom = DiscussionRoom.fromData(updatedData);
    }

    discussionRoom.status = 'archived';
    discussionRoom.updatedAt = new Date().toISOString();
    await saveDiscussion(discussionRoom);

    console.log(`[DiscussionLifecycle] Archived discussion ${discussionId}`);
    return discussionRoom;
  } catch (error) {
    console.error(`[DiscussionLifecycle] Error archiving discussion:`, error);
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

          // Check if there's already an open discussion
          const openDiscussion = discussions.find(d => 
            d.sectorId === sector.id && 
            (d.status === 'open' || d.status === 'created' || d.status === 'in_progress')
          );

          if (openDiscussion) {
            // Process existing discussion
            const discussionRoom = DiscussionRoom.fromData(openDiscussion);

            // If discussion is open/created and has no messages, collect arguments
            if ((discussionRoom.status === 'open' || discussionRoom.status === 'created') && 
                discussionRoom.messages.length === 0) {
              try {
                await collectArguments(discussionRoom.id);
              } catch (error) {
                console.error(`[DiscussionLifecycle] Error collecting arguments for ${discussionRoom.id}:`, error.message);
                // Continue processing other discussions even if one fails
              }
            }

            // If discussion is in_progress and has messages but no decision, produce decision
            if (discussionRoom.status === 'in_progress' && 
                discussionRoom.messages.length > 0 && 
                !discussionRoom.finalDecision) {
              try {
                await produceDecision(discussionRoom.id);
              } catch (error) {
                console.error(`[DiscussionLifecycle] Error producing decision for ${discussionRoom.id}:`, error.message);
                // Continue processing other discussions even if one fails
              }
            }

            // If discussion has decision but is still in_progress or decided, close it
            if (discussionRoom.finalDecision && 
                (discussionRoom.status === 'in_progress' || discussionRoom.status === 'decided')) {
              try {
                await closeDiscussion(discussionRoom.id);
              } catch (error) {
                console.error(`[DiscussionLifecycle] Error closing discussion ${discussionRoom.id}:`, error.message);
                // Continue processing other discussions even if one fails
              }
            }

            // If discussion is closed for more than 1 minute, archive it
            if (discussionRoom.status === 'closed') {
              try {
                const closedTime = new Date(discussionRoom.updatedAt).getTime();
                const now = Date.now();
                if (now - closedTime > 60000) { // 1 minute
                  await archiveDiscussion(discussionRoom.id);
                }
              } catch (error) {
                console.error(`[DiscussionLifecycle] Error archiving discussion ${discussionRoom.id}:`, error.message);
                // Continue processing other discussions even if one fails
              }
            }
          } else {
            // Check if we should create a new discussion
            // Create a discussion if:
            // 1. Sector has balance > 0 (money available to deploy)
            // 2. Has agents to participate
            // 3. No recent discussion (within last minute)
            const sectorBalance = typeof sector.balance === 'number' ? sector.balance : 0;
            const recentDiscussions = discussions.filter(d => 
              d.sectorId === sector.id && 
              d.createdAt && 
              (Date.now() - new Date(d.createdAt).getTime()) < 60000 // Within last minute
            );

            if (sectorBalance > 0 && recentDiscussions.length === 0 && sectorAgents.length > 0) {
              // Create a new discussion to deploy available capital
              const sectorName = sector.sectorName || sector.name || sector.id;
              await createDiscussionRoomForSector(
                sector.id, 
                `Deploy available capital (Balance: ${sectorBalance})`
              );
              console.log(`[DiscussionLifecycle] Auto-created discussion for sector ${sectorName} (ID: ${sector.id}) - Balance: ${sectorBalance}`);
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

