/**
 * Confidence normalization - derives agent confidence without random adjustments
 * 
 * Confidence range: -100 to +100
 * Adjustments are small (±1 to ±5 per tick) to prevent sudden jumps
 */

const { loadAgents, saveAgents, updateAgent } = require('../utils/agentStorage');
const { extractConfidence, clampConfidence } = require('../utils/confidenceUtils');

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
function recalcConfidence(agent) {
  return extractConfidence(agent);
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
    
    // Normalize confidence for non-manager agents using LLM output when available
    for (const agent of nonManagerAgents) {
      const newConfidence = recalcConfidence(agent);
      
      // Update agent confidence
      agent.confidence = newConfidence;
      
      // Find and update in main agents array
      const agentIndex = agents.findIndex(a => a.id === agent.id);
      if (agentIndex !== -1) {
        agents[agentIndex].confidence = newConfidence;
        updatedAgents.push(agents[agentIndex]);
      }
    }
    
    // Update manager confidence as the average of non-manager confidences when present
    const averageConfidence = nonManagerAgents.length
      ? nonManagerAgents.reduce((sum, agent) => sum + extractConfidence(agent), 0) / nonManagerAgents.length
      : null;

    for (const manager of managerAgents) {
      const newManagerConfidence = averageConfidence !== null
        ? averageConfidence
        : recalcConfidence(manager);
      const normalizedManagerConfidence = clampConfidence(newManagerConfidence);
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
      
      // Normalize confidence without artificial adjustments
      const newConfidence = recalcConfidence(agent);
      
      // Update agent confidence
      agent.confidence = newConfidence;
      agents[agentIndex].confidence = newConfidence;
      
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

module.exports = {
  recalcConfidence,
  updateAgentsConfidenceForSector,
  updateAgentsConfidenceAfterConsensus
};

