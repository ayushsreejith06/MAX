const { loadAgents, updateAgent } = require('../../../utils/agentStorage');
const { extractConfidence, clampConfidence } = require('../../../utils/confidenceUtils');

/**
 * SectorEngine - Manages sector-level operations including confidence updates
 * 
 * Handles:
 * - Loading agents for a sector
 * - Updating confidence for all agents in a sector
 * - Persisting confidence values to storage
 * - Determining if sector is ready for discussions
 */
class SectorEngine {
  constructor(customRules = {}) {
  }

  /**
   * Load all agents for a specific sector
   * @param {string} sectorId - Sector ID
   * @returns {Promise<Array>} Array of agent objects belonging to the sector
   */
  async loadAgents(sectorId) {
    if (!sectorId || typeof sectorId !== 'string') {
      throw new Error('loadAgents: sectorId must be a non-empty string');
    }

    try {
      const allAgents = await loadAgents();
      const sectorAgents = allAgents.filter(agent => agent.sectorId === sectorId);
      return sectorAgents;
    } catch (error) {
      console.error(`[SectorEngine] Error loading agents for sector ${sectorId}:`, error);
      throw error;
    }
  }

  /**
   * Perform confidence updates for all agents in a sector
   * Updates each agent's confidence using ConfidenceEngine and saves back to agent model
   * @param {Object} sector - Sector object with market data (currentPrice, change, changePercent, volume, volatility, riskScore, etc.)
   * @returns {Promise<Array>} Array of updated agent objects with new confidence values
   */
  async performConfidenceUpdates(sector) {
    if (!sector || !sector.id) {
      throw new Error('performConfidenceUpdates: sector must have an id');
    }

    try {
      // Load all agents for this sector
      const agents = await this.loadAgents(sector.id);

      if (agents.length === 0) {
        console.warn(`[SectorEngine] No agents found for sector ${sector.id}`);
        return [];
      }

      // Normalize confidence for each agent using LLM confidence when available
      const updatedAgents = [];
      for (const agent of agents) {
        try {
          const normalized = extractConfidence(agent);
          agent.confidence = normalized;
          updatedAgents.push(agent);
        } catch (error) {
          console.error(`[SectorEngine] Error updating confidence for agent ${agent?.id}:`, error);
          // Continue with other agents even if one fails
        }
      }

      return updatedAgents;
    } catch (error) {
      console.error(`[SectorEngine] Error performing confidence updates for sector ${sector.id}:`, error);
      throw error;
    }
  }

  /**
   * Save confidence values for agents to persistent storage
   * @param {string} sectorId - Sector ID
   * @param {Array} agents - Array of agent objects with updated confidence values
   * @returns {Promise<void>}
   */
  async saveConfidenceValues(sectorId, agents) {
    if (!sectorId || typeof sectorId !== 'string') {
      throw new Error('saveConfidenceValues: sectorId must be a non-empty string');
    }

    if (!Array.isArray(agents)) {
      throw new Error('saveConfidenceValues: agents must be an array');
    }

    try {
      // Update each agent's confidence in storage
      const updatePromises = agents.map(agent => {
        if (!agent || !agent.id) {
          console.warn('[SectorEngine] Skipping invalid agent in saveConfidenceValues');
          return Promise.resolve();
        }

        // Only update the confidence field
        return updateAgent(agent.id, {
          confidence: clampConfidence(agent.confidence)
        });
      });

      await Promise.all(updatePromises);
      
      console.log(`[SectorEngine] Saved confidence values for ${agents.length} agents in sector ${sectorId}`);
    } catch (error) {
      console.error(`[SectorEngine] Error saving confidence values for sector ${sectorId}:`, error);
      throw error;
    }
  }

  /**
   * Get discussion ready flag for a sector
   * Returns TRUE if all agents have confidence >= 65, otherwise FALSE
   * @param {Object} sector - Sector object (can include agents array, but will load if not present)
   * @returns {Promise<boolean>} True if all agents have confidence >= 65, false otherwise
   */
  async getDiscussionReadyFlag(sector) {
    if (!sector || !sector.id) {
      return false;
    }

    try {
      // Load agents if not already present in sector object
      let agents = sector.agents;
      if (!Array.isArray(agents) || agents.length === 0) {
        agents = await this.loadAgents(sector.id);
      }

      // If no agents, not ready for discussion
      if (agents.length === 0) {
        return false;
      }

      // Check if all agents have confidence >= 65
      const allReady = agents.every(agent => extractConfidence(agent) >= 65);

      return allReady;
    } catch (error) {
      console.error(`[SectorEngine] Error checking discussion ready flag for sector ${sector.id}:`, error);
      return false;
    }
  }
}

module.exports = SectorEngine;

