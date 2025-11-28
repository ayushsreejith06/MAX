/**
 * Voting Module
 * 
 * Implements majority voting logic for agent signals.
 * Each signal includes {action, confidence} where action is BUY, SELL, or HOLD.
 * 
 * Rules:
 * - Majority voting for action class: BUY, SELL, HOLD
 * - If votes tie, pick action with highest summed confidence
 */

/**
 * Counts votes for each action type
 * @param {Array<{action: string, confidence: number}>} signals - Array of agent signals
 * @returns {Object} Vote counts and confidence sums per action
 */
function countVotes(signals) {
  const votes = {
    BUY: { count: 0, confidenceSum: 0 },
    SELL: { count: 0, confidenceSum: 0 },
    HOLD: { count: 0, confidenceSum: 0 }
  };

  signals.forEach(signal => {
    const action = signal.action?.toUpperCase();
    const confidence = typeof signal.confidence === 'number' ? signal.confidence : 0;

    if (votes.hasOwnProperty(action)) {
      votes[action].count += 1;
      votes[action].confidenceSum += confidence;
    }
  });

  return votes;
}

/**
 * Determines the winning action based on majority voting
 * @param {Object} votes - Vote counts and confidence sums per action
 * @returns {string} Winning action (BUY, SELL, or HOLD)
 */
function getMajorityAction(votes) {
  const actions = ['BUY', 'SELL', 'HOLD'];
  const counts = actions.map(action => votes[action].count);
  const maxCount = Math.max(...counts);

  // Find all actions with the maximum count
  const tiedActions = actions.filter(action => votes[action].count === maxCount);

  // If there's a clear majority, return it
  if (tiedActions.length === 1) {
    return tiedActions[0];
  }

  // If there's a tie, pick the action with highest summed confidence
  let winner = tiedActions[0];
  let maxConfidenceSum = votes[winner].confidenceSum;

  for (let i = 1; i < tiedActions.length; i++) {
    const action = tiedActions[i];
    if (votes[action].confidenceSum > maxConfidenceSum) {
      maxConfidenceSum = votes[action].confidenceSum;
      winner = action;
    }
  }

  return winner;
}

/**
 * Performs majority voting on agent signals
 * @param {Array<{action: string, confidence: number}>} signals - Array of agent signals
 * @returns {Object} Voting result with action and vote breakdown
 */
function vote(signals) {
  if (!Array.isArray(signals) || signals.length === 0) {
    throw new Error('Signals array is required and must not be empty');
  }

  const votes = countVotes(signals);
  const winningAction = getMajorityAction(votes);

  return {
    action: winningAction,
    votes: {
      BUY: votes.BUY.count,
      SELL: votes.SELL.count,
      HOLD: votes.HOLD.count
    },
    confidenceSums: {
      BUY: votes.BUY.confidenceSum,
      SELL: votes.SELL.confidenceSum,
      HOLD: votes.HOLD.confidenceSum
    }
  };
}

module.exports = {
  vote,
  countVotes,
  getMajorityAction
};

