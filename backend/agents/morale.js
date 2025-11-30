// morale.js - Agent morale and reward system
// Tracks agent morale (0-100) and applies confidence modifiers based on performance

const { loadAgents, saveAgents } = require('../utils/agentStorage');
const Agent = require('../models/Agent');

const MIN_MORALE = 0;
const MAX_MORALE = 100;
const DEFAULT_MORALE = 50;
const DEMOTIVATED_THRESHOLD = 20;
const INSPIRED_THRESHOLD = 80;

/**
 * Get current morale for an agent
 * @param {string} agentId - Agent ID
 * @returns {Promise<number>} Current morale value (0-100)
 */
async function getMorale(agentId) {
  const agents = await loadAgents();
  const agentData = agents.find(a => a.id === agentId);
  
  if (!agentData) {
    throw new Error(`Agent ${agentId} not found`);
  }
  
  return typeof agentData.morale === 'number' ? agentData.morale : DEFAULT_MORALE;
}

/**
 * Update agent morale by a delta amount
 * @param {string} agentId - Agent ID
 * @param {number} delta - Change in morale (can be positive or negative)
 * @param {number} rewardPointsDelta - Optional change in reward points (default: 0)
 * @returns {Promise<{morale: number, rewardPoints: number, status: string}>} Updated morale and status
 */
async function updateMorale(agentId, delta, rewardPointsDelta = 0) {
  const agents = await loadAgents();
  const agentIndex = agents.findIndex(a => a.id === agentId);
  
  if (agentIndex === -1) {
    throw new Error(`Agent ${agentId} not found`);
  }
  
  const agentData = agents[agentIndex];
  const currentMorale = typeof agentData.morale === 'number' ? agentData.morale : DEFAULT_MORALE;
  const currentRewardPoints = typeof agentData.rewardPoints === 'number' ? agentData.rewardPoints : 0;
  
  // Calculate new morale with bounds
  const newMorale = Math.max(MIN_MORALE, Math.min(MAX_MORALE, currentMorale + delta));
  
  // Calculate new reward points (cannot go below 0)
  const newRewardPoints = Math.max(0, currentRewardPoints + rewardPointsDelta);
  
  // Update agent data
  agentData.morale = newMorale;
  agentData.rewardPoints = newRewardPoints;
  agentData.lastRewardTimestamp = new Date().toISOString();
  
  // Determine morale status
  let status = 'normal';
  if (newMorale < DEMOTIVATED_THRESHOLD) {
    status = 'demotivated';
  } else if (newMorale > INSPIRED_THRESHOLD) {
    status = 'inspired';
  }
  
  // Save updated agents
  await saveAgents(agents);
  
  return {
    morale: newMorale,
    rewardPoints: newRewardPoints,
    status
  };
}

/**
 * Reward agent for profitable decision
 * Increases morale based on profit amount
 * @param {string} agentId - Agent ID
 * @param {number} profitAmount - Profit amount (positive number)
 * @param {number} multiplier - Optional multiplier for consecutive wins (default: 1)
 * @returns {Promise<{morale: number, rewardPoints: number, status: string}>} Updated morale and status
 */
async function rewardForProfit(agentId, profitAmount, multiplier = 1) {
  if (typeof profitAmount !== 'number' || profitAmount <= 0) {
    throw new Error('profitAmount must be a positive number');
  }
  
  // Scale reward: 1-5 points based on profit, with multiplier for consecutive wins
  const baseReward = Math.min(5, Math.max(1, Math.floor(profitAmount / 2)));
  const reward = Math.floor(baseReward * multiplier);
  
  // Reward points equal to morale reward
  const rewardPoints = reward;
  
  return await updateMorale(agentId, reward, rewardPoints);
}

/**
 * Penalize agent for loss
 * Decreases morale based on loss amount
 * @param {string} agentId - Agent ID
 * @param {number} lossAmount - Loss amount (positive number)
 * @returns {Promise<{morale: number, rewardPoints: number, status: string}>} Updated morale and status
 */
async function penalizeForLoss(agentId, lossAmount) {
  if (typeof lossAmount !== 'number' || lossAmount <= 0) {
    throw new Error('lossAmount must be a positive number');
  }
  
  // Scale penalty: -1 to -10 points based on loss severity
  const penalty = Math.max(-10, Math.min(-1, -Math.floor(lossAmount / 2)));
  
  return await updateMorale(agentId, penalty, 0);
}

/**
 * Apply morale-based confidence modifier
 * @param {number} baseConfidence - Base confidence value (0-1)
 * @param {number} morale - Current morale value (0-100)
 * @returns {number} Modified confidence value (0-1)
 */
function applyConfidenceModifier(baseConfidence, morale) {
  if (typeof baseConfidence !== 'number' || baseConfidence < 0 || baseConfidence > 1) {
    throw new Error('baseConfidence must be a number between 0 and 1');
  }
  
  if (typeof morale !== 'number' || morale < 0 || morale > 100) {
    throw new Error('morale must be a number between 0 and 100');
  }
  
  let modifiedConfidence = baseConfidence;
  
  if (morale < DEMOTIVATED_THRESHOLD) {
    // Demotivated: reduce confidence by 50%
    modifiedConfidence = baseConfidence * 0.5;
  } else if (morale > INSPIRED_THRESHOLD) {
    // Inspired: boost confidence by 20%
    modifiedConfidence = Math.min(1.0, baseConfidence * 1.2);
  }
  
  // Ensure confidence stays within bounds
  return Math.max(0, Math.min(1, modifiedConfidence));
}

/**
 * Get morale status string
 * @param {number} morale - Current morale value (0-100)
 * @returns {string} Status: 'demotivated', 'normal', or 'inspired'
 */
function getMoraleStatus(morale) {
  if (typeof morale !== 'number') {
    return 'normal';
  }
  
  if (morale < DEMOTIVATED_THRESHOLD) {
    return 'demotivated';
  } else if (morale > INSPIRED_THRESHOLD) {
    return 'inspired';
  }
  
  return 'normal';
}

module.exports = {
  getMorale,
  updateMorale,
  rewardForProfit,
  penalizeForLoss,
  applyConfidenceModifier,
  getMoraleStatus,
  MIN_MORALE,
  MAX_MORALE,
  DEFAULT_MORALE,
  DEMOTIVATED_THRESHOLD,
  INSPIRED_THRESHOLD
};

