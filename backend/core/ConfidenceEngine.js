/**
 * ConfidenceEngine - LLM-driven confidence updates
 * 
 * Phase 4: Confidence is monotonically increasing.
 * Phase 5: Confidence will be data-driven and bidirectional.
 * 
 * Phase 4 Rule: confidence_next = min(100, max(previous_confidence, llm_confidence_output))
 * - Confidence can ONLY stay the same or increase
 * - Confidence can NEVER decrease in Phase 4
 * - Confidence MUST be capped at 100
 * 
 * NOTE: This engine now requires LLM confidence output. If LLM confidence is not provided,
 * confidence will remain at its previous value (no decay).
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
  }

  /**
   * Clamp confidence value to 0-100 range
   * @private
   */
  _clampConfidence(value) {
    if (typeof value !== 'number' || !Number.isFinite(value)) {
      return 1;
    }
    return Math.max(1, Math.min(100, value));
  }

  /**
   * Update agent confidence using LLM-derived confidence directly.
   * No automatic increases - confidence is derived from LLM output.
   * 
   * @param {Object} agent - Agent object with id, role, performance, personality, morale, etc.
   * @param {Object} sector - Sector object (optional, for context)
   * @param {number} llmConfidenceOutput - LLM-provided confidence value (1-100). If not provided, uses agent.llmAction.confidence or defaults to 1.
   * @returns {number} Updated confidence value (1 to 100)
   */
  updateAgentConfidence(agent, sector = null, llmConfidenceOutput = null) {
    if (!agent) {
      return 1; // Default minimum confidence
    }
    
    // Ensure agent has required fields
    if (!agent.id) {
      console.warn('[ConfidenceEngine] Agent missing id field, returning 1');
      return 1;
    }

    // Get LLM confidence output
    let llmConfidence = 1; // Default: minimum confidence
    
    if (llmConfidenceOutput !== null && typeof llmConfidenceOutput === 'number') {
      llmConfidence = llmConfidenceOutput;
    } else if (agent.llmAction && typeof agent.llmAction.confidence === 'number') {
      // Fallback: try to get LLM confidence from agent's llmAction
      llmConfidence = agent.llmAction.confidence;
    }
    
    // Clamp LLM confidence to valid range (1-100)
    const finalConfidence = this._clampConfidence(llmConfidence);

    // DEBUG: Log agent ID and new confidence value
    const agentName = agent.name || agent.id;
    const previousConfidence = this._clampConfidence(
      typeof agent.confidence === 'number' ? agent.confidence : 1
    );
    if (Math.abs(finalConfidence - previousConfidence) > 0.01) {
      console.log(`[ConfidenceEngine] Agent ${agent.id} (${agentName}): confidence = ${previousConfidence.toFixed(2)} → ${finalConfidence.toFixed(2)} (LLM-derived)`);
    }

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
