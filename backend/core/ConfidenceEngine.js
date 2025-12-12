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
   * Update manager confidence as a direct reflection of ALL agents in the sector.
   * Manager confidence = average confidence of all non-manager agents in the sector.
   * This ensures the manager gets closer to 65 as ALL agents get closer to 65.
   * @param {Object} manager - Manager agent object
   * @param {Array<Object>} agents - Array of all agents (including manager)
   * @returns {number} Updated manager confidence value (0 to 100)
   */
  updateManagerConfidence(manager, agents) {
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

    // Calculate average confidence of ALL agents in the sector (excluding manager)
    // Normalize confidence values from -100 to +100 range to 0-100 range
    let totalConfidence = 0;
    let validAgents = 0;

    for (const agent of sectorAgents) {
      let confidence = typeof agent.confidence === 'number' ? agent.confidence : 0;
      
      // Normalize from -100 to +100 range to 0-100 range
      if (confidence < 0) {
        confidence = Math.max(0, (confidence + 100) / 2);
      } else if (confidence > 100) {
        confidence = 100;
      }
      // If already in 0-100 range, use as-is
      
      totalConfidence += confidence;
      validAgents++;
    }

    // Manager confidence = direct average of ALL agents in the sector
    // This ensures manager gets closer to 65 as ALL agents get closer to 65
    const managerConfidence = validAgents > 0 
      ? totalConfidence / validAgents
      : 0;

    // Clamp to valid range [0, 100] - manager confidence NEVER exceeds 0-100
    const finalConfidence = Math.max(0, Math.min(100, managerConfidence));

    // DEBUG: Log manager confidence update
    const managerName = manager.name || manager.id;
    console.log(`[ConfidenceEngine] Updated manager confidence: avgAllAgents=${managerConfidence.toFixed(2)}, final=${finalConfidence.toFixed(2)} (manager: ${managerName}, ${validAgents} agents in sector)`);

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
