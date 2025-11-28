/**
 * Conflict Detection and Resolution Module
 * 
 * Detects conflicting signals between sub-groups of agents and resolves them.
 * 
 * Rules:
 * - If conflict > threshold, return "NEEDS_REVIEW" instead of action
 * - resolveConflict() uses rule: highest win-rate cluster wins
 */

/**
 * Calculates conflict score between different action groups
 * @param {Object} voteCounts - Vote counts per action {BUY: number, SELL: number, HOLD: number}
 * @param {number} totalAgents - Total number of agents
 * @returns {number} Conflict score (0-1), where 1 is maximum conflict
 */
function calculateConflictScore(voteCounts, totalAgents) {
  if (totalAgents === 0) {
    return 0;
  }

  const counts = [
    voteCounts.BUY || 0,
    voteCounts.SELL || 0,
    voteCounts.HOLD || 0
  ].filter(count => count > 0);

  if (counts.length <= 1) {
    // No conflict if all agents agree
    return 0;
  }

  // Calculate entropy-based conflict score
  // Higher entropy = more disagreement
  const probabilities = counts.map(count => count / totalAgents);
  const entropy = probabilities.reduce((sum, p) => {
    if (p === 0) return sum;
    return sum - (p * Math.log2(p));
  }, 0);

  // Normalize entropy to 0-1 range (max entropy for 3 equal groups is log2(3) ≈ 1.585)
  const maxEntropy = Math.log2(Math.min(counts.length, 3));
  return entropy / maxEntropy;
}

/**
 * Groups agents by their action and calculates average win rate per group
 * @param {Array<{action: string, agentId?: string, winRate?: number}>} signals - Array of agent signals
 * @returns {Object} Groups with their average win rates
 */
function groupByAction(signals) {
  const groups = {
    BUY: { agents: [], winRates: [] },
    SELL: { agents: [], winRates: [] },
    HOLD: { agents: [], winRates: [] }
  };

  signals.forEach(signal => {
    const action = signal.action?.toUpperCase();
    if (groups.hasOwnProperty(action)) {
      groups[action].agents.push(signal);
      if (typeof signal.winRate === 'number') {
        groups[action].winRates.push(signal.winRate);
      }
    }
  });

  // Calculate average win rate for each group
  const result = {};
  Object.keys(groups).forEach(action => {
    const group = groups[action];
    const avgWinRate = group.winRates.length > 0
      ? group.winRates.reduce((sum, rate) => sum + rate, 0) / group.winRates.length
      : 0;
    
    result[action] = {
      count: group.agents.length,
      avgWinRate: avgWinRate
    };
  });

  return result;
}

/**
 * Detects if there's significant conflict between agent signals
 * @param {Array<{action: string, confidence: number}>} signals - Array of agent signals
 * @param {number} conflictThreshold - Threshold for conflict (0-1), default 0.5
 * @returns {Object} Conflict detection result
 */
function detectConflict(signals, conflictThreshold = 0.5) {
  if (!Array.isArray(signals) || signals.length === 0) {
    return {
      hasConflict: false,
      conflictScore: 0,
      needsReview: false
    };
  }

  const voteCounts = {
    BUY: 0,
    SELL: 0,
    HOLD: 0
  };

  signals.forEach(signal => {
    const action = signal.action?.toUpperCase();
    if (voteCounts.hasOwnProperty(action)) {
      voteCounts[action] += 1;
    }
  });

  const totalAgents = signals.length;
  const conflictScore = calculateConflictScore(voteCounts, totalAgents);
  const needsReview = conflictScore > conflictThreshold;

  return {
    hasConflict: conflictScore > 0,
    conflictScore: conflictScore,
    needsReview: needsReview,
    voteCounts: voteCounts
  };
}

/**
 * Resolves conflict by selecting the action from the group with highest average win rate
 * @param {Array<{action: string, agentId?: string, winRate?: number}>} signals - Array of agent signals
 * @returns {string} Resolved action (BUY, SELL, or HOLD)
 */
function resolveConflict(signals) {
  if (!Array.isArray(signals) || signals.length === 0) {
    return 'HOLD';
  }

  const groups = groupByAction(signals);
  const actions = ['BUY', 'SELL', 'HOLD'];
  
  // Find the group with the highest average win rate
  let winner = 'HOLD'; // Default fallback
  let maxWinRate = -1;

  actions.forEach(action => {
    if (groups[action].count > 0 && groups[action].avgWinRate > maxWinRate) {
      maxWinRate = groups[action].avgWinRate;
      winner = action;
    }
  });

  // If no win rates available, fall back to majority vote
  if (maxWinRate < 0) {
    const voteCounts = {
      BUY: groups.BUY.count,
      SELL: groups.SELL.count,
      HOLD: groups.HOLD.count
    };
    const maxCount = Math.max(voteCounts.BUY, voteCounts.SELL, voteCounts.HOLD);
    if (maxCount > 0) {
      if (voteCounts.BUY === maxCount) return 'BUY';
      if (voteCounts.SELL === maxCount) return 'SELL';
      return 'HOLD';
    }
  }

  return winner;
}

module.exports = {
  detectConflict,
  resolveConflict,
  calculateConflictScore,
  groupByAction
};

