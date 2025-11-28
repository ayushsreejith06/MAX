/**
 * Agent Runtime - Manages execution of manager agents in tick-based loops
 * 
 * Loads all manager agents, instantiates them, and executes their tick()
 * methods on a regular interval. Persists decisions and handles cross-sector
 * communication.
 */

const { loadAgents } = require('../../utils/agentStorage');
const ManagerAgent = require('../manager/ManagerAgent');

class AgentRuntime {
  constructor() {
    this.managers = new Map(); // Map of managerId -> ManagerAgent instance
    this.tickInterval = null; // setInterval handle
    this.isRunning = false;
    this.tickIntervalMs = 3000; // Default 3 seconds
    this.decisionLog = []; // Log of all decisions
  }

  /**
   * Initialize the runtime by loading all manager agents
   * @returns {Promise<void>}
   */
  async initialize() {
    try {
      const agents = await loadAgents();
      
      // Filter for manager agents (role === 'manager')
      const managerAgents = agents.filter(agent => 
        agent.role === 'manager' || agent.role?.toLowerCase().includes('manager')
      );

      console.log(`[AgentRuntime] Found ${managerAgents.length} manager agents`);

      // Instantiate each manager agent
      for (const agentData of managerAgents) {
        try {
          if (!agentData.sectorId) {
            console.warn(`[AgentRuntime] Skipping manager ${agentData.id} - no sectorId`);
            continue;
          }

          const manager = new ManagerAgent({
            id: agentData.id,
            sectorId: agentData.sectorId,
            name: agentData.name,
            personality: agentData.personality || {},
            runtimeConfig: {
              tickInterval: this.tickIntervalMs,
              conflictThreshold: 0.5
            }
          });

          this.managers.set(agentData.id, manager);
          console.log(`[AgentRuntime] Loaded manager ${agentData.name} (${agentData.id}) for sector ${agentData.sectorId}`);
        } catch (error) {
          console.error(`[AgentRuntime] Error loading manager ${agentData.id}:`, error);
        }
      }

      console.log(`[AgentRuntime] Initialized ${this.managers.size} manager agents`);
    } catch (error) {
      console.error('[AgentRuntime] Error initializing:', error);
      throw error;
    }
  }

  /**
   * Start the tick loop
   * @param {number} intervalMs - Interval in milliseconds (default: 3000)
   * @returns {Promise<void>}
   */
  async start(intervalMs = 3000) {
    if (this.isRunning) {
      console.warn('[AgentRuntime] Already running');
      return;
    }

    this.tickIntervalMs = intervalMs;
    this.isRunning = true;

    console.log(`[AgentRuntime] Starting tick loop with ${intervalMs}ms interval`);

    // Run initial tick
    await this.tick();

    // Set up interval
    this.tickInterval = setInterval(async () => {
      await this.tick();
    }, intervalMs);
  }

  /**
   * Stop the tick loop
   */
  stop() {
    if (this.tickInterval) {
      clearInterval(this.tickInterval);
      this.tickInterval = null;
    }
    this.isRunning = false;
    console.log('[AgentRuntime] Stopped');
  }

  /**
   * Execute one tick for all managers
   * @returns {Promise<Array>} Array of decisions made in this tick
   */
  async tick() {
    const decisions = [];

    for (const [managerId, manager] of this.managers.entries()) {
      try {
        const decision = await manager.tick();
        
        if (decision && decision.action) {
          decisions.push({
            managerId,
            sectorId: manager.sectorId,
            decision,
            timestamp: Date.now()
          });

          // Log decision
          this.logDecision(managerId, manager.sectorId, decision);

          // Broadcast signal if decision is strong enough
          if (decision.confidence >= 0.7 && decision.action !== 'HOLD') {
            await manager.broadcast({
              type: 'signal',
              payload: {
                action: decision.action,
                confidence: decision.confidence,
                sectorId: manager.sectorId
              }
            });
          }
        }
      } catch (error) {
        console.error(`[AgentRuntime] Error in tick for manager ${managerId}:`, error);
      }
    }

    return decisions;
  }

  /**
   * Log a decision
   * @param {string} managerId - Manager ID
   * @param {string} sectorId - Sector ID
   * @param {Object} decision - Decision object
   */
  logDecision(managerId, sectorId, decision) {
    const logEntry = {
      managerId,
      sectorId,
      decision,
      timestamp: Date.now()
    };

    this.decisionLog.push(logEntry);

    // Keep only last 1000 decisions
    if (this.decisionLog.length > 1000) {
      this.decisionLog.shift();
    }
  }

  /**
   * Get all decisions for a sector
   * @param {string} sectorId - Sector ID
   * @returns {Array} Array of decisions
   */
  getDecisionsForSector(sectorId) {
    return this.decisionLog.filter(log => log.sectorId === sectorId);
  }

  /**
   * Get manager by ID
   * @param {string} managerId - Manager ID
   * @returns {ManagerAgent|null} Manager instance or null
   */
  getManager(managerId) {
    return this.managers.get(managerId) || null;
  }

  /**
   * Get manager by sector ID
   * @param {string} sectorId - Sector ID
   * @returns {ManagerAgent|null} Manager instance or null
   */
  getManagerBySector(sectorId) {
    for (const manager of this.managers.values()) {
      if (manager.sectorId === sectorId) {
        return manager;
      }
    }
    return null;
  }

  /**
   * Get all managers
   * @returns {Array<ManagerAgent>} Array of manager instances
   */
  getAllManagers() {
    return Array.from(this.managers.values());
  }

  /**
   * Reload agents from storage (useful when new agents are created)
   * Only loads new manager agents that aren't already in the runtime
   * @returns {Promise<number>} Number of new agents loaded
   */
  async reloadAgents() {
    try {
      const agents = await loadAgents();
      const managerAgents = agents.filter(agent => 
        agent.role === 'manager' || agent.role?.toLowerCase().includes('manager')
      );

      let newAgentsLoaded = 0;

      for (const agentData of managerAgents) {
        // Skip if already loaded
        if (this.managers.has(agentData.id)) {
          continue;
        }

        // Skip if no sectorId
        if (!agentData.sectorId) {
          console.warn(`[AgentRuntime] Skipping manager ${agentData.id} - no sectorId`);
          continue;
        }

        try {
          const manager = new ManagerAgent({
            id: agentData.id,
            sectorId: agentData.sectorId,
            name: agentData.name,
            personality: agentData.personality || {},
            runtimeConfig: {
              tickInterval: this.tickIntervalMs,
              conflictThreshold: 0.5
            }
          });

          this.managers.set(agentData.id, manager);
          newAgentsLoaded++;
          console.log(`[AgentRuntime] Reloaded manager ${agentData.name} (${agentData.id}) for sector ${agentData.sectorId}`);
        } catch (error) {
          console.error(`[AgentRuntime] Error reloading manager ${agentData.id}:`, error);
        }
      }

      if (newAgentsLoaded > 0) {
        console.log(`[AgentRuntime] Reloaded ${newAgentsLoaded} new manager agents`);
      }

      return newAgentsLoaded;
    } catch (error) {
      console.error('[AgentRuntime] Error reloading agents:', error);
      throw error;
    }
  }

  /**
   * Get runtime status
   * @returns {Object} Status object
   */
  getStatus() {
    return {
      isRunning: this.isRunning,
      managerCount: this.managers.size,
      tickIntervalMs: this.tickIntervalMs,
      decisionLogSize: this.decisionLog.length,
      managers: Array.from(this.managers.values()).map(m => m.getSummary())
    };
  }
}

// Singleton instance
let runtimeInstance = null;

/**
 * Get the singleton AgentRuntime instance
 * @returns {AgentRuntime} Runtime instance
 */
function getAgentRuntime() {
  if (!runtimeInstance) {
    runtimeInstance = new AgentRuntime();
  }
  return runtimeInstance;
}

module.exports = {
  AgentRuntime,
  getAgentRuntime
};

