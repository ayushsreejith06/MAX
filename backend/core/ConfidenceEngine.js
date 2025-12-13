/**
 * ConfidenceEngine - Data-driven confidence updates
 * 
 * Confidence is derived from:
 * - Agent's own proposal attributes (signal strength, volatility, alignment with sector trend)
 * - Checklist item outcomes (ACCEPTED increases, REJECTED decreases)
 * - Time-based decay when idle
 * 
 * Rules:
 * - Confidence can increase or decrease based on proposal quality and outcomes
 * - Confidence decays slowly over time if agent is idle
 * - No monotonically increasing logic - confidence reflects actual performance
 */

class ConfidenceEngine {
  constructor(customRules = {}) {
    /**
     * Custom user rules for confidence calculation (kept for compatibility)
     * Format: {
     *   agentTypeModifiers: { [role]: (baseConfidence, marketData) => number },
     *   marketDataModifiers: { [indicator]: (value, agent) => number },
     *   globalModifiers: (confidence, agent, sector) => number
     * }
     */
    this.customRules = customRules;
    
    // Configuration constants
    this.ACCEPTED_BOOST = 3; // Confidence increase per ACCEPTED item
    this.REJECTED_PENALTY = 5; // Confidence decrease per REJECTED item
    this.IDLE_DECAY_RATE = 0.1; // Confidence decay per hour of inactivity
    this.IDLE_THRESHOLD_MS = 3600000; // 1 hour in milliseconds
  }

  /**
   * Clamp confidence value to 1-100 range
   * @private
   */
  _clampConfidence(value) {
    if (typeof value !== 'number' || !Number.isFinite(value)) {
      return 1;
    }
    return Math.max(1, Math.min(100, value));
  }

  /**
   * Calculate base confidence from proposal attributes.
   * 
   * @param {Object} proposal - Proposal object with:
   *   - signalStrength: number (0-100) - Strength of the trading signal
   *   - volatility: number (0-100) - Market volatility (higher = lower confidence)
   *   - alignmentWithSectorTrend: number (0-100) - How well proposal aligns with sector trend
   * @param {Object} agent - Agent object (optional, for context)
   * @returns {number} Base confidence value (1-100)
   */
  calculateBaseConfidenceFromProposal(proposal, agent = null) {
    if (!proposal) {
      return 1; // Default minimum confidence
    }

    // Extract proposal attributes with defaults
    const signalStrength = typeof proposal.signalStrength === 'number' 
      ? Math.max(0, Math.min(100, proposal.signalStrength))
      : (typeof proposal.confidence === 'number' ? proposal.confidence : 50);
    
    const volatility = typeof proposal.volatility === 'number'
      ? Math.max(0, Math.min(100, proposal.volatility))
      : 50; // Default moderate volatility
    
    const alignmentWithSectorTrend = typeof proposal.alignmentWithSectorTrend === 'number'
      ? Math.max(0, Math.min(100, proposal.alignmentWithSectorTrend))
      : 50; // Default neutral alignment

    // Calculate base confidence using weighted components
    // Signal strength: 50% weight
    // Alignment: 30% weight
    // Volatility penalty: 20% weight (inverse - higher volatility = lower confidence)
    const signalContribution = signalStrength * 0.5;
    const alignmentContribution = alignmentWithSectorTrend * 0.3;
    const volatilityPenalty = (100 - volatility) * 0.2; // Invert volatility (high vol = low confidence)

    const baseConfidence = signalContribution + alignmentContribution + volatilityPenalty;

    return this._clampConfidence(baseConfidence);
  }

  /**
   * Update agent confidence based on proposal attributes.
   * This replaces the old LLM-only approach with data-driven calculation.
   * 
   * @param {Object} agent - Agent object with id, role, performance, personality, morale, etc.
   * @param {Object} proposal - Proposal object with signalStrength, volatility, alignmentWithSectorTrend
   * @param {Object} sector - Sector object (optional, for context)
   * @returns {number} Updated confidence value (1 to 100)
   */
  updateAgentConfidence(agent, proposal = null, sector = null) {
    if (!agent) {
      return 1; // Default minimum confidence
    }
    
    // Ensure agent has required fields
    if (!agent.id) {
      console.warn('[ConfidenceEngine] Agent missing id field, returning 1');
      return 1;
    }

    const previousConfidence = this._clampConfidence(
      typeof agent.confidence === 'number' ? agent.confidence : 1
    );

    let newConfidence = previousConfidence;

    // If proposal provided, calculate base confidence from proposal attributes
    if (proposal) {
      newConfidence = this.calculateBaseConfidenceFromProposal(proposal, agent);
    } else {
      // No proposal - apply idle decay if agent has been inactive
      newConfidence = this.applyIdleDecay(agent, previousConfidence);
    }

    // Apply custom rules if provided
    if (this.customRules.globalModifiers && typeof this.customRules.globalModifiers === 'function') {
      newConfidence = this.customRules.globalModifiers(newConfidence, agent, sector);
    }

    const finalConfidence = this._clampConfidence(newConfidence);

    // DEBUG: Log agent ID and new confidence value
    const agentName = agent.name || agent.id;
    if (Math.abs(finalConfidence - previousConfidence) > 0.01) {
      const reason = proposal ? 'proposal-based' : 'idle-decay';
      console.log(`[ConfidenceEngine] Agent ${agent.id} (${agentName}): confidence = ${previousConfidence.toFixed(2)} → ${finalConfidence.toFixed(2)} (${reason})`);
    }

    return finalConfidence;
  }

  /**
   * Update confidence after a checklist item is ACCEPTED.
   * Increases confidence based on acceptance.
   * 
   * @param {Object} agent - Agent object
   * @param {Object} checklistItem - Checklist item that was accepted (optional)
   * @returns {number} Updated confidence value (1 to 100)
   */
  updateConfidenceAfterAccepted(agent, checklistItem = null) {
    if (!agent || !agent.id) {
      return 1;
    }

    const currentConfidence = this._clampConfidence(
      typeof agent.confidence === 'number' ? agent.confidence : 1
    );

    // Increase confidence by ACCEPTED_BOOST
    const newConfidence = this._clampConfidence(currentConfidence + this.ACCEPTED_BOOST);

    const agentName = agent.name || agent.id;
    console.log(`[ConfidenceEngine] Agent ${agent.id} (${agentName}): confidence increased after ACCEPTED item: ${currentConfidence.toFixed(2)} → ${newConfidence.toFixed(2)} (+${this.ACCEPTED_BOOST})`);

    return newConfidence;
  }

  /**
   * Update confidence after a checklist item is REJECTED.
   * Decreases confidence based on rejection.
   * 
   * @param {Object} agent - Agent object
   * @param {Object} checklistItem - Checklist item that was rejected (optional)
   * @returns {number} Updated confidence value (1 to 100)
   */
  updateConfidenceAfterRejected(agent, checklistItem = null) {
    if (!agent || !agent.id) {
      return 1;
    }

    const currentConfidence = this._clampConfidence(
      typeof agent.confidence === 'number' ? agent.confidence : 1
    );

    // Decrease confidence by REJECTED_PENALTY
    const newConfidence = this._clampConfidence(currentConfidence - this.REJECTED_PENALTY);

    const agentName = agent.name || agent.id;
    console.log(`[ConfidenceEngine] Agent ${agent.id} (${agentName}): confidence decreased after REJECTED item: ${currentConfidence.toFixed(2)} → ${newConfidence.toFixed(2)} (-${this.REJECTED_PENALTY})`);

    return newConfidence;
  }

  /**
   * Apply idle decay to confidence if agent has been inactive.
   * Confidence decays slowly over time if agent hasn't made proposals.
   * 
   * @param {Object} agent - Agent object
   * @param {number} currentConfidence - Current confidence value
   * @returns {number} Updated confidence value after decay (1 to 100)
   */
  applyIdleDecay(agent, currentConfidence) {
    if (!agent) {
      return currentConfidence;
    }

    // Get last activity timestamp
    const lastActivity = agent.lastDecisionAt || agent.lastActivity || agent.lastProposalAt;
    if (!lastActivity) {
      // No activity recorded - apply small decay
      return this._clampConfidence(currentConfidence - this.IDLE_DECAY_RATE);
    }

    // Calculate time since last activity
    const lastActivityTime = new Date(lastActivity).getTime();
    const now = Date.now();
    const idleTimeMs = now - lastActivityTime;

    // Only apply decay if idle for more than threshold
    if (idleTimeMs < this.IDLE_THRESHOLD_MS) {
      return currentConfidence; // Not idle enough to decay
    }

    // Calculate decay: IDLE_DECAY_RATE per hour
    const idleHours = idleTimeMs / (1000 * 60 * 60);
    const decayAmount = this.IDLE_DECAY_RATE * idleHours;

    const newConfidence = this._clampConfidence(currentConfidence - decayAmount);

    // Only log if decay was significant
    if (Math.abs(newConfidence - currentConfidence) > 0.1) {
      const agentName = agent.name || agent.id;
      console.log(`[ConfidenceEngine] Agent ${agent.id} (${agentName}): confidence decayed due to inactivity (${idleHours.toFixed(1)}h idle): ${currentConfidence.toFixed(2)} → ${newConfidence.toFixed(2)}`);
    }

    return newConfidence;
  }

  /**
   * Update manager confidence as a weighted aggregation of agent confidence.
   * Manager confidence = weighted average of all non-manager agents in the sector.
   * 
   * Rules:
   * - If no agents exist → manager confidence = 0
   * - Manager confidence = weighted average of agent confidence
   * - Weights are equal for now (can be extended to use agent performance/win rate)
   * - Manager confidence updates dynamically as agent confidence changes
   * 
   * @param {Object} manager - Manager agent object
   * @param {Array<Object>} agents - Array of all agents (including manager)
   * @param {Object} options - Optional configuration:
   *   - weights: Map of agentId -> weight (if not provided, equal weights are used)
   * @returns {number} Updated manager confidence value (0 to 100)
   */
  updateManagerConfidence(manager, agents, options = {}) {
    if (!manager || !manager.id) {
      console.warn('[ConfidenceEngine] Manager missing or invalid, returning 0');
      return 0;
    }

    if (!Array.isArray(agents) || agents.length === 0) {
      console.warn('[ConfidenceEngine] No agents provided for manager confidence calculation, returning 0');
      // Manager has no confidence if there are no other agents
      return 0;
    }

    // Filter ALL non-manager agents in the same sector
    const sectorId = manager.sectorId;
    const sectorAgents = agents.filter(agent => {
      if (!agent || !agent.id) return false;
      if (agent.id === manager.id) return false; // Exclude manager itself
      
      // Check if agent is a manager
      const isManager = agent.role === 'manager' || 
                       (agent.role && agent.role.toLowerCase().includes('manager'));
      if (isManager) return false;
      
      // Check if agent is in the same sector
      return agent.sectorId === sectorId;
    });

    if (sectorAgents.length === 0) {
      // No other agents in sector - manager has no confidence
      const managerName = manager.name || manager.id;
      console.log(`[ConfidenceEngine] No agents in sector ${sectorId} for manager ${managerName} (${manager.id}), returning 0 (manager confidence fully depends on other agents)`);
      return 0;
    }

    // Calculate weighted average confidence of ALL agents in the sector (excluding manager)
    // Normalize confidence values from -100 to +100 range to 0-100 range
    let totalWeightedConfidence = 0;
    let totalWeight = 0;

    // Use provided weights or default to equal weights (1.0 for each agent)
    const weights = options.weights || new Map();
    const defaultWeight = 1.0;

    for (const agent of sectorAgents) {
      let confidence = typeof agent.confidence === 'number' ? agent.confidence : 0;
      
      // Normalize from -100 to +100 range to 0-100 range
      if (confidence < 0) {
        confidence = Math.max(0, (confidence + 100) / 2);
      } else if (confidence > 100) {
        confidence = 100;
      }
      // If already in 0-100 range, use as-is
      
      // Get weight for this agent (default to 1.0 for equal weights)
      const weight = weights.has(agent.id) ? weights.get(agent.id) : defaultWeight;
      
      totalWeightedConfidence += confidence * weight;
      totalWeight += weight;
    }

    // Manager confidence = weighted average of ALL agents in the sector
    const managerConfidence = totalWeight > 0 
      ? totalWeightedConfidence / totalWeight
      : 0;

    // Clamp to valid range [0, 100] - manager confidence NEVER exceeds 0-100
    const finalConfidence = Math.max(0, Math.min(100, managerConfidence));

    // DEBUG: Log manager confidence update
    const managerName = manager.name || manager.id;
    console.log(`[ConfidenceEngine] Updated manager confidence: weightedAvg=${managerConfidence.toFixed(2)}, final=${finalConfidence.toFixed(2)} (manager: ${managerName}, ${sectorAgents.length} agents in sector, totalWeight=${totalWeight.toFixed(2)})`);

    return finalConfidence;
  }

  /**
   * Check if discussion should be triggered for a sector
   * Returns true ONLY if:
   * 1. ALL non-manager agents have confidence >= 65
   * 2. ALL manager agents have confidence >= 65 (normalized to 0-100 range)
   * @param {Object} sector - Sector object with agents array
   * @returns {boolean} True if all agents (including managers) have confidence >= 65
   */
  shouldTriggerDiscussion(sector) {
    if (!sector || !Array.isArray(sector.agents) || sector.agents.length === 0) {
      return false;
    }

    // Filter out null/undefined agents
    const validAgents = sector.agents.filter(agent => agent && agent.id);
    if (validAgents.length === 0) {
      return false;
    }

    // Check if all valid agents have confidence >= 65
    // For managers, normalize confidence to 0-100 range if needed
    return validAgents.every(agent => {
      let confidence = typeof agent.confidence === 'number' 
        ? agent.confidence 
        : 0;
      
      // Normalize manager confidence from -100 to +100 range to 0-100 range if needed
      const isManager = agent.role === 'manager' || 
                       (agent.role && agent.role.toLowerCase().includes('manager'));
      if (isManager) {
        if (confidence < 0) {
          confidence = Math.max(0, (confidence + 100) / 2);
        } else if (confidence > 100) {
          confidence = 100;
        }
      }
      
      return confidence >= 65;
    });
  }

}

module.exports = ConfidenceEngine;
