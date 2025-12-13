/**
 * Confidence normalization - Action-based confidence updates
 * 
 * Rules:
 * - Agent confidence must be derived from the recommendation it produces
 * - Confidence must come from the LLM output (e.g. "Confidence: 40%")
 * - Confidence may increase or decrease between rounds based on refinement
 * - Confidence must NEVER increase without a new reasoning step
 * - No passive auto-increment logic
 */

const { loadAgents, saveAgents, updateAgent } = require('../utils/agentStorage');
const { extractConfidence, clampConfidence } = require('../utils/confidenceUtils');

/**
 * Update confidence using LLM output directly - no automatic increases.
 * Confidence is derived from LLM and can increase or decrease based on LLM output.
 * 
 * @param {number} previousConfidence - Previous confidence value (not used, kept for compatibility)
 * @param {number} llmConfidenceOutput - LLM-provided confidence value (1-100)
 * @returns {number} Updated confidence value (1-100)
 */
function updateConfidencePhase4(previousConfidence, llmConfidenceOutput) {
  // Use LLM confidence directly - no automatic increases or monotonic behavior
  const llmConfidence = clampConfidence(typeof llmConfidenceOutput === 'number' ? llmConfidenceOutput : 1);
  return llmConfidence;
}

/**
 * Recalculate agent confidence based on LLM output.
 * 
 * Action-based confidence: Confidence must come from LLM output only.
 * No fallback to previous confidence - if no LLM output, confidence is not updated.
 * 
 * @param {Object} agent - Agent object with id, role, performance, confidence, etc.
 * @param {Object} context - Context object containing:
 *   - llmConfidence: number (LLM-provided confidence value, 0-100) - REQUIRED
 *   - priceTrend: number (price change direction, positive = up, negative = down) (optional)
 *   - priceChangePercent: number (percentage change in price) (optional)
 *   - volatilityChange: number (change in volatility, positive = more volatile) (optional)
 *   - previousPerformance: Object with { pnl, winRate } or use agent.performance (optional)
 *   - sectorData: Object with sector information (optional)
 *   - decisionOutcome: Object with { action, priceChangePercent, success } (optional)
 * @returns {number|null} Updated confidence value (1-100) or null if no LLM confidence provided
 */
function recalcConfidence(agent, context = {}) {
  // Get previous confidence for logging
  const previousConfidence = typeof agent.confidence === 'number' ? agent.confidence : 0;
  
  // Action-based confidence: MUST come from LLM output
  // If no LLM confidence is provided, return null to indicate no update
  let llmConfidenceOutput = null;
  
  if (context.llmConfidence !== undefined && typeof context.llmConfidence === 'number') {
    llmConfidenceOutput = context.llmConfidence;
  } else if (agent.llmAction && typeof agent.llmAction.confidence === 'number') {
    // Fallback: try to get LLM confidence from agent's llmAction
    llmConfidenceOutput = agent.llmAction.confidence;
  }
  
  // If no LLM confidence provided, return null (no update)
  if (llmConfidenceOutput === null) {
    return null;
  }
  
  // Use LLM confidence directly - no automatic increases
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
    // Action-based: Only update if LLM confidence is provided
    for (const agent of nonManagerAgents) {
      const calculatedConfidence = recalcConfidence(agent, {
        llmConfidence: tickContext.llmConfidence, // LLM confidence if available
        priceChangePercent: tickContext.priceChangePercent,
        volatilityChange: tickContext.volatilityChange
      });
      
      // Only update if LLM confidence was provided (recalcConfidence returns null otherwise)
      if (calculatedConfidence !== null) {
        const currentConfidence = extractConfidence(agent);
        // Only update if confidence actually changed (avoid unnecessary writes)
        if (Math.abs(calculatedConfidence - currentConfidence) > 0.01) {
          agent.confidence = calculatedConfidence;
          
          // Find and update in main agents array
          const agentIndex = agents.findIndex(a => a.id === agent.id);
          if (agentIndex !== -1) {
            agents[agentIndex].confidence = calculatedConfidence;
            updatedAgents.push(agents[agentIndex]);
          }
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
      
      // Manager confidence: Use average of non-manager agents if available
      // Action-based: Only update if we have LLM-derived confidence from non-managers
      if (averageConfidence !== null) {
        const normalizedManagerConfidence = clampConfidence(averageConfidence);
        const currentManagerConfidence = extractConfidence(manager);
        
        // Only update if confidence actually changed
        if (Math.abs(normalizedManagerConfidence - currentManagerConfidence) > 0.01) {
          manager.confidence = normalizedManagerConfidence;
          
          // Find and update in main agents array
          const agentIndex = agents.findIndex(a => a.id === manager.id);
          if (agentIndex !== -1) {
            agents[agentIndex].confidence = normalizedManagerConfidence;
            updatedAgents.push(agents[agentIndex]);
          }
          
          // Save manager confidence to storage
          try {
            await updateAgent(manager.id, { confidence: normalizedManagerConfidence });
          } catch (error) {
            console.error(`[Confidence] Error saving manager confidence for ${manager.id}:`, error);
          }
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
      // Action-based: Only update if LLM confidence is provided
      // Note: LLM confidence should be provided in consensusContext.llmConfidence
      const calculatedConfidence = recalcConfidence(agent, {
        llmConfidence: consensusContext.llmConfidence, // LLM confidence if available
        decisionOutcome,
        priceChangePercent: consensusContext.priceChangePercent
      });
      
      // Only update if LLM confidence was provided (recalcConfidence returns null otherwise)
      if (calculatedConfidence !== null) {
        agent.confidence = calculatedConfidence;
        agents[agentIndex].confidence = calculatedConfidence;
        
        // Persist the update
        try {
          await updateAgent(agent.id, { confidence: calculatedConfidence });
        } catch (error) {
          console.warn(`[Confidence] Failed to persist confidence for ${agent.id}:`, error);
        }
        
        updatedAgents.push(agents[agentIndex]);
      }
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
 * Stabilize confidence - DEPRECATED: Use updateConfidencePhase4 directly.
 * This function is kept for backward compatibility but should not be used.
 * 
 * @deprecated Use updateConfidencePhase4 directly instead
 * @param {number} previousConfidence - Previous confidence (not used, kept for compatibility)
 * @param {number} extractedConfidence - LLM-derived confidence value (1-100)
 * @returns {number} Updated confidence value (1-100)
 */
function stabilizeConfidence(previousConfidence, extractedConfidence) {
  // Use LLM-derived confidence directly - no automatic increases
  return clampConfidence(typeof extractedConfidence === 'number' ? extractedConfidence : 1);
}

module.exports = {
  recalcConfidence,
  updateAgentsConfidenceForSector,
  updateAgentsConfidenceAfterConsensus,
  updateConfidencePhase4,
  stabilizeConfidence
};

