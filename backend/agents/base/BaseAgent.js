/**
 * BaseAgent - Base class for all agents with memory and reasoning capabilities
 * 
 * Provides common functionality for all agents including:
 * - Memory system for storing observations and reasoning history
 * - Personality traits
 * - Performance tracking
 * - Internal state management
 */

class BaseAgent {
  /**
   * Creates a new BaseAgent instance
   * @param {Object} config - Configuration object
   * @param {string} config.id - Agent ID
   * @param {string} config.name - Agent name
   * @param {string} config.role - Agent role
   * @param {Object} config.personality - Personality configuration
   * @param {Object} config.performance - Performance metrics
   */
  constructor({ id, name, role, personality = {}, performance = {}, memory = [] }) {
    if (!id) throw new Error('Agent ID is required');
    if (!name) throw new Error('Agent name is required');
    if (!role) throw new Error('Agent role is required');

    this.id = id;
    this.name = name;
    this.role = role;
    
    // Personality traits
    this.personality = {
      riskTolerance: personality.riskTolerance || 'medium',
      decisionStyle: personality.decisionStyle || 'balanced',
      ...personality
    };

    // Performance metrics
    this.performance = {
      pnl: performance.pnl || 0,
      winRate: performance.winRate || 0,
      ...performance
    };

    // Memory system - stores reasoning history and observations
    // Load from stored data if provided, otherwise initialize empty
    this.memory = Array.isArray(memory) ? [...memory] : [];

    // Internal state
    this.state = {
      memory: Array.isArray(memory) ? [...memory] : [],
      lastTick: null,
      metrics: {
        decisionCount: 0,
        lastDecisionTimestamp: null,
        averageConfidence: 0
      }
    };
  }

  /**
   * Update memory with new observation or reasoning
   * @param {Object} entry - Memory entry
   * @param {number} entry.timestamp - Timestamp of the observation
   * @param {string} entry.type - Type of memory entry (e.g., 'observation', 'reasoning', 'decision')
   * @param {Object} entry.data - Memory data
   * @param {string} entry.reasoning - Reasoning text (optional)
   */
  updateMemory(entry) {
    const memoryEntry = {
      timestamp: entry.timestamp || Date.now(),
      type: entry.type || 'observation',
      data: entry.data || {},
      reasoning: entry.reasoning || null,
      ...entry
    };

    this.memory.push(memoryEntry);
    this.state.memory.push(memoryEntry);

    // Keep only last 1000 memory entries
    if (this.memory.length > 1000) {
      this.memory.shift();
      this.state.memory.shift();
    }
  }

  /**
   * Store reasoning for a specific tick
   * @param {number} tickTimestamp - Timestamp of the tick
   * @param {string} reasoning - Reasoning text
   * @param {Object} context - Context data
   */
  storeReasoning(tickTimestamp, reasoning, context = {}) {
    this.updateMemory({
      timestamp: tickTimestamp,
      type: 'reasoning',
      reasoning: reasoning,
      data: {
        tickTimestamp,
        context
      }
    });
  }

  /**
   * Get recent memory entries
   * @param {number} limit - Maximum number of entries to return
   * @param {string} type - Filter by type (optional)
   * @returns {Array} Array of memory entries
   */
  getRecentMemory(limit = 100, type = null) {
    let entries = this.memory;
    
    if (type) {
      entries = entries.filter(entry => entry.type === type);
    }

    return entries.slice(-limit);
  }

  /**
   * Get reasoning history
   * @param {number} limit - Maximum number of entries to return
   * @returns {Array} Array of reasoning entries
   */
  getReasoningHistory(limit = 50) {
    return this.getRecentMemory(limit, 'reasoning');
  }

  /**
   * Update internal state metrics
   * @param {Object} metrics - Metrics to update
   */
  updateMetrics(metrics) {
    this.state.metrics = {
      ...this.state.metrics,
      ...metrics
    };
  }

  /**
   * Update last tick timestamp
   * @param {number} timestamp - Timestamp of the tick
   */
  updateLastTick(timestamp) {
    this.state.lastTick = timestamp;
    this.updateMetrics({
      lastDecisionTimestamp: timestamp
    });
  }

  /**
   * Get agent state summary
   * @returns {Object} State summary
   */
  getState() {
    return {
      ...this.state,
      memorySize: this.memory.length,
      personality: this.personality,
      performance: this.performance
    };
  }

  /**
   * Serialize agent to JSON
   * @returns {Object} Serialized agent
   */
  toJSON() {
    return {
      id: this.id,
      name: this.name,
      role: this.role,
      personality: this.personality,
      performance: this.performance,
      memorySize: this.memory.length,
      state: this.getState()
    };
  }
}

module.exports = BaseAgent;

