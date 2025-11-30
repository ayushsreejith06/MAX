/**
 * ManagerAgent - Base class for sector manager agents
 * 
 * Provides decision-making, sector awareness, cross-sector communication,
 * and tick-based decision loops for managing sector operations.
 * 
 * Extends BaseAgent to inherit memory and reasoning capabilities.
 */

const BaseAgent = require('../base/BaseAgent');
const { vote } = require('../../manager/voting');
const { aggregateConfidenceForAction } = require('../../manager/confidence');
const { detectConflict, resolveConflict } = require('../../manager/conflict');
const { loadAgents, saveAgents } = require('../../utils/agentStorage');
const { loadSectors, getSectorById } = require('../../utils/storage');
const { publish, drain } = require('../comms/MessageBus');
const { rewardForProfit, penalizeForLoss } = require('../morale');
const { ResearchAgent } = require('../research');

/**
 * ManagerAgent class - extends BaseAgent
 */
class ManagerAgent extends BaseAgent {
  /**
   * Creates a new ManagerAgent instance
   * @param {Object} config - Configuration object
   * @param {string} config.id - Manager agent ID
   * @param {string} config.sectorId - Sector ID this manager oversees
   * @param {string} config.name - Manager name
   * @param {Object} config.personality - Personality configuration
   * @param {Object} config.runtimeConfig - Runtime configuration
   */
  constructor({ id, sectorId, name, personality = {}, performance = {}, memory = [], runtimeConfig = {} }) {
    if (!id) throw new Error('Manager agent ID is required');
    if (!sectorId) throw new Error('Sector ID is required');
    if (!name) throw new Error('Manager name is required');

    // Initialize BaseAgent with memory from stored data
    super({
      id,
      name,
      role: 'manager',
      personality,
      performance,
      memory
    });

    this.sectorId = sectorId;
    this.runtimeConfig = {
      tickInterval: runtimeConfig.tickInterval || 3000, // 3 seconds default
      conflictThreshold: runtimeConfig.conflictThreshold || 0.5,
      ...runtimeConfig
    };

    // Manager-specific state (extends BaseAgent state)
    this.state = {
      ...this.state, // Inherit from BaseAgent
      memory: this.memory, // Use BaseAgent memory
      lastTick: null,
      metrics: {
        ...this.state.metrics,
        decisionCount: 0,
        lastDecisionTimestamp: null,
        averageConfidence: 0
      }
    };

    // Manager-specific properties
    this.lastDecisionTimestamp = null;
    this.sectorCache = null; // Cached sector data
    this.msgQueue = []; // Incoming message queue
    this.decisionHistory = []; // Past decisions

    // Morale tracking
    this.lastDecisionPrice = null; // Price when last decision was made
    this.lastDecisionAction = null; // Action of last decision (BUY/SELL/HOLD)
    this.consecutiveWins = 0; // Count of consecutive successful decisions

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
   * Send a cross-sector message
   * @param {Object} message - Message object
   * @param {string} message.to - Target manager ID or 'broadcast'
   * @param {string} message.type - Message type
   * @param {Object} message.payload - Message payload
   * @returns {Promise<void>}
   */
  async sendCrossSectorMessage(message) {
    try {
      await publish({
        from: this.id,
        to: message.to || 'broadcast',
        type: message.type || 'signal',
        payload: message.payload || {}
      });
    } catch (error) {
      console.error(`[ManagerAgent ${this.id}] Error sending cross-sector message:`, error);
    }
  }

  /**
   * Receive messages from the message bus
   * @returns {Promise<Array>} Array of received messages
   */
  async receiveMessages() {
    return this.getCrossSectorSignals();
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

    // If no signals provided, try to get them from sector agents
    if (!signals || signals.length === 0) {
      try {
        const agents = await loadAgents();
        const sectorAgents = agents.filter(a => a.sectorId === this.sectorId && a.role !== 'manager');
        
        if (sectorAgents.length === 0) {
          return {
            action: 'HOLD',
            confidence: 0,
            reason: 'No other agents in sector to provide signals. Create trader/analyst agents for the manager to make decisions.',
            voteBreakdown: { BUY: 0, SELL: 0, HOLD: 0 },
            conflictScore: 0,
            timestamp: Date.now()
          };
        }
        
        // Generate placeholder signals from sector agents
        sectorAgents.forEach(agent => {
          signals.push({
            action: 'HOLD',
            confidence: 0.5,
            agentId: agent.id
          });
        });
      } catch (error) {
        console.warn(`[ManagerAgent ${this.id}] Error loading agents for signals:`, error.message);
      }
    }

    // Get cross-sector signals
    const crossSignals = await this.getCrossSectorSignals();

    // If no signals provided, try to get from sector agents
    if (!signals || signals.length === 0) {
      try {
        const agents = await loadAgents();
        const sectorAgents = agents.filter(a => a.sectorId === this.sectorId && a.role !== 'manager');
        
        // Collect actual signals from agents
        for (const agent of sectorAgents) {
          try {
            // Special handling for research agents
            if (agent.role === 'research') {
              try {
                // Instantiate ResearchAgent from stored agent data
                const researchAgent = new ResearchAgent({
                  id: agent.id,
                  name: agent.name,
                  sectorId: agent.sectorId,
                  personality: agent.personality || {},
                  performance: agent.performance || {}
                });

                // Get research signal
                const signal = await researchAgent.getSignal();
                if (signal && signal.action) {
                  signals.push({
                    action: signal.action,
                    confidence: signal.confidence || 0.5,
                    agentId: agent.id,
                    type: signal.type || 'research',
                    rationale: signal.rationale,
                    metadata: signal.metadata,
                    timestamp: Date.now()
                  });
                  continue;
                }
              } catch (researchError) {
                console.warn(`[ManagerAgent ${this.id}] Error getting research signal from ${agent.id}:`, researchError.message);
                // Fall through to placeholder signal generation
              }
            }

            // For other agent types, generate placeholder signals based on agent state
            // (This can be enhanced when other agent types implement getSignal methods)
            const winRate = agent.performance?.winRate || 0.5;
            const riskTolerance = agent.personality?.riskTolerance || 'medium';
            
            let action = 'HOLD';
            let confidence = 0.5;
            
            if (winRate > 0.6) {
              confidence = 0.6 + (winRate - 0.6) * 0.4;
              if (riskTolerance === 'high') {
                action = Math.random() > 0.5 ? 'BUY' : 'SELL';
              }
            } else if (winRate < 0.4) {
              confidence = 0.3 + winRate * 0.4;
              action = 'HOLD';
            }

            signals.push({
              action,
              confidence: Math.max(0, Math.min(1, confidence)),
              agentId: agent.id,
              timestamp: Date.now()
            });
          } catch (error) {
            console.warn(`[ManagerAgent ${this.id}] Error getting signal from agent ${agent.id}:`, error.message);
            // Add a default HOLD signal if agent signal collection fails
            signals.push({
              action: 'HOLD',
              confidence: 0.5,
              agentId: agent.id,
              timestamp: Date.now()
            });
          }
        }
      } catch (error) {
        console.warn(`[ManagerAgent ${this.id}] Failed to load agents:`, error.message);
      }
    }

    if (!Array.isArray(signals) || signals.length === 0) {
      return {
        action: 'HOLD',
        confidence: 0,
        rationale: 'No agent signals available'
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
        rationale: `Voting failed: ${error.message}`
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
      const decision = {
        action: 'NEEDS_REVIEW',
        confidence: finalConfidence,
        rationale: `High conflict detected (score: ${conflictResult.conflictScore.toFixed(2)}). Manual review required.`,
        conflictScore: conflictResult.conflictScore,
        voteBreakdown: votingResult.votes,
        suggestedAction: finalAction,
        timestamp: Date.now()
      };

      // Store reasoning
      this.storeReasoning(Date.now(), decision.rationale, { decision, signals: enrichedSignals });
      
      return decision;
    }

    // Store decision in history
    const decision = {
      action: finalAction,
      confidence: finalConfidence,
      rationale: reason,
      reason: reason, // Keep both for backward compatibility
      voteBreakdown: votingResult.votes,
      conflictScore: conflictResult.conflictScore,
      timestamp: Date.now()
    };

    this.decisionHistory.push(decision);
    this.lastDecisionTimestamp = Date.now();
    this.updateLastTick(Date.now());
    this.updateMetrics({
      decisionCount: this.decisionHistory.length,
      lastDecisionTimestamp: Date.now(),
      averageConfidence: this.decisionHistory.reduce((sum, d) => sum + (d.confidence || 0), 0) / this.decisionHistory.length
    });

    // Store reasoning in memory
    this.storeReasoning(Date.now(), reason, { decision, signals: enrichedSignals });

    // Store decision in memory as well
    this.updateMemory({
      timestamp: Date.now(),
      type: 'decision',
      reasoning: reason,
      data: {
        action: decision.action,
        confidence: decision.confidence,
        voteBreakdown: decision.voteBreakdown,
        conflictScore: decision.conflictScore
      }
    });

    // Persist memory and decision to storage
    await this.persistMemoryAndDecision(decision);

    // Keep only last 100 decisions
    if (this.decisionHistory.length > 100) {
      this.decisionHistory.shift();
    }

    return decision;
  }

  /**
   * Evaluate previous decision outcome and update morale
   * @param {number} currentPrice - Current sector price
   * @returns {Promise<void>}
   */
  async evaluatePreviousDecision(currentPrice) {
    // Skip if no previous decision to evaluate
    if (this.lastDecisionPrice === null || this.lastDecisionAction === null) {
      return;
    }

    // Skip HOLD decisions (no clear win/loss)
    if (this.lastDecisionAction === 'HOLD') {
      return;
    }

    const priceChange = currentPrice - this.lastDecisionPrice;
    const priceChangePercent = this.lastDecisionPrice > 0 
      ? (priceChange / this.lastDecisionPrice) * 100 
      : 0;

    let isGoodDecision = false;

    // Evaluate decision quality based on action and price movement
    if (this.lastDecisionAction === 'BUY' && priceChangePercent > 0) {
      // Bought and price went up - good decision
      isGoodDecision = true;
    } else if (this.lastDecisionAction === 'SELL' && priceChangePercent < 0) {
      // Sold and price went down - good decision
      isGoodDecision = true;
    } else if (this.lastDecisionAction === 'BUY' && priceChangePercent < 0) {
      // Bought and price went down - bad decision
      isGoodDecision = false;
    } else if (this.lastDecisionAction === 'SELL' && priceChangePercent > 0) {
      // Sold and price went up - bad decision
      isGoodDecision = false;
    }

    // Update morale based on decision outcome
    try {
      if (isGoodDecision) {
        // Good decision: reward agent
        this.consecutiveWins += 1;
        
        // Calculate bonus multiplier for consecutive wins (1.0x, 1.2x, 1.5x, 2.0x max)
        const multiplier = Math.min(2.0, 1.0 + (this.consecutiveWins - 1) * 0.2);
        
        // Reward based on price change magnitude (1-5 points, with multiplier)
        const rewardAmount = Math.min(5, Math.max(1, Math.abs(priceChangePercent) / 2));
        await rewardForProfit(this.id, rewardAmount, multiplier);
        
        console.log(`[ManagerAgent ${this.id}] Good decision! Morale +${Math.floor(rewardAmount * multiplier)} (${this.consecutiveWins} consecutive wins)`);
      } else {
        // Bad decision: penalize agent
        this.consecutiveWins = 0; // Reset consecutive wins
        
        // Penalize based on price change magnitude (1-10 points)
        const penaltyAmount = Math.min(10, Math.max(1, Math.abs(priceChangePercent) / 2));
        await penalizeForLoss(this.id, penaltyAmount);
        
        console.log(`[ManagerAgent ${this.id}] Bad decision. Morale -${penaltyAmount}`);
      }
    } catch (error) {
      console.error(`[ManagerAgent ${this.id}] Error updating morale:`, error);
    }
  }

  /**
   * Main decision loop (tick method)
   * Called periodically by the runtime
   * @returns {Promise<Object|null>} Decision object or null if no decision made
   */
  async tick() {
    try {
      const tickTimestamp = Date.now();
      this.updateLastTick(tickTimestamp);

      // Refresh sector cache periodically
      if (!this.sectorCache || Math.random() < 0.1) { // 10% chance to refresh
        await this.loadSector();
      }

      // Evaluate previous decision outcome before making new decision
      if (this.sectorCache && this.sectorCache.currentPrice) {
        await this.evaluatePreviousDecision(this.sectorCache.currentPrice);
      }

      // Make decision (decide() will collect signals from agents if not provided)
      const decision = await this.decide([]);

      // Store decision info for next evaluation
      if (this.sectorCache && this.sectorCache.currentPrice) {
        this.lastDecisionPrice = this.sectorCache.currentPrice;
        this.lastDecisionAction = decision.action;
      }

      // Update memory with observation (using BaseAgent method)
      this.updateMemory({
        timestamp: tickTimestamp,
        type: 'observation',
        sectorId: this.sectorId,
        decision,
        sectorData: this.sectorCache ? {
          id: this.sectorCache.id,
          sectorName: this.sectorCache.sectorName || this.sectorCache.name,
          currentPrice: this.sectorCache.currentPrice
        } : null
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
    return this.sendCrossSectorMessage({
      to: signal.target || 'broadcast',
      type: signal.type || 'signal',
      payload: signal.payload || {}
    });
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
   * Persist memory and last decision to storage
   * @param {Object} decision - Decision object
   * @returns {Promise<void>}
   */
  async persistMemoryAndDecision(decision) {
    try {
      const agents = await loadAgents();
      const agentIndex = agents.findIndex(a => a.id === this.id);
      
      if (agentIndex >= 0) {
        // Update agent with memory and decision
        agents[agentIndex] = {
          ...agents[agentIndex],
          memory: this.memory, // Persist memory array
          lastDecision: decision, // Store last decision
          lastDecisionAt: decision.timestamp || Date.now() // Store timestamp
        };
        
        await saveAgents(agents);
      } else {
        console.warn(`[ManagerAgent ${this.id}] Agent not found in storage for memory persistence`);
      }
    } catch (error) {
      console.error(`[ManagerAgent ${this.id}] Error persisting memory and decision:`, error);
      // Don't throw - memory persistence failure shouldn't break decision making
    }
  }

  /**
   * Serialize manager state to JSON-safe representation
   * @returns {Object} Serialized state
   */
  serialize() {
    return {
      ...super.toJSON(),
      sectorId: this.sectorId,
      runtimeConfig: this.runtimeConfig,
      lastDecisionTimestamp: this.lastDecisionTimestamp,
      decisionHistorySize: this.decisionHistory.length,
      msgQueueSize: this.msgQueue.length,
      sectorCache: this.sectorCache ? {
        id: this.sectorCache.id,
        sectorName: this.sectorCache.sectorName || this.sectorCache.name,
        currentPrice: this.sectorCache.currentPrice
      } : null,
      state: this.getState()
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
      memorySize: this.memory.length,
      state: this.getState()
    };
  }
}

module.exports = ManagerAgent;
