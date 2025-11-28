/**
 * ManagerAgent - Base class for sector manager agents
 * 
 * Provides decision-making, sector awareness, cross-sector communication,
 * and tick-based decision loops for managing sector operations.
 */

const { vote } = require('../../manager/voting');
const { aggregateConfidenceForAction } = require('../../manager/confidence');
const { detectConflict, resolveConflict } = require('../../manager/conflict');
const { loadAgents } = require('../../utils/agentStorage');
const { loadSectors, getSectorById } = require('../../utils/storage');
const { publish, drain } = require('../comms/MessageBus');

/**
 * ManagerAgent class
 */
class ManagerAgent {
  /**
   * Creates a new ManagerAgent instance
   * @param {Object} config - Configuration object
   * @param {string} config.id - Manager agent ID
   * @param {string} config.sectorId - Sector ID this manager oversees
   * @param {string} config.name - Manager name
   * @param {Object} config.personality - Personality configuration
   * @param {Object} config.runtimeConfig - Runtime configuration
   */
  constructor({ id, sectorId, name, personality = {}, runtimeConfig = {} }) {
    if (!id) throw new Error('Manager agent ID is required');
    if (!sectorId) throw new Error('Sector ID is required');
    if (!name) throw new Error('Manager name is required');

    this.id = id;
    this.sectorId = sectorId;
    this.name = name;
    this.personality = {
      riskTolerance: personality.riskTolerance || 'medium',
      decisionStyle: personality.decisionStyle || 'balanced',
      ...personality
    };
    this.runtimeConfig = {
      tickInterval: runtimeConfig.tickInterval || 3000, // 3 seconds default
      conflictThreshold: runtimeConfig.conflictThreshold || 0.5,
      ...runtimeConfig
    };

    // Internal state
    this.lastDecisionTimestamp = null;
    this.memory = []; // Historical observations
    this.sectorCache = null; // Cached sector data
    this.msgQueue = []; // Incoming message queue
    this.decisionHistory = []; // Past decisions

    // Conflict threshold
    this.conflictThreshold = this.runtimeConfig.conflictThreshold;
  }

  /**
   * Load sector data from storage
   * @returns {Promise<Object|null>} Sector data or null if not found
   */
  async loadSector() {
    try {
      const sectors = await loadSectors();
      const sector = sectors.find(s => s.id === this.sectorId);
      
      if (sector) {
        this.sectorCache = sector;
        return sector;
      }
      
      return null;
    } catch (error) {
      console.error(`[ManagerAgent ${this.id}] Error loading sector:`, error);
      return null;
    }
  }

  /**
   * Get cross-sector signals from other managers
   * @returns {Promise<Array>} Array of messages from other managers
   */
  async getCrossSectorSignals() {
    try {
      const messages = await drain(this.id);
      this.msgQueue = messages;
      return messages;
    } catch (error) {
      console.error(`[ManagerAgent ${this.id}] Error getting cross-sector signals:`, error);
      return [];
    }
  }

  /**
   * Make a decision based on agent signals and cross-sector information
   * @param {Array<{action: string, confidence: number, agentId?: string}>} signals - Agent signals
   * @param {Object} options - Optional configuration
   * @returns {Promise<Object>} Decision object {action, confidence, reason}
   */
  async decide(signals = [], options = {}) {
    // Load sector data if not cached
    if (!this.sectorCache) {
      await this.loadSector();
    }

    // Get cross-sector signals
    const crossSignals = await this.getCrossSectorSignals();

    // If no signals provided, try to get from sector agents
    if (!signals || signals.length === 0) {
      try {
        const agents = await loadAgents();
        const sectorAgents = agents.filter(a => a.sectorId === this.sectorId);
        
        // Generate mock signals from agents (can be enhanced with actual agent decision logic)
        signals = sectorAgents.map(agent => ({
          action: 'HOLD',
          confidence: 0.5,
          agentId: agent.id
        }));
      } catch (error) {
        console.warn(`[ManagerAgent ${this.id}] Failed to load agents:`, error.message);
      }
    }

    if (!Array.isArray(signals) || signals.length === 0) {
      return {
        action: 'HOLD',
        confidence: 0,
        reason: 'No agent signals available'
      };
    }

    // Load agents to get win rate data
    let agents = [];
    try {
      agents = await loadAgents();
      if (this.sectorId) {
        agents = agents.filter(agent => agent.sectorId === this.sectorId);
      }
    } catch (error) {
      console.warn(`[ManagerAgent ${this.id}] Failed to load agents for win rate lookup:`, error.message);
    }

    // Enrich signals with agent win rates
    const enrichedSignals = this.enrichSignalsWithAgentData(signals, agents);

    // Apply cross-sector signal influence (if any)
    if (crossSignals.length > 0) {
      // Process cross-sector signals and adjust confidence
      crossSignals.forEach(msg => {
        if (msg.type === 'signal' && msg.payload.action) {
          // Add cross-sector signal as a weighted vote
          enrichedSignals.push({
            action: msg.payload.action,
            confidence: msg.payload.confidence * 0.3, // Weight cross-sector signals lower
            agentId: `cross-sector-${msg.from}`,
            source: 'cross-sector'
          });
        }
      });
    }

    // Step 1: Majority voting
    let votingResult;
    try {
      votingResult = vote(enrichedSignals);
    } catch (error) {
      return {
        action: 'HOLD',
        confidence: 0,
        reason: `Voting failed: ${error.message}`
      };
    }

    // Step 2: Conflict detection
    const conflictThreshold = options.conflictThreshold ?? this.conflictThreshold;
    const conflictResult = detectConflict(enrichedSignals, conflictThreshold);

    // Step 3: Handle conflicts
    let finalAction = votingResult.action;
    let reason = `Majority vote: ${votingResult.votes[finalAction]} agents voted ${finalAction}`;

    if (conflictResult.needsReview) {
      finalAction = resolveConflict(enrichedSignals);
      reason = `Conflict detected (score: ${conflictResult.conflictScore.toFixed(2)}). Resolved using highest win-rate cluster: ${finalAction}`;
    }

    // Step 4: Aggregate confidence for the final action
    const agentWinRates = {};
    agents.forEach(agent => {
      if (agent.id && agent.performance) {
        agentWinRates[agent.id] = agent.performance.winRate || 0;
      }
    });

    const finalConfidence = aggregateConfidenceForAction(
      enrichedSignals,
      finalAction,
      agentWinRates
    );

    // If conflict requires review, return NEEDS_REVIEW
    if (conflictResult.needsReview && conflictResult.conflictScore > 0.7) {
      return {
        action: 'NEEDS_REVIEW',
        confidence: finalConfidence,
        reason: `High conflict detected (score: ${conflictResult.conflictScore.toFixed(2)}). Manual review required.`,
        conflictScore: conflictResult.conflictScore,
        voteBreakdown: votingResult.votes,
        suggestedAction: finalAction
      };
    }

    // Store decision in history
    const decision = {
      action: finalAction,
      confidence: finalConfidence,
      reason: reason,
      voteBreakdown: votingResult.votes,
      conflictScore: conflictResult.conflictScore,
      timestamp: Date.now()
    };

    this.decisionHistory.push(decision);
    this.lastDecisionTimestamp = Date.now();

    // Keep only last 100 decisions
    if (this.decisionHistory.length > 100) {
      this.decisionHistory.shift();
    }

    return decision;
  }

  /**
   * Main decision loop (tick method)
   * Called periodically by the runtime
   * @returns {Promise<Object|null>} Decision object or null if no decision made
   */
  async tick() {
    try {
      // Refresh sector cache periodically
      if (!this.sectorCache || Math.random() < 0.1) { // 10% chance to refresh
        await this.loadSector();
      }

      // Get agent signals (in a real implementation, this would come from sector agents)
      const signals = [];
      
      // Try to get signals from sector agents
      try {
        const agents = await loadAgents();
        const sectorAgents = agents.filter(a => a.sectorId === this.sectorId && a.role !== 'manager');
        
        // For now, generate placeholder signals
        // In a full implementation, agents would provide their signals
        sectorAgents.forEach(agent => {
          signals.push({
            action: 'HOLD',
            confidence: 0.5,
            agentId: agent.id
          });
        });
      } catch (error) {
        console.warn(`[ManagerAgent ${this.id}] Error getting agent signals:`, error.message);
      }

      // Make decision
      const decision = await this.decide(signals);

      // Update memory with observation
      this.updateMemory({
        timestamp: Date.now(),
        sectorId: this.sectorId,
        decision,
        sectorData: this.sectorCache
      });

      return decision;
    } catch (error) {
      console.error(`[ManagerAgent ${this.id}] Error in tick:`, error);
      return null;
    }
  }

  /**
   * Broadcast a signal to other managers
   * @param {Object} signal - Signal to broadcast
   * @param {string} signal.type - Signal type
   * @param {Object} signal.payload - Signal payload
   * @param {string} signal.target - Target manager ID (optional, defaults to 'broadcast')
   * @returns {Promise<void>}
   */
  async broadcast(signal) {
    try {
      await publish({
        from: this.id,
        to: signal.target || 'broadcast',
        type: signal.type || 'signal',
        payload: signal.payload || {}
      });
    } catch (error) {
      console.error(`[ManagerAgent ${this.id}] Error broadcasting:`, error);
    }
  }

  /**
   * Update memory with new observation
   * @param {Object} observation - Observation data
   */
  updateMemory(observation) {
    this.memory.push({
      ...observation,
      timestamp: observation.timestamp || Date.now()
    });

    // Keep only last 1000 observations
    if (this.memory.length > 1000) {
      this.memory.shift();
    }
  }

  /**
   * Enrich signals with agent metadata (win rates)
   * @param {Array} signals - Raw agent signals
   * @param {Array} agents - Array of agent objects
   * @returns {Array} Enriched signals
   */
  enrichSignalsWithAgentData(signals, agents) {
    const agentMap = {};
    agents.forEach(agent => {
      if (agent.id && agent.performance) {
        agentMap[agent.id] = {
          winRate: typeof agent.performance.winRate === 'number' 
            ? agent.performance.winRate 
            : 0
        };
      }
    });

    return signals.map(signal => {
      const enriched = { ...signal };
      if (signal.agentId && agentMap[signal.agentId]) {
        enriched.winRate = agentMap[signal.agentId].winRate;
      }
      return enriched;
    });
  }

  /**
   * Serialize manager state to JSON-safe representation
   * @returns {Object} Serialized state
   */
  serialize() {
    return {
      id: this.id,
      sectorId: this.sectorId,
      name: this.name,
      personality: this.personality,
      runtimeConfig: this.runtimeConfig,
      lastDecisionTimestamp: this.lastDecisionTimestamp,
      memorySize: this.memory.length,
      decisionHistorySize: this.decisionHistory.length,
      msgQueueSize: this.msgQueue.length,
      sectorCache: this.sectorCache ? {
        id: this.sectorCache.id,
        sectorName: this.sectorCache.sectorName,
        currentPrice: this.sectorCache.currentPrice
      } : null
    };
  }

  /**
   * Get summary of manager state
   * @returns {Object} Summary object
   */
  getSummary() {
    return {
      id: this.id,
      sectorId: this.sectorId,
      name: this.name,
      lastDecision: this.decisionHistory.length > 0 
        ? this.decisionHistory[this.decisionHistory.length - 1] 
        : null,
      decisionCount: this.decisionHistory.length,
      memorySize: this.memory.length
    };
  }
}

module.exports = ManagerAgent;
