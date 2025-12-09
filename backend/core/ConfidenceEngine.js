/**
 * ConfidenceEngine - Balanced dummy logic for updating agent confidence
 * 
 * Implements balanced confidence system that prevents endless decrease:
 * - Each tick: confidence += random(-3, +4) (slight positive bias)
 * - Clamp confidence between -100 and 100
 * - Rebound: If confidence < 0 for 3 consecutive ticks, add random(5, 15)
 * - Damping: If confidence > 80, subtract random(1, 4)
 * 
 * Confidence range: -100 to +100
 * Discussion trigger: All agents must have confidence >= 65
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
    
    /**
     * Track consecutive ticks below 0 per agent
     * Map<agentId, count>
     */
    this.consecutiveNegativeTicks = new Map();
  }

  /**
   * Generate random integer between min (inclusive) and max (inclusive)
   * @private
   */
  _randomInt(min, max) {
    return Math.floor(Math.random() * (max - min + 1)) + min;
  }

  /**
   * Update agent confidence using balanced dummy logic
   * @param {Object} agent - Agent object with id, role, performance, personality, morale, etc.
   * @param {Object} sector - Sector object (kept for compatibility, not used in dummy logic)
   * @returns {number} Updated confidence value (-100 to +100)
   */
  updateAgentConfidence(agent, sector) {
    if (!agent) {
      return 0; // Default neutral confidence
    }
    
    // Ensure agent has required fields
    if (!agent.id) {
      console.warn('[ConfidenceEngine] Agent missing id field, returning 0');
      return 0;
    }

    // Get current confidence from agent (default to 0 if not set)
    let currentConfidence = typeof agent.confidence === 'number' 
      ? Math.max(-100, Math.min(100, agent.confidence))
      : 0;

    // Step 1: Base tick change - random(-3, +4) for slight positive bias
    const baseChange = this._randomInt(-3, 4);
    currentConfidence += baseChange;

    // Step 2: Track consecutive ticks below 0
    const agentId = agent.id;
    if (currentConfidence < 0) {
      const negativeCount = (this.consecutiveNegativeTicks.get(agentId) || 0) + 1;
      this.consecutiveNegativeTicks.set(agentId, negativeCount);

      // Step 3: Rebound after 3 consecutive ticks below 0
      if (negativeCount >= 3) {
        const rebound = this._randomInt(5, 15);
        currentConfidence += rebound;
        // Reset counter after rebound
        this.consecutiveNegativeTicks.set(agentId, 0);
        console.log(`[ConfidenceEngine] Agent ${agentId} rebound: +${rebound} (was below 0 for ${negativeCount} ticks)`);
      }
    } else {
      // Reset counter when confidence goes above 0
      this.consecutiveNegativeTicks.set(agentId, 0);
    }

    // Step 4: Soft damping for high confidence (>80)
    if (currentConfidence > 80) {
      const damping = this._randomInt(1, 4);
      currentConfidence -= damping;
    }

    // Step 5: Clamp to valid range [-100, 100]
    const finalConfidence = Math.max(-100, Math.min(100, currentConfidence));

    // DEBUG: Log agent ID and new confidence value
    const agentName = agent.name || agent.id;
    console.log(`[ConfidenceEngine] Agent ${agent.id} (${agentName}): confidence = ${finalConfidence.toFixed(2)} (change: ${baseChange})`);

    return finalConfidence;
  }

  /**
   * Check if discussion should be triggered for a sector
   * Returns true ONLY if ALL agents have confidence >= 65
   * @param {Object} sector - Sector object with agents array
   * @returns {boolean} True if all agents have confidence >= 65
   */
  shouldTriggerDiscussion(sector) {
    if (!sector || !Array.isArray(sector.agents) || sector.agents.length === 0) {
      return false;
    }

    // Filter out null/undefined agents and check if all valid agents have confidence >= 65
    const validAgents = sector.agents.filter(agent => agent && agent.id);
    if (validAgents.length === 0) {
      return false;
    }

    // Check if all valid agents have confidence >= 65
    return validAgents.every(agent => {
      const confidence = typeof agent.confidence === 'number' 
        ? agent.confidence 
        : 0;
      return confidence >= 65;
    });
  }

}

module.exports = ConfidenceEngine;
