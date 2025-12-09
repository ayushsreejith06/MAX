const SectorEngine = require('../../SectorEngine');
const ManagerEngine = require('../../ManagerEngine');
const DiscussionEngine = require('../../DiscussionEngine');
const ConfidenceEngine = require('../../ConfidenceEngine');
const { getSectorById, updateSector } = require('../../../utils/sectorStorage');
const { getAllSectors } = require('../../../utils/sectorStorage');
const { loadAgents } = require('../../../utils/agentStorage');
const { loadDiscussions, findDiscussionById } = require('../../../utils/discussionStorage');
const DiscussionRoom = require('../../../models/DiscussionRoom');
const { getSystemMode } = require('../../SystemMode');
const { executeSimulationTick } = require('../../../controllers/simulationController');

// Maximum number of rounds for a discussion
const MAX_ROUNDS = 5;

// Tick interval in milliseconds (2 seconds)
const TICK_INTERVAL_MS = 2000;

/**
 * SystemOrchestrator - Coordinates system-level operations across sectors
 */
class SystemOrchestrator {
  constructor() {
    this.sectorEngine = new SectorEngine();
    this.managerEngine = new ManagerEngine();
    this.discussionEngine = new DiscussionEngine();
    this.confidenceEngine = new ConfidenceEngine();
    this.tickCounter = 0;
    this.tickInterval = null;
    this.isTicking = false; // Prevent concurrent ticks
  }

  /**
   * Tick a sector: update agent confidence, manage discussions, and run rounds
   * @param {string} sectorId - Sector ID to tick
   * @returns {Promise<{sector: Object, discussionReady: boolean}>} Updated sector and discussion ready flag
   */
  async tickSector(sectorId) {
    if (!sectorId) {
      throw new Error('sectorId is required');
    }

    try {
      // 1. Load sector + agents
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

      // 2. Run ConfidenceEngine.tickConfidenceUpdates()
      // Using SectorEngine.performConfidenceUpdates which internally uses ConfidenceEngine
      let updatedSector = await this.sectorEngine.performConfidenceUpdates(sector);

      // 3. Check if confidence threshold met and no active discussion
      const discussionReady = this.sectorEngine.getDiscussionReadyFlag(updatedSector);
      let hasActiveDiscussion = await this._hasActiveDiscussion(sectorId);

      if (discussionReady && !hasActiveDiscussion) {
        console.log(`[SystemOrchestrator] Sector ${sectorId} ready for discussion, creating...`);
        
        // Step 1: Create discussion
        const createResult = await this.managerEngine.createDiscussion(sectorId);
        if (createResult.created && createResult.discussion) {
          const newDiscussion = createResult.discussion;
          console.log(`[SystemOrchestrator] Created discussion: ID = ${newDiscussion.id}`);
          
          // Reload sector to get updated discussion reference
          updatedSector = await getSectorById(sectorId);
          const allAgents = await loadAgents();
          const sectorAgents = allAgents.filter(agent => agent.sectorId === sectorId);
          updatedSector.agents = sectorAgents;
          
          // Step 2: Immediately start all rounds (runs automatically)
          console.log(`[SystemOrchestrator] Starting rounds for discussion ${newDiscussion.id}`);
          await this.discussionEngine.startRounds(newDiscussion.id, MAX_ROUNDS);
          
          // Step 3: Finalize checklist after rounds complete
          console.log(`[SystemOrchestrator] Finalizing checklist for discussion ${newDiscussion.id}`);
          await this.discussionEngine.finalizeChecklist(newDiscussion.id);
          
          // Step 4: Handle checklist (approve and mark as finalized)
          console.log(`[SystemOrchestrator] Handling checklist for discussion ${newDiscussion.id}`);
          await this.managerEngine.handleChecklist(newDiscussion);
          
          // Reload sector after full cycle
          updatedSector = await getSectorById(sectorId);
          const reloadedAgents = await loadAgents();
          const reloadedSectorAgents = reloadedAgents.filter(agent => agent.sectorId === sectorId);
          updatedSector.agents = reloadedSectorAgents;
          
          // Update hasActiveDiscussion flag - discussion is now finalized
          hasActiveDiscussion = false;
        } else if (createResult.discussion) {
          // Discussion already exists (shouldn't happen due to check, but handle gracefully)
          console.log(`[SystemOrchestrator] Discussion already exists: ID = ${createResult.discussion.id}`);
          hasActiveDiscussion = true;
        }
      }

      // 5. Check for discussions that are in progress but not yet finalized
      // (This handles edge cases where a discussion was created but the cycle didn't complete)
      if (hasActiveDiscussion) {
        const activeDiscussion = await this._getActiveDiscussion(sectorId);
        if (activeDiscussion) {
          const discussionRoom = DiscussionRoom.fromData(activeDiscussion);
          
          // If discussion is in_progress with checklistDraft, handle it
          if (discussionRoom.status === 'in_progress' && 
              Array.isArray(discussionRoom.checklistDraft) && 
              discussionRoom.checklistDraft.length > 0) {
            console.log(`[SystemOrchestrator] Found in-progress discussion with checklistDraft, handling...`);
            await this.managerEngine.handleChecklist(discussionRoom);
            
            // Reload sector
            updatedSector = await getSectorById(sectorId);
            const allAgents = await loadAgents();
            const sectorAgents = allAgents.filter(agent => agent.sectorId === sectorId);
            updatedSector.agents = sectorAgents;
          }
        }
      }

      // 5. Save updated sector state
      await updateSector(sectorId, {
        agents: updatedSector.agents,
        discussions: updatedSector.discussions
      });

      // 6. Return updated sector + discussionReady boolean
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

  /**
   * Check if there's an active discussion for a sector
   * @private
   */
  async _hasActiveDiscussion(sectorId) {
    try {
      const discussions = await loadDiscussions();
      return discussions.some(d => 
        d.sectorId === sectorId && 
        (d.status === 'open' || d.status === 'created' || d.status === 'in_progress' || d.status === 'active')
      );
    } catch (error) {
      console.error(`[SystemOrchestrator] Error checking active discussion:`, error);
      return false;
    }
  }

  /**
   * Get the active discussion for a sector
   * @private
   */
  async _getActiveDiscussion(sectorId) {
    try {
      const discussions = await loadDiscussions();
      return discussions.find(d => 
        d.sectorId === sectorId && 
        (d.status === 'open' || d.status === 'created' || d.status === 'in_progress' || d.status === 'active')
      ) || null;
    } catch (error) {
      console.error(`[SystemOrchestrator] Error getting active discussion:`, error);
      return null;
    }
  }

  /**
   * Tick all sectors automatically
   * This is called every 2 seconds and handles:
   * - Confidence updates (always)
   * - Discussion management (always)
   * - Price simulation (only in simulation mode)
   * @private
   */
  async _tickAllSectors() {
    // Prevent concurrent ticks
    if (this.isTicking) {
      console.log('[SystemOrchestrator] Tick already in progress, skipping...');
      return;
    }

    this.isTicking = true;

    try {
      // Get all sectors
      const sectors = await getAllSectors();
      
      if (sectors.length === 0) {
        // No sectors to tick, skip silently
        return;
      }

      const systemMode = getSystemMode();
      const isSimulationMode = systemMode.isSimulationMode();

      // Tick each sector
      for (const sector of sectors) {
        if (!sector || !sector.id) {
          continue;
        }

        try {
          // Always run orchestrator tick (confidence + discussions)
          await this.tickSector(sector.id);

          // Only run simulation tick (price updates) if in simulation mode
          if (isSimulationMode) {
            try {
              await executeSimulationTick(sector.id);
            } catch (simError) {
              // Log but don't throw - allow orchestrator tick to succeed even if simulation fails
              console.error(`[SystemOrchestrator] Simulation tick failed for sector ${sector.id}:`, simError.message);
            }
          }
        } catch (error) {
          // Log error but continue with other sectors
          console.error(`[SystemOrchestrator] Error ticking sector ${sector.id}:`, error.message);
        }
      }
    } catch (error) {
      console.error('[SystemOrchestrator] Error in _tickAllSectors:', error);
    } finally {
      this.isTicking = false;
    }
  }

  /**
   * Start automatic ticking (every 2 seconds)
   */
  start() {
    if (this.tickInterval) {
      console.log('[SystemOrchestrator] Already started');
      return;
    }

    console.log('[SystemOrchestrator] Starting automatic ticks (every 2 seconds)');
    
    // Run first tick immediately
    this._tickAllSectors().catch(err => {
      console.error('[SystemOrchestrator] Error in initial tick:', err);
    });

    // Then run every 2 seconds
    this.tickInterval = setInterval(() => {
      this._tickAllSectors().catch(err => {
        console.error('[SystemOrchestrator] Error in scheduled tick:', err);
      });
    }, TICK_INTERVAL_MS);
  }

  /**
   * Stop automatic ticking
   */
  stop() {
    if (this.tickInterval) {
      clearInterval(this.tickInterval);
      this.tickInterval = null;
      console.log('[SystemOrchestrator] Stopped automatic ticks');
    }
  }
}

module.exports = SystemOrchestrator;

