/**
 * ManagerAgent - Decision Making Subsystem
 * 
 * Integrates voting, confidence aggregation, and conflict resolution modules
 * to combine agent signals and produce final actionable decisions.
 * 
 * This class receives raw agent signals from sector agents and:
 * 1. Runs majority voting to determine action preference
 * 2. Aggregates confidence using weighted averages
 * 3. Detects and resolves conflicts between agent groups
 * 4. Returns final actionable decision: {action, confidence, reason}
 */

const { vote } = require('../manager/voting');
const { aggregateConfidence, aggregateConfidenceForAction } = require('../manager/confidence');
const { detectConflict, resolveConflict } = require('../manager/conflict');
const { loadAgents } = require('../utils/agentStorage');

/**
 * ManagerAgent class for decision-making
 */
class ManagerAgent {
  /**
   * Creates a new ManagerAgent instance
   * @param {string} sectorId - The sector ID this manager oversees
   */
  constructor(sectorId) {
    this.sectorId = sectorId;
    this.conflictThreshold = 0.5; // Default conflict threshold
  }

  /**
   * Sets the conflict threshold for this manager
   * @param {number} threshold - Conflict threshold (0-1)
   */
  setConflictThreshold(threshold) {
    if (typeof threshold === 'number' && threshold >= 0 && threshold <= 1) {
      this.conflictThreshold = threshold;
    }
  }

  /**
   * Enriches agent signals with agent metadata (win rates)
   * @param {Array<{action: string, confidence: number, agentId?: string}>} signals - Raw agent signals
   * @param {Array} agents - Array of agent objects with performance data
   * @returns {Array} Enriched signals with winRate included
   */
  enrichSignalsWithAgentData(signals, agents) {
    const agentMap = {};
    agents.forEach(agent => {
      if (agent.id && agent.performance) {
        agentMap[agent.id] = {
          winRate: typeof agent.performance.winRate === 'number' 
            ? agent.performance.winRate 
            : 0
        };
      }
    });

    return signals.map(signal => {
      const enriched = { ...signal };
      if (signal.agentId && agentMap[signal.agentId]) {
        enriched.winRate = agentMap[signal.agentId].winRate;
      }
      return enriched;
    });
  }

  /**
   * Makes a decision based on agent signals
   * @param {Array<{action: string, confidence: number, agentId?: string}>} signals - Raw agent signals
   * @param {Object} options - Optional configuration
   * @param {number} options.conflictThreshold - Override conflict threshold
   * @returns {Promise<Object>} Final decision object
   */
  async decide(signals, options = {}) {
    if (!Array.isArray(signals) || signals.length === 0) {
      return {
        action: 'HOLD',
        confidence: 0,
        reason: 'No agent signals provided'
      };
    }

    // Load agents to get win rate data
    let agents = [];
    try {
      agents = await loadAgents();
      // Filter to sector agents if sectorId is set
      if (this.sectorId) {
        agents = agents.filter(agent => agent.sectorId === this.sectorId);
      }
    } catch (error) {
      console.warn('Failed to load agents for win rate lookup:', error.message);
    }

    // Enrich signals with agent win rates
    const enrichedSignals = this.enrichSignalsWithAgentData(signals, agents);

    // Step 1: Majority voting
    let votingResult;
    try {
      votingResult = vote(enrichedSignals);
    } catch (error) {
      return {
        action: 'HOLD',
        confidence: 0,
        reason: `Voting failed: ${error.message}`
      };
    }

    // Step 2: Conflict detection
    const conflictThreshold = options.conflictThreshold ?? this.conflictThreshold;
    const conflictResult = detectConflict(enrichedSignals, conflictThreshold);

    // Step 3: Handle conflicts
    let finalAction = votingResult.action;
    let reason = `Majority vote: ${votingResult.votes[finalAction]} agents voted ${finalAction}`;

    if (conflictResult.needsReview) {
      // Resolve conflict using highest win-rate cluster
      finalAction = resolveConflict(enrichedSignals);
      reason = `Conflict detected (score: ${conflictResult.conflictScore.toFixed(2)}). Resolved using highest win-rate cluster: ${finalAction}`;
    }

    // Step 4: Aggregate confidence for the final action
    const agentWinRates = {};
    agents.forEach(agent => {
      if (agent.id && agent.performance) {
        agentWinRates[agent.id] = agent.performance.winRate || 0;
      }
    });

    const finalConfidence = aggregateConfidenceForAction(
      enrichedSignals,
      finalAction,
      agentWinRates
    );

    // If conflict requires review, return NEEDS_REVIEW
    if (conflictResult.needsReview && conflictResult.conflictScore > 0.7) {
      return {
        action: 'NEEDS_REVIEW',
        confidence: finalConfidence,
        reason: `High conflict detected (score: ${conflictResult.conflictScore.toFixed(2)}). Manual review required.`,
        conflictScore: conflictResult.conflictScore,
        voteBreakdown: votingResult.votes,
        suggestedAction: finalAction
      };
    }

    // Return final decision
    return {
      action: finalAction,
      confidence: finalConfidence,
      reason: reason,
      voteBreakdown: votingResult.votes,
      conflictScore: conflictResult.conflictScore
    };
  }

  /**
   * Processes signals and returns decision (alias for decide)
   * @param {Array} signals - Agent signals
   * @param {Object} options - Optional configuration
   * @returns {Promise<Object>} Decision object
   */
  async processSignals(signals, options = {}) {
    return this.decide(signals, options);
  }
}

module.exports = ManagerAgent;

