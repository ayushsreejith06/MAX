const { loadAgents, saveAgents, updateAgent } = require('../utils/agentStorage');
const { updateSector } = require('../utils/sectorStorage');
const { loadDiscussions } = require('../utils/discussionStorage');
const { extractConfidence, clampConfidence } = require('../utils/confidenceUtils');

/**
 * SectorEngine - Handles sector-level operations including confidence updates
 */
class SectorEngine {
  constructor() {
    // Track cooldown periods per sector (sectorId -> lastDiscussionEndTick)
    this.discussionCooldowns = new Map();
    // Cooldown duration in ticks (default: 2 ticks)
    this.cooldownTicks = 2;
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

      // Separate manager and non-manager agents
      const managerAgents = [];
      const nonManagerAgents = [];

      for (const agent of sectorAgents) {
        if (!agent || !agent.id) {
          // Skip invalid agents
          continue;
        }
        
        // Check if agent is a manager
        const isManager = agent.role === 'manager' || 
                         (agent.role && agent.role.toLowerCase().includes('manager'));
        
        if (isManager) {
          managerAgents.push(agent);
        } else {
          nonManagerAgents.push(agent);
        }
      }

      const confidenceList = [];

      for (const agent of nonManagerAgents) {
        const normalizedConfidence = extractConfidence(agent);
        agent.confidence = normalizedConfidence;
        confidenceMap.set(agent.id, normalizedConfidence);
        const agentName = agent.name || agent.id;
        confidenceList.push({ name: agentName, confidence: normalizedConfidence });
      }

      const nonManagerAverage = nonManagerAgents.length
        ? nonManagerAgents.reduce((sum, agent) => sum + extractConfidence(agent), 0) / nonManagerAgents.length
        : null;

      for (const manager of managerAgents) {
        const derivedConfidence = nonManagerAverage !== null
          ? nonManagerAverage
          : extractConfidence(manager);
        const normalizedConfidence = clampConfidence(derivedConfidence);
        manager.confidence = normalizedConfidence;
        confidenceMap.set(manager.id, normalizedConfidence);
        const managerName = manager.name || manager.id;
        confidenceList.push({ name: managerName, confidence: normalizedConfidence });
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
   * Mark that a discussion has ended for a sector (starts cooldown period)
   * @param {string} sectorId - Sector ID
   */
  markDiscussionEnded(sectorId) {
    if (sectorId) {
      this.discussionCooldowns.set(sectorId, Date.now());
      console.log(`[SectorEngine] Marked discussion ended for sector ${sectorId}, cooldown started (${this.cooldownTicks} ticks)`);
    }
  }

  /**
   * Set cooldown duration in ticks
   * @param {number} ticks - Number of ticks for cooldown (default: 2)
   */
  setCooldownTicks(ticks) {
    this.cooldownTicks = Math.max(1, Math.min(10, ticks)); // Clamp between 1 and 10 ticks
  }

  /**
   * Evaluate if a sector is ready for discussion
   * Returns true ONLY if:
   * 1. ALL non-manager agents have confidence >= CONFIDENCE_THRESHOLD (default = 65)
   * 2. There are NO active discussions in that sector
   * 3. Sector is not currently cooling down (optional)
   * 
   * @param {Object} sector - Sector object with agents array
   * @param {number} confidenceThreshold - Confidence threshold (default: 65)
   * @returns {Promise<boolean>} True if sector is ready for discussion
   */
  async evaluateDiscussionReadiness(sector, confidenceThreshold = 65) {
    if (!sector || !sector.id) {
      console.log('[SectorEngine] evaluateDiscussionReadiness: Invalid sector');
      return false;
    }

    try {
      // Load all agents to ensure we have the latest data for manager confidence calculation
      const allAgents = await loadAgents();
      
      // Load agents if not already present in sector object
      let agents = sector.agents;
      if (!Array.isArray(agents) || agents.length === 0) {
        agents = allAgents.filter(agent => agent.sectorId === sector.id);
      }

      // Update manager confidence before checking discussion readiness
      const managerAgents = agents.filter(agent => {
        if (!agent || !agent.id) return false;
        const isManager = agent.role === 'manager' || 
                         (agent.role && agent.role.toLowerCase().includes('manager'));
        return isManager;
      });

      // Update each manager's confidence based on average of non-manager agents
      const nonManagerAgents = agents.filter(agent => {
        if (!agent || !agent.id) return false;
        const isManager = agent.role === 'manager' || 
                         (agent.role && agent.role.toLowerCase().includes('manager'));
        return !isManager;
      });

      const nonManagerAverage = nonManagerAgents.length
        ? nonManagerAgents.reduce((sum, agent) => sum + extractConfidence(agent), 0) / nonManagerAgents.length
        : null;

      for (const manager of managerAgents) {
        // Find manager in allAgents to get latest data
        const managerInAllAgents = allAgents.find(a => a.id === manager.id);
        const newManagerConfidence = clampConfidence(
          nonManagerAverage !== null ? nonManagerAverage : extractConfidence(managerInAllAgents || manager)
        );

        if (managerInAllAgents) {
          managerInAllAgents.confidence = newManagerConfidence;
        }
        manager.confidence = newManagerConfidence;
        
        // Save manager confidence to storage
        try {
          await updateAgent(manager.id, { confidence: newManagerConfidence });
        } catch (error) {
          console.error(`[SectorEngine] Error saving manager confidence for ${manager.id}:`, error);
        }
      }

      // Update sector.agents with latest manager confidence values
      if (Array.isArray(sector.agents)) {
        sector.agents = sector.agents.map(agent => {
          if (!agent || !agent.id) return agent;
          
          // Check if this is a manager
          const isManager = agent.role === 'manager' || 
                           (agent.role && agent.role.toLowerCase().includes('manager'));
          
          if (isManager) {
            // Find updated manager in allAgents
            const updatedManager = allAgents.find(m => m.id === agent.id);
            if (updatedManager) {
              return { ...agent, confidence: updatedManager.confidence };
            }
          }
          
          return agent;
        });
      }

      // STRICT THRESHOLD: Check ALL agents (manager + generals) have confidence >= 65
      const allAboveThreshold = agents.every(agent => extractConfidence(agent) >= confidenceThreshold);

      if (!allAboveThreshold) {
        // DEBUG: Log which agents prevented the discussion from starting
        const agentsBelowThreshold = agents.filter(agent => {
          const confidence = extractConfidence(agent);
          return confidence < confidenceThreshold;
        });
        const agentDetails = agentsBelowThreshold.map(agent => {
          const confidence = extractConfidence(agent);
          return `${agent.name || agent.id} (confidence: ${confidence.toFixed(2)})`;
        }).join(', ');
        console.log(`[SectorEngine] evaluateDiscussionReadiness: Discussion blocked - ${agentsBelowThreshold.length} agent(s) below threshold (${confidenceThreshold}): ${agentDetails}`);
        return false;
      }

      // Calculate manager confidence as average of ALL agents
      const totalConfidence = agents.reduce((sum, agent) => sum + extractConfidence(agent), 0);
      const managerConfidence = totalConfidence / agents.length;

      // Check manager confidence >= 65
      if (managerConfidence < 65) {
        console.log(`[SectorEngine] evaluateDiscussionReadiness: Discussion blocked - Manager confidence (${managerConfidence.toFixed(2)}) < 65`);
        return false;
      }

      // Check if there is any active discussion in this sector
      const discussions = await loadDiscussions();
      // Find discussions that are in progress (include legacy statuses for backward compatibility)
      const activeDiscussion = discussions.find(d => 
        d.sectorId === sector.id && 
        (d.status === 'in_progress' || d.status === 'active' || d.status === 'open' || d.status === 'created')
      );

      if (activeDiscussion) {
        console.log(`[SectorEngine] evaluateDiscussionReadiness: Discussion blocked - Active discussion exists: ${activeDiscussion.id} (status: ${activeDiscussion.status})`);
        return false;
      }

      // Check if sector is in cooldown period
      const lastDiscussionEndTick = this.discussionCooldowns.get(sector.id);
      if (lastDiscussionEndTick !== undefined) {
        // Get current tick from SystemOrchestrator if available, or use a simple counter
        // For now, we'll use a timestamp-based approach
        const currentTime = Date.now();
        const cooldownDurationMs = this.cooldownTicks * 2000; // 2 seconds per tick
        const timeSinceLastDiscussion = currentTime - lastDiscussionEndTick;
        
        if (timeSinceLastDiscussion < cooldownDurationMs) {
          const remainingTicks = Math.ceil((cooldownDurationMs - timeSinceLastDiscussion) / 2000);
          console.log(`[SectorEngine] evaluateDiscussionReadiness: Discussion blocked - Sector ${sector.id} is in cooldown (${remainingTicks} tick(s) remaining)`);
          return false;
        } else {
          // Cooldown expired, remove from map
          this.discussionCooldowns.delete(sector.id);
        }
      }

      // All checks passed - sector is ready for discussion
      const agentDetails = agents.map(agent => {
        const confidence = extractConfidence(agent);
        return `${agent.name || agent.id} (confidence: ${confidence.toFixed(2)})`;
      }).join(', ');
      
      console.log(`[SectorEngine] evaluateDiscussionReadiness: Sector ${sector.id} is READY for discussion. All ${agents.length} agent(s) meet threshold (>= ${confidenceThreshold}), manager confidence (avg): ${managerConfidence.toFixed(2)}. Agents: ${agentDetails}`);
      
      return true;
    } catch (error) {
      console.error(`[SectorEngine] Error evaluating discussion readiness for sector ${sector.id}:`, error);
      return false;
    }
  }

  /**
   * Get discussion ready flag for a sector (legacy method - now calls evaluateDiscussionReadiness)
   * @param {Object} sector - Sector object with agents array
   * @returns {Promise<boolean>} True if sector is ready for discussion
   */
  async getDiscussionReadyFlag(sector) {
    return await this.evaluateDiscussionReadiness(sector);
  }
}

module.exports = SectorEngine;

