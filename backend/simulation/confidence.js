/**
 * Confidence Engine - Recalculates agent confidence based on market conditions
 * 
 * Confidence range: -100 to +100
 * Adjustments are small (±1 to ±5 per tick) to prevent sudden jumps
 */

const { loadAgents, saveAgents } = require('../utils/agentStorage');

/**
 * Recalculate agent confidence based on context
 * @param {Object} agent - Agent object with id, role, performance, confidence, etc.
 * @param {Object} context - Context object containing:
 *   - priceTrend: number (price change direction, positive = up, negative = down)
 *   - priceChangePercent: number (percentage change in price)
 *   - volatilityChange: number (change in volatility, positive = more volatile)
 *   - previousPerformance: Object with { pnl, winRate } or use agent.performance
 *   - sectorData: Object with sector information (optional)
 * @returns {number} Updated confidence value (-100 to +100)
 */
function recalcConfidence(agent, context = {}) {
  if (!agent) {
    return 0; // Default neutral confidence
  }

  // Get current confidence, defaulting to 0 if not set
  const currentConfidence = typeof agent.confidence === 'number' 
    ? Math.max(-100, Math.min(100, agent.confidence))
    : 0;

  // Calculate confidence adjustment based on various factors
  let adjustment = 0;

  // 1. Price trend direction influence
  if (typeof context.priceChangePercent === 'number') {
    // Positive price change increases confidence, negative decreases it
    // Scale: 1% change = ±1 confidence point (capped at ±3)
    const priceAdjustment = Math.max(-3, Math.min(3, context.priceChangePercent));
    adjustment += priceAdjustment;
  }

  // 2. Volatility changes influence
  if (typeof context.volatilityChange === 'number') {
    // Increased volatility reduces confidence (uncertainty)
    // Scale: 0.01 (1%) volatility increase = -1 confidence point (capped at ±2)
    const volatilityAdjustment = Math.max(-2, Math.min(2, -context.volatilityChange * 100));
    adjustment += volatilityAdjustment;
  }

  // 3. Previous performance influence
  const performance = context.previousPerformance || agent.performance || {};
  
  if (typeof performance.winRate === 'number') {
    // Win rate above 0.5 increases confidence, below decreases it
    // Scale: 0.1 win rate change = ±1 confidence point (capped at ±2)
    const winRateAdjustment = Math.max(-2, Math.min(2, (performance.winRate - 0.5) * 2));
    adjustment += winRateAdjustment;
  }

  if (typeof performance.pnl === 'number') {
    // Positive PnL increases confidence, negative decreases it
    // Scale: $1000 PnL = ±1 confidence point (capped at ±2)
    const pnlAdjustment = Math.max(-2, Math.min(2, performance.pnl / 1000));
    adjustment += pnlAdjustment;
  }

  // 4. Agent role influence
  const role = (agent.role || '').toLowerCase();
  
  // Research agents are more sensitive to price trends
  if (role.includes('research')) {
    if (typeof context.priceChangePercent === 'number') {
      const researchAdjustment = Math.max(-2, Math.min(2, context.priceChangePercent * 0.5));
      adjustment += researchAdjustment;
    }
  }
  
  // Analyst agents are more sensitive to volatility
  if (role.includes('analyst')) {
    if (typeof context.volatilityChange === 'number') {
      const analystAdjustment = Math.max(-2, Math.min(2, -context.volatilityChange * 150));
      adjustment += analystAdjustment;
    }
  }
  
  // Manager agents are more conservative, smaller adjustments
  if (role.includes('manager')) {
    adjustment *= 0.7; // Reduce adjustment by 30% for managers
  }

  // Ensure adjustment is within ±1 to ±5 range per tick
  adjustment = Math.max(-5, Math.min(5, adjustment));

  // Calculate new confidence
  let newConfidence = currentConfidence + adjustment;

  // Clamp to valid range [-100, 100]
  newConfidence = Math.max(-100, Math.min(100, newConfidence));

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
    
    const updatedAgents = [];
    
    for (const agent of sectorAgents) {
      const newConfidence = recalcConfidence(agent, {
        priceChangePercent: tickContext.priceChangePercent,
        volatilityChange: tickContext.volatilityChange,
        previousPerformance: agent.performance,
        sectorData: tickContext.sectorData
      });
      
      // Update agent confidence
      agent.confidence = newConfidence;
      
      // Find and update in main agents array
      const agentIndex = agents.findIndex(a => a.id === agent.id);
      if (agentIndex !== -1) {
        agents[agentIndex].confidence = newConfidence;
        updatedAgents.push(agents[agentIndex]);
      }
    }
    
    // Save updated agents
    await saveAgents(agents);
    
    return updatedAgents;
  } catch (error) {
    console.error(`[ConfidenceEngine] Error updating agents confidence for sector ${sectorId}:`, error);
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
 * @returns {Promise<Array>} Updated agents array
 */
async function updateAgentsConfidenceAfterConsensus(agentIds = [], consensusContext = {}) {
  try {
    const agents = await loadAgents();
    const updatedAgents = [];
    
    for (const agentId of agentIds) {
      const agentIndex = agents.findIndex(a => a.id === agentId);
      if (agentIndex === -1) continue;
      
      const agent = agents[agentIndex];
      
      // Context for consensus-based confidence update
      const context = {
        priceChangePercent: consensusContext.priceChangePercent || 0,
        previousPerformance: agent.performance
      };
      
      // Calculate base confidence from market factors
      let newConfidence = recalcConfidence(agent, context);
      
      // If consensus was reached, agents gain confidence
      if (consensusContext.consensusReached) {
        // Small positive adjustment for successful consensus
        // Scale: finalConfidence 0-1 maps to +1 to +3 confidence points
        const consensusAdjustment = Math.min(3, Math.max(1, (consensusContext.finalConfidence || 0) * 3));
        newConfidence = Math.max(-100, Math.min(100, newConfidence + consensusAdjustment));
      }
      
      // Update agent confidence
      agent.confidence = newConfidence;
      agents[agentIndex].confidence = newConfidence;
      
      updatedAgents.push(agents[agentIndex]);
    }
    
    // Save updated agents
    await saveAgents(agents);
    
    return updatedAgents;
  } catch (error) {
    console.error(`[ConfidenceEngine] Error updating agents confidence after consensus:`, error);
    return [];
  }
}

module.exports = {
  recalcConfidence,
  updateAgentsConfidenceForSector,
  updateAgentsConfidenceAfterConsensus
};

