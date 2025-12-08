const SectorEngine = require('../../SectorEngine');
const ManagerEngine = require('../../ManagerEngine');
const { getSectorById } = require('../../../utils/sectorStorage');
const { loadAgents } = require('../../../utils/agentStorage');

/**
 * SystemOrchestrator - Coordinates system-level operations across sectors
 */
class SystemOrchestrator {
  constructor() {
    this.sectorEngine = new SectorEngine();
    this.managerEngine = new ManagerEngine();
    this.tickCounter = 0;
  }

  /**
   * Tick a sector: update agent confidence and check if discussion is ready
   * @param {string} sectorId - Sector ID to tick
   * @returns {Promise<{sector: Object, discussionReady: boolean}>} Updated sector and discussion ready flag
   */
  async tickSector(sectorId) {
    if (!sectorId) {
      throw new Error('sectorId is required');
    }

    try {
      // 1. Load sector
      const sector = await getSectorById(sectorId);
      
      if (!sector) {
        throw new Error(`Sector ${sectorId} not found`);
      }

      // Enrich sector with agents from agents.json (source of truth)
      try {
        const allAgents = await loadAgents();
        const sectorAgents = allAgents.filter(agent => agent.sectorId === sectorId);
        
        // Merge agents from agents.json with sector's stored agents array
        // Use a Map to deduplicate by agent ID, preferring agents.json data
        const agentMap = new Map();
        
        // First, add agents from sector.agents (stored in sector)
        if (Array.isArray(sector.agents)) {
          sector.agents.forEach(agent => {
            if (agent && agent.id) {
              agentMap.set(agent.id, agent);
            }
          });
        }
        
        // Then, add/update with agents from agents.json (source of truth)
        sectorAgents
          .filter(agent => agent && agent.id) // Filter out null/undefined agents
          .forEach(agent => {
            agentMap.set(agent.id, agent);
          });
        
        // Update sector with merged agents array
        sector.agents = Array.from(agentMap.values());
      } catch (agentError) {
        console.warn(`[SystemOrchestrator] Failed to enrich sector with agents:`, agentError.message);
        // Continue with sector.agents as-is if enrichment fails
      }

      // Increment tick counter
      this.tickCounter++;
      const tickNumber = this.tickCounter;

      // DEBUG: Start tick log
      console.log(`\n=== TICK # ${tickNumber} ===`);

      // 2. Run SectorEngine.performConfidenceUpdates
      const updatedSector = await this.sectorEngine.performConfidenceUpdates(sector);

      // 3. Compute discussionReady = SectorEngine.getDiscussionReadyFlag
      const discussionReady = this.sectorEngine.getDiscussionReadyFlag(updatedSector);

      // 4. Format and log agent confidences
      const agentConfidences = (updatedSector.agents || [])
        .filter(agent => agent && agent.id)
        .map(agent => {
          const name = agent.name || agent.id;
          const confidence = typeof agent.confidence === 'number' ? agent.confidence : 0;
          return `${name}: ${confidence.toFixed(2)}`;
        });
      
      console.log(`Agent Confidences: [${agentConfidences.join(', ')}]`);
      console.log(`All >= 65? ${discussionReady}`);

      // 5. Handle discussion ready with ManagerEngine
      const managerResult = await this.managerEngine.handleDiscussionReady(
        sectorId, 
        discussionReady, 
        updatedSector
      );

      // 6. Log manager decision
      if (managerResult.created) {
        console.log(`Manager Decision: started discussion (ID: ${managerResult.discussionId})`);
      } else {
        console.log(`Manager Decision: skipped`);
      }

      // 7. Return updated sector + discussionReady boolean
      return {
        sector: updatedSector,
        discussionReady
      };
    } catch (error) {
      console.error(`[SystemOrchestrator] Error in tickSector for sector ${sectorId}:`, error);
      // Re-throw to allow caller to handle, but log the error
      throw error;
    }
  }
}

module.exports = SystemOrchestrator;

