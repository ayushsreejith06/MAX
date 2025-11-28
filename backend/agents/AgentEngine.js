// AgentEngine.js - Agent decision engine with morale integration
// Provides functions for agent decision-making and morale management

const { updateMorale, rewardForProfit, penalizeForLoss, applyConfidenceModifier, getMorale } = require('./morale');
const { loadAgents, saveAgents } = require('../utils/agentStorage');

/**
 * Update agent morale by a delta amount
 * @param {string} agentId - Agent ID
 * @param {number} delta - Change in morale (can be positive or negative)
 * @returns {Promise<{morale: number, status: string}>} Updated morale and status
 */
async function updateAgentMorale(agentId, delta) {
  return await updateMorale(agentId, delta);
}

/**
 * Reward agent for profitable decision aligned with sector profit
 * @param {string} agentId - Agent ID
 * @param {number} profitAmount - Profit amount (positive number)
 * @returns {Promise<{morale: number, status: string}>} Updated morale and status
 */
async function rewardAgentForProfit(agentId, profitAmount) {
  return await rewardForProfit(agentId, profitAmount);
}

/**
 * Penalize agent for decision causing simulated losses
 * @param {string} agentId - Agent ID
 * @param {number} lossAmount - Loss amount (positive number)
 * @returns {Promise<{morale: number, status: string}>} Updated morale and status
 */
async function penalizeAgentForLoss(agentId, lossAmount) {
  return await penalizeForLoss(agentId, lossAmount);
}

/**
 * Apply morale-based confidence modifier to agent decision output
 * @param {string} agentId - Agent ID
 * @param {number} baseConfidence - Base confidence value (0-1)
 * @returns {Promise<number>} Modified confidence value (0-1)
 */
async function applyMoraleConfidenceModifier(agentId, baseConfidence) {
  const morale = await getMorale(agentId);
  return applyConfidenceModifier(baseConfidence, morale);
}

/**
 * Process agent decision result and update morale accordingly
 * This function should be called from the ManagerDecision pipeline
 * @param {string} agentId - Agent ID
 * @param {number} profitLoss - Profit (positive) or loss (negative) amount
 * @returns {Promise<{morale: number, status: string, confidenceModifier: number}>} Updated morale info
 */
async function processDecisionResult(agentId, profitLoss) {
  let moraleUpdate;
  
  if (profitLoss > 0) {
    // Profit: reward agent
    moraleUpdate = await rewardForProfit(agentId, profitLoss);
  } else if (profitLoss < 0) {
    // Loss: penalize agent
    moraleUpdate = await penalizeForLoss(agentId, Math.abs(profitLoss));
  } else {
    // No change: just get current morale
    const currentMorale = await getMorale(agentId);
    moraleUpdate = {
      morale: currentMorale,
      status: currentMorale < 20 ? 'demotivated' : (currentMorale > 80 ? 'inspired' : 'normal')
    };
  }
  
  // Calculate confidence modifier based on morale status
  let confidenceModifier = 1.0;
  if (moraleUpdate.status === 'demotivated') {
    confidenceModifier = 0.5; // 50% reduction
  } else if (moraleUpdate.status === 'inspired') {
    confidenceModifier = 1.2; // 20% boost
  }
  
  return {
    ...moraleUpdate,
    confidenceModifier
  };
}

module.exports = {
  updateAgentMorale,
  rewardAgentForProfit,
  penalizeAgentForLoss,
  applyMoraleConfidenceModifier,
  processDecisionResult
};

