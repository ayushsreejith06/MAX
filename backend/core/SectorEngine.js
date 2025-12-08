const ConfidenceEngine = require('./ConfidenceEngine');
const { loadAgents, saveAgents } = require('../utils/agentStorage');
const { updateSector } = require('../utils/sectorStorage');

/**
 * SectorEngine - Handles sector-level operations including confidence updates
 */
class SectorEngine {
  constructor() {
    this.confidenceEngine = new ConfidenceEngine();
  }

  /**
   * Perform confidence updates for all agents in a sector
   * @param {Object} sector - Sector object with agents array
   * @returns {Promise<Object>} Updated sector object with updated agents
   */
  async performConfidenceUpdates(sector) {
    if (!sector || !sector.id) {
      throw new Error('Sector must have an id');
    }

    try {
      // Load all agents from storage
      const allAgents = await loadAgents();
      
      // Filter agents for this sector
      const sectorAgents = allAgents.filter(agent => agent.sectorId === sector.id);
      
      if (sectorAgents.length === 0) {
        // No agents to update, return sector as-is
        return sector;
      }

      // Create a map of agent ID to updated confidence for quick lookup
      const confidenceMap = new Map();

      // Update confidence for each agent using ConfidenceEngine
      const confidenceList = [];
      for (const agent of sectorAgents) {
        if (!agent || !agent.id) {
          // Skip invalid agents
          continue;
        }
        const newConfidence = this.confidenceEngine.updateAgentConfidence(agent, sector);
        agent.confidence = newConfidence;
        confidenceMap.set(agent.id, newConfidence);
        const agentName = agent.name || agent.id;
        confidenceList.push({ name: agentName, confidence: newConfidence });
      }

      // DEBUG: Log list of confidence values
      if (confidenceList.length > 0) {
        const confidenceStr = confidenceList.map(c => `${c.name}: ${c.confidence.toFixed(2)}`).join(', ');
        console.log(`[SectorEngine] Confidence values: [${confidenceStr}]`);
      }

      // Save updated agents to storage
      await saveAgents(allAgents);

      // Update sector's agents array with updated confidence values
      // Merge with agents from storage to ensure we have the latest data
      const updatedSectorAgents = sectorAgents
        .filter(agent => agent && agent.id) // Filter out any null/undefined agents
        .map(agent => {
          // Find corresponding agent in sector.agents if it exists
          const sectorAgent = sector.agents?.find(a => a && a.id === agent.id);
          // Merge sector agent data with updated agent data, prioritizing updated confidence
          return sectorAgent 
            ? { ...sectorAgent, ...agent, confidence: confidenceMap.get(agent.id) }
            : { ...agent, confidence: confidenceMap.get(agent.id) };
        });

      // Also update any agents in sector.agents that aren't in sectorAgents (edge case)
      // Note: Agents that exist in sector but not in storage are considered stale/invalid
      // They are kept in the sector but won't be updated and won't count toward discussionReady
      if (Array.isArray(sector.agents)) {
        sector.agents.forEach(agent => {
          if (agent && agent.id && !confidenceMap.has(agent.id)) {
            // Agent exists in sector but not in storage - keep it but don't update confidence
            // This is an edge case (stale agent data)
            const existing = updatedSectorAgents.find(a => a && a.id === agent.id);
            if (!existing) {
              updatedSectorAgents.push(agent);
            }
          }
        });
      }

      const updatedSector = {
        ...sector,
        agents: updatedSectorAgents
      };

      // Save updated sector to storage
      await updateSector(sector.id, { agents: updatedSector.agents });

      return updatedSector;
    } catch (error) {
      console.error(`[SectorEngine] Error performing confidence updates for sector ${sector.id}:`, error);
      // Return sector as-is on error to avoid blocking
      return sector;
    }
  }

  /**
   * Get discussion ready flag for a sector
   * Returns true if all agents have confidence >= 65
   * @param {Object} sector - Sector object with agents array
   * @returns {boolean} True if all agents have confidence >= 65
   */
  getDiscussionReadyFlag(sector) {
    if (!sector) {
      return false;
    }

    const discussionReady = this.confidenceEngine.shouldTriggerDiscussion(sector);
    
    // DEBUG: Log discussionReady flag
    console.log(`[SectorEngine] discussionReady = ${discussionReady}`);
    
    return discussionReady;
  }
}

module.exports = SectorEngine;

