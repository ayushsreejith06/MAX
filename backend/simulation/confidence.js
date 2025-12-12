/**
 * Confidence normalization - LLM-driven confidence updates
 * 
 * Phase 4: Confidence is monotonically increasing.
 * Phase 5: Confidence will be data-driven and bidirectional.
 * 
 * Phase 4 Rules:
 * - If LLM confidence <= previous_confidence, then confidence_next = min(previous_confidence + 2, 100)
 *   This ensures confidence always trends upward during Phase 4, even when LLM outputs conservative confidence.
 * - If LLM confidence > previous_confidence, then confidence_next = min(100, llm_confidence_output)
 * - Confidence can ONLY stay the same or increase
 * - Confidence can NEVER decrease in Phase 4
 * - Confidence MUST be capped at 100
 */

const { loadAgents, saveAgents, updateAgent } = require('../utils/agentStorage');
const { extractConfidence, clampConfidence } = require('../utils/confidenceUtils');

/**
 * Phase 4 confidence update: monotonically increasing confidence based on LLM output.
 * 
 * Phase 4: Confidence is monotonically increasing.
 * Phase 5: Confidence will be data-driven and bidirectional.
 * 
 * Phase 4 confidence growth assist:
 * - If LLM confidence <= previous_confidence, then confidence_next = min(previous_confidence + 2, 100)
 * - If LLM confidence > previous_confidence, then confidence_next = min(100, llm_confidence_output)
 * 
 * @param {number} previousConfidence - Previous confidence value
 * @param {number} llmConfidenceOutput - LLM-provided confidence value (0-100)
 * @returns {number} Updated confidence (monotonically increasing, capped at 100)
 */
function updateConfidencePhase4(previousConfidence, llmConfidenceOutput) {
  const previous = typeof previousConfidence === 'number' ? previousConfidence : 0;
  const llmConfidence = clampConfidence(typeof llmConfidenceOutput === 'number' ? llmConfidenceOutput : previous);
  
  // Phase 4: Confidence is monotonically increasing.
  // Phase 5: Confidence will be data-driven and bidirectional.
  
  // Phase 4 confidence growth assist
  // If LLM confidence <= previous_confidence, ensure minimum growth of +2
  if (llmConfidence <= previous) {
    return Math.min(previous + 2, 100);
  } else {
    // LLM confidence is higher, use it (capped at 100)
    return Math.min(100, llmConfidence);
  }
}

/**
 * Recalculate agent confidence based on LLM output.
 * 
 * Phase 4: Confidence is monotonically increasing.
 * Phase 5: Confidence will be data-driven and bidirectional.
 * 
 * @param {Object} agent - Agent object with id, role, performance, confidence, etc.
 * @param {Object} context - Context object containing:
 *   - llmConfidence: number (LLM-provided confidence value, 0-100) - REQUIRED for Phase 4
 *   - priceTrend: number (price change direction, positive = up, negative = down) (optional)
 *   - priceChangePercent: number (percentage change in price) (optional)
 *   - volatilityChange: number (change in volatility, positive = more volatile) (optional)
 *   - previousPerformance: Object with { pnl, winRate } or use agent.performance (optional)
 *   - sectorData: Object with sector information (optional)
 *   - decisionOutcome: Object with { action, priceChangePercent, success } (optional)
 * @returns {number} Updated confidence value (0 to 100)
 */
function recalcConfidence(agent, context = {}) {
  // Get previous confidence
  const previousConfidence = typeof agent.confidence === 'number' ? agent.confidence : 0;
  
  // Phase 4: Use LLM confidence output if provided
  // If LLM confidence is not provided, maintain previous confidence (no decay)
  let llmConfidenceOutput = previousConfidence; // Default: maintain current confidence
  
  if (context.llmConfidence !== undefined && typeof context.llmConfidence === 'number') {
    llmConfidenceOutput = context.llmConfidence;
  } else if (agent.llmAction && typeof agent.llmAction.confidence === 'number') {
    // Fallback: try to get LLM confidence from agent's llmAction
    llmConfidenceOutput = agent.llmAction.confidence;
  }
  
  // Phase 4: Confidence is monotonically increasing.
  // Phase 5: Confidence will be data-driven and bidirectional.
  // confidence_next = min(100, max(previous_confidence, llm_confidence_output))
  const newConfidence = updateConfidencePhase4(previousConfidence, llmConfidenceOutput);
  
  // Only log if there's a meaningful change
  if (Math.abs(newConfidence - previousConfidence) > 0.01) {
    console.log(`[Confidence] Updating agent ${agent.id || agent.name} confidence: ${previousConfidence.toFixed(2)} → ${newConfidence.toFixed(2)} (LLM: ${llmConfidenceOutput.toFixed(2)})`);
  }
  
  return newConfidence;
}

/**
 * Update confidence for all agents in a sector based on simulation tick context
 * @param {string} sectorId - Sector ID
 * @param {Object} tickContext - Context from simulation tick:
 *   - priceChangePercent: number
 *   - volatilityChange: number (optional)
 *   - previousPrice: number (optional)
 *   - currentPrice: number (optional)
 * @returns {Promise<Array>} Updated agents array
 */
async function updateAgentsConfidenceForSector(sectorId, tickContext = {}) {
  try {
    const agents = await loadAgents();
    const sectorAgents = agents.filter(agent => agent.sectorId === sectorId);
    
    // Separate manager and non-manager agents
    const managerAgents = [];
    const nonManagerAgents = [];
    
    for (const agent of sectorAgents) {
      const isManager = agent.role === 'manager' || 
                       (agent.role && agent.role.toLowerCase().includes('manager'));
      if (isManager) {
        managerAgents.push(agent);
      } else {
        nonManagerAgents.push(agent);
      }
    }
    
    const updatedAgents = [];
    
    // Update confidence for non-manager agents with tick context
    for (const agent of nonManagerAgents) {
      const previousConfidence = typeof agent.confidence === 'number' ? agent.confidence : 0;
      const calculatedConfidence = recalcConfidence(agent, {
        llmConfidence: tickContext.llmConfidence, // LLM confidence if available
        priceChangePercent: tickContext.priceChangePercent,
        volatilityChange: tickContext.volatilityChange
      });
      
      // Phase 4: Confidence is monotonically increasing (already handled in recalcConfidence)
      const newConfidence = calculatedConfidence;
      
      // Only update if confidence actually changed (avoid unnecessary writes)
      if (Math.abs(newConfidence - extractConfidence(agent)) > 0.01) {
        agent.confidence = newConfidence;
        
        // Find and update in main agents array
        const agentIndex = agents.findIndex(a => a.id === agent.id);
        if (agentIndex !== -1) {
          agents[agentIndex].confidence = newConfidence;
          updatedAgents.push(agents[agentIndex]);
        }
      }
    }
    
    // Update manager confidence - use recalcConfidence to allow dynamic updates
    // Manager confidence should reflect the average of non-manager agents, but also be subject to updates
    const averageConfidence = nonManagerAgents.length
      ? nonManagerAgents.reduce((sum, agent) => sum + extractConfidence(agent), 0) / nonManagerAgents.length
      : null;

    for (const manager of managerAgents) {
      const previousConfidence = typeof manager.confidence === 'number' ? manager.confidence : 0;
      
      // Calculate manager confidence: blend between average of non-managers and recalculated value
      // This allows manager confidence to update dynamically while still reflecting team performance
      const recalculatedConfidence = recalcConfidence(manager, {
        llmConfidence: tickContext.llmConfidence, // LLM confidence if available
        priceChangePercent: tickContext.priceChangePercent,
        volatilityChange: tickContext.volatilityChange
      });
      
      // If we have non-manager agents, blend average with recalculated (60% average, 40% recalculated)
      // This ensures manager confidence reflects team performance but can still change
      const calculatedManagerConfidence = averageConfidence !== null
        ? averageConfidence * 0.6 + recalculatedConfidence * 0.4
        : recalculatedConfidence;
      
      const normalizedManagerConfidence = clampConfidence(calculatedManagerConfidence);
      // Phase 4: Confidence is monotonically increasing (apply Phase 4 rule)
      const newManagerConfidence = updateConfidencePhase4(previousConfidence, normalizedManagerConfidence);
      
      // Only update if confidence actually changed
      const currentManagerConfidence = extractConfidence(manager);
      if (Math.abs(newManagerConfidence - currentManagerConfidence) > 0.01) {
        manager.confidence = newManagerConfidence;
        
        // Find and update in main agents array
        const agentIndex = agents.findIndex(a => a.id === manager.id);
        if (agentIndex !== -1) {
          agents[agentIndex].confidence = newManagerConfidence;
          updatedAgents.push(agents[agentIndex]);
        }
        
        // Save manager confidence to storage
        try {
          await updateAgent(manager.id, { confidence: newManagerConfidence });
        } catch (error) {
          console.error(`[Confidence] Error saving manager confidence for ${manager.id}:`, error);
        }
      }
    }
    
    // Save updated agents
    await saveAgents(agents);
    
    return updatedAgents;
  } catch (error) {
    console.error(`[Confidence] Error updating agents confidence for sector ${sectorId}:`, error);
    return [];
  }
}

/**
 * Update confidence for specific agents after discussion consensus
 * @param {Array<string>} agentIds - Array of agent IDs to update
 * @param {Object} consensusContext - Context from discussion:
 *   - consensusReached: boolean
 *   - finalAction: string
 *   - finalConfidence: number
 *   - priceChangePercent: number (optional)
 *   - decisionOutcome: Object with { action, priceChangePercent, success } (optional)
 * @returns {Promise<Array>} Updated agents array
 */
async function updateAgentsConfidenceAfterConsensus(agentIds = [], consensusContext = {}) {
  try {
    const agents = await loadAgents();
    const updatedAgents = [];
    
    // Determine decision outcome if we have action and price change data
    let decisionOutcome = null;
    if (consensusContext.finalAction && consensusContext.priceChangePercent !== undefined) {
      const action = consensusContext.finalAction.toUpperCase();
      const priceChangePercent = consensusContext.priceChangePercent;
      
      // Determine success based on action and price movement
      let success = false;
      if (action === 'BUY' && priceChangePercent > 0) {
        success = true; // Bought and price went up
      } else if (action === 'SELL' && priceChangePercent < 0) {
        success = true; // Sold and price went down
      } else if (action === 'HOLD') {
        // HOLD decisions are neutral - no confidence change
        success = null;
      } else if (action === 'BUY' && priceChangePercent < 0) {
        success = false; // Bought but price went down
      } else if (action === 'SELL' && priceChangePercent > 0) {
        success = false; // Sold but price went up
      } else {
        // If price change is 0 or very small, make a small positive adjustment
        // This prevents confidence from being completely frozen
        if (Math.abs(priceChangePercent) < 0.1) {
          // Very small positive adjustment for making a decision (even if outcome is unclear)
          decisionOutcome = {
            action,
            priceChangePercent: 0.5, // Use small positive value to give slight boost
            success: true
          };
        } else {
          success = false;
        }
      }
      
      if (success !== null && !decisionOutcome) {
        decisionOutcome = {
          action,
          priceChangePercent,
          success
        };
      }
    }
    
    console.log(`[Confidence] updateAgentsConfidenceAfterConsensus called:`, {
      agentIds: agentIds.length,
      finalAction: consensusContext.finalAction,
      priceChangePercent: consensusContext.priceChangePercent,
      decisionOutcome: decisionOutcome ? { action: decisionOutcome.action, success: decisionOutcome.success } : null
    });
    
    for (const agentId of agentIds) {
      const agentIndex = agents.findIndex(a => a.id === agentId);
      if (agentIndex === -1) continue;
      
      const agent = agents[agentIndex];
      
      // Get previous confidence
      const previousConfidence = typeof agent.confidence === 'number' ? agent.confidence : 0;
      
      // Recalculate confidence with decision outcome context
      // Note: LLM confidence should be provided in consensusContext.llmConfidence
      const calculatedConfidence = recalcConfidence(agent, {
        llmConfidence: consensusContext.llmConfidence, // LLM confidence if available
        decisionOutcome,
        priceChangePercent: consensusContext.priceChangePercent
      });
      
      // Phase 4: Confidence is monotonically increasing (already handled in recalcConfidence)
      const newConfidence = calculatedConfidence;
      
      // Update agent confidence
      agent.confidence = newConfidence;
      agents[agentIndex].confidence = newConfidence;
      
      // Persist the update
      try {
        await updateAgent(agent.id, { confidence: newConfidence });
      } catch (error) {
        console.warn(`[Confidence] Failed to persist confidence for ${agent.id}:`, error);
      }
      
      updatedAgents.push(agents[agentIndex]);
    }
    
    // Save updated agents
    await saveAgents(agents);
    
    return updatedAgents;
  } catch (error) {
    console.error(`[Confidence] Error updating agents confidence after consensus:`, error);
    return [];
  }
}

/**
 * Stabilize confidence: Apply Phase 4 growth rule to prevent decay and ensure growth.
 * This is a wrapper around updateConfidencePhase4 for backward compatibility.
 * 
 * Phase 4 confidence growth assist:
 * - If extracted confidence <= previous_confidence, then confidence_next = min(previous_confidence + 2, 100)
 * - If extracted confidence > previous_confidence, then confidence_next = min(100, extracted_confidence)
 * 
 * @param {number} previousConfidence - Previous confidence value
 * @param {number} extractedConfidence - Extracted confidence value (from llmAction or stored)
 * @returns {number} Stabilized confidence (monotonically increasing, capped at 100)
 */
function stabilizeConfidence(previousConfidence, extractedConfidence) {
  // Use updateConfidencePhase4 which implements the growth rule
  return updateConfidencePhase4(previousConfidence, extractedConfidence);
}

module.exports = {
  recalcConfidence,
  updateAgentsConfidenceForSector,
  updateAgentsConfidenceAfterConsensus,
  updateConfidencePhase4,
  stabilizeConfidence
};

