/**
 * Confidence Aggregation Module
 * 
 * Aggregates confidence values from multiple agent signals using weighted average.
 * Agents with higher historical win rates are weighted more heavily.
 * 
 * Rules:
 * - Weight confidence by agent's historical win rate
 * - Normalize result between 0 and 1
 */

/**
 * Calculates weight for an agent based on historical win rate
 * @param {number} winRate - Agent's historical win rate (0-1)
 * @returns {number} Weight multiplier (minimum 0.5, maximum 2.0)
 */
function calculateWeight(winRate) {
  if (typeof winRate !== 'number' || winRate < 0 || winRate > 1) {
    // Default weight for agents without valid win rate
    return 1.0;
  }

  // Linear scaling: winRate 0.0 -> weight 0.5, winRate 1.0 -> weight 2.0
  // This ensures agents with higher win rates have more influence
  return 0.5 + (winRate * 1.5);
}

/**
 * Aggregates confidence values using weighted average
 * @param {Array<{confidence: number, agentId?: string, winRate?: number}>} signals - Array of agent signals with optional agent metadata
 * @param {Object} agentWinRates - Optional map of agentId -> winRate for lookup
 * @returns {number} Aggregated confidence value (0-1)
 */
function aggregateConfidence(signals, agentWinRates = {}) {
  if (!Array.isArray(signals) || signals.length === 0) {
    return 0;
  }

  let totalWeightedConfidence = 0;
  let totalWeight = 0;

  signals.forEach(signal => {
    const confidence = typeof signal.confidence === 'number' 
      ? Math.max(0, Math.min(1, signal.confidence)) 
      : 0;

    // Get win rate from signal metadata or lookup map
    let winRate = signal.winRate;
    if (winRate === undefined && signal.agentId && agentWinRates[signal.agentId]) {
      winRate = agentWinRates[signal.agentId];
    }

    const weight = calculateWeight(winRate);
    totalWeightedConfidence += confidence * weight;
    totalWeight += weight;
  });

  if (totalWeight === 0) {
    return 0;
  }

  // Calculate weighted average and normalize to 0-1
  const aggregated = totalWeightedConfidence / totalWeight;
  return Math.max(0, Math.min(1, aggregated));
}

/**
 * Aggregates confidence for a specific action
 * @param {Array<{action: string, confidence: number, agentId?: string, winRate?: number}>} signals - Array of agent signals
 * @param {string} targetAction - Action to filter for (BUY, SELL, HOLD)
 * @param {Object} agentWinRates - Optional map of agentId -> winRate for lookup
 * @returns {number} Aggregated confidence for the target action (0-1)
 */
function aggregateConfidenceForAction(signals, targetAction, agentWinRates = {}) {
  if (!targetAction) {
    return 0;
  }

  const filteredSignals = signals.filter(signal => 
    signal.action?.toUpperCase() === targetAction.toUpperCase()
  );

  return aggregateConfidence(filteredSignals, agentWinRates);
}

module.exports = {
  aggregateConfidence,
  aggregateConfidenceForAction,
  calculateWeight
};

