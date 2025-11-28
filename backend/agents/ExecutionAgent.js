/**
 * ExecutionAgent - Executes final decisions from ManagerAgent
 * 
 * This agent:
 * 1. Receives final decision from ManagerAgent
 * 2. Validates decision with simulation/rules.js
 * 3. Sends trade to simulation/execution.js via SimulationEngine
 * 4. If successful: logs simulated trade to contract via /api/mnee/log-trade
 * 5. If failed: returns REJECTED reason
 */

const { validateTrade } = require('../simulation/rules');
const { getSimulationEngine } = require('../simulation/SimulationEngine');
const { registry } = require('../utils/contract');
const { readDataFile, writeDataFile } = require('../utils/persistence');
const { v4: uuidv4 } = require('uuid');

const EXECUTION_LOGS_FILE = 'executionLogs.json';

/**
 * ExecutionAgent class
 */
class ExecutionAgent {
  /**
   * Creates a new ExecutionAgent instance
   * @param {string} sectorId - The sector ID this execution agent handles
   */
  constructor(sectorId) {
    this.sectorId = sectorId;
  }

  /**
   * Execute a final decision from ManagerAgent
   * @param {Object} decision - Final decision from ManagerAgent
   * @param {string} decision.action - 'BUY' | 'SELL' | 'HOLD' | 'NEEDS_REVIEW'
   * @param {number} decision.confidence - Confidence level (0-1)
   * @param {string} decision.reason - Reason for the decision
   * @param {Object} options - Optional configuration
   * @param {number} options.quantity - Trade quantity (default: calculated from confidence)
   * @param {string} options.agentId - Agent ID making the trade (default: 'manager')
   * @param {number} options.price - Price for limit orders (optional)
   * @param {string} options.type - Order type: 'market' | 'limit' (default: 'market')
   * @returns {Promise<Object>} Execution result
   */
  async execute(decision, options = {}) {
    const timestamp = Date.now();
    const executionId = uuidv4();

    // Log execution attempt
    await this.logExecution({
      id: executionId,
      sectorId: this.sectorId,
      timestamp,
      decision,
      status: 'PENDING',
      options
    });

    try {
      // Step 1: Validate decision format
      if (!decision || typeof decision !== 'object') {
        throw new Error('Invalid decision: must be an object');
      }

      // Step 2: Check if action is executable (not HOLD or NEEDS_REVIEW)
      if (decision.action === 'HOLD' || decision.action === 'NEEDS_REVIEW') {
        const result = {
          success: false,
          status: 'REJECTED',
          reason: `Action ${decision.action} is not executable`,
          executionId,
          timestamp
        };
        await this.logExecution({
          id: executionId,
          sectorId: this.sectorId,
          timestamp,
          decision,
          status: 'REJECTED',
          reason: result.reason
        });
        return result;
      }

      // Step 3: Prepare trade decision for execution
      const quantity = options.quantity || this.calculateQuantity(decision.confidence);
      const agentId = options.agentId || 'manager';
      const tradeDecision = {
        action: decision.action,
        quantity,
        agentId,
        confidence: decision.confidence,
        price: options.price,
        type: options.type || 'market',
        riskScore: decision.riskScore,
        leverage: options.leverage || 1.0
      };

      // Step 4: Validate trade with rules
      const validation = await validateTrade(this.sectorId, {
        quantity: tradeDecision.quantity,
        assetId: this.sectorId,
        sectorId: this.sectorId,
        leverage: tradeDecision.leverage
      });

      if (!validation.valid) {
        const reason = `Trade validation failed: ${validation.errors.join(', ')}`;
        const result = {
          success: false,
          status: 'REJECTED',
          reason,
          validationErrors: validation.errors,
          executionId,
          timestamp
        };
        await this.logExecution({
          id: executionId,
          sectorId: this.sectorId,
          timestamp,
          decision,
          tradeDecision,
          status: 'REJECTED',
          reason,
          validationErrors: validation.errors
        });
        return result;
      }

      // Step 5: Get simulation engine and execute trade
      const simulationEngine = getSimulationEngine();
      
      // Ensure sector is initialized
      const sectorState = simulationEngine.getSectorState(this.sectorId);
      if (!sectorState) {
        // Initialize sector if not already initialized
        await simulationEngine.initializeSector(this.sectorId, 100, 0.02);
      }

      const executionEngine = simulationEngine.getSectorState(this.sectorId).executionEngine;

      // Step 6: Execute the trade
      let executionResult;
      try {
        executionResult = await executionEngine.executeDecision(tradeDecision);
      } catch (error) {
        const reason = `Execution failed: ${error.message}`;
        const result = {
          success: false,
          status: 'REJECTED',
          reason,
          executionId,
          timestamp
        };
        await this.logExecution({
          id: executionId,
          sectorId: this.sectorId,
          timestamp,
          decision,
          tradeDecision,
          status: 'REJECTED',
          reason
        });
        return result;
      }

      // Step 7: If successful, log trade to contract
      if (executionResult.success && executionResult.trades && executionResult.trades.length > 0) {
        // Log each executed trade to the contract
        for (const trade of executionResult.trades) {
          try {
            await this.logTradeToContract({
              id: trade.id,
              agentId: tradeDecision.agentId,
              sectorId: this.sectorId,
              action: tradeDecision.action,
              amount: trade.quantity
            });
          } catch (contractError) {
            // Log contract error but don't fail the execution
            console.error(`Failed to log trade to contract: ${contractError.message}`);
            await this.logExecution({
              id: executionId,
              sectorId: this.sectorId,
              timestamp,
              decision,
              tradeDecision,
              status: 'EXECUTED_WITH_WARNING',
              reason: `Trade executed but contract logging failed: ${contractError.message}`,
              executionResult
            });
          }
        }
      }

      // Step 8: Log successful execution
      const result = {
        success: true,
        status: 'EXECUTED',
        executionId,
        timestamp,
        executionResult
      };

      await this.logExecution({
        id: executionId,
        sectorId: this.sectorId,
        timestamp,
        decision,
        tradeDecision,
        status: 'EXECUTED',
        executionResult
      });

      return result;
    } catch (error) {
      // Log error
      const result = {
        success: false,
        status: 'ERROR',
        reason: error.message,
        executionId,
        timestamp
      };

      await this.logExecution({
        id: executionId,
        sectorId: this.sectorId,
        timestamp,
        decision,
        status: 'ERROR',
        reason: error.message,
        error: error.stack
      });

      return result;
    }
  }

  /**
   * Calculate trade quantity based on confidence
   * @param {number} confidence - Confidence level (0-1)
   * @returns {number} Trade quantity
   */
  calculateQuantity(confidence) {
    // Base quantity of 1000, scaled by confidence
    // Higher confidence = larger position
    const baseQuantity = 1000;
    const minQuantity = 100;
    const maxQuantity = 10000;
    
    const quantity = Math.floor(baseQuantity * confidence);
    return Math.max(minQuantity, Math.min(maxQuantity, quantity));
  }

  /**
   * Log trade to blockchain contract
   * @param {Object} tradeData - Trade data
   * @param {string} tradeData.id - Trade ID (UUID or numeric string)
   * @param {string} tradeData.agentId - Agent ID (UUID or numeric string)
   * @param {string} tradeData.sectorId - Sector ID (UUID or numeric string)
   * @param {string} tradeData.action - Action (BUY/SELL)
   * @param {number} tradeData.amount - Trade amount
   */
  async logTradeToContract(tradeData) {
    if (!registry) {
      throw new Error('Contract not initialized. Check MAX_REGISTRY environment variable.');
    }

    // Convert IDs to numeric format (parseInt handles both numeric strings and UUIDs)
    // For UUIDs, parseInt will extract leading numeric part or use 0
    // For numeric strings, parseInt will work correctly
    const tradeId = parseInt(tradeData.id) || this.hashStringToNumber(tradeData.id);
    const agentId = parseInt(tradeData.agentId) || this.hashStringToNumber(tradeData.agentId);
    const sectorId = parseInt(tradeData.sectorId) || this.hashStringToNumber(tradeData.sectorId);
    const amount = BigInt(Math.floor(tradeData.amount));

    await registry.write.logTrade([
      BigInt(tradeId),
      BigInt(agentId),
      BigInt(sectorId),
      tradeData.action,
      amount
    ]);
  }

  /**
   * Convert a string to a numeric hash (simple hash function)
   * @param {string} str - String to hash
   * @returns {number} Numeric hash
   */
  hashStringToNumber(str) {
    let hash = 0;
    for (let i = 0; i < str.length; i++) {
      const char = str.charCodeAt(i);
      hash = ((hash << 5) - hash) + char;
      hash = hash & hash; // Convert to 32-bit integer
    }
    return Math.abs(hash);
  }

  /**
   * Log execution to executionLogs.json
   * @param {Object} logEntry - Log entry data
   */
  async logExecution(logEntry) {
    try {
      let logs = [];
      try {
        const data = await readDataFile(EXECUTION_LOGS_FILE);
        logs = Array.isArray(data) ? data : [];
      } catch (error) {
        if (error.code !== 'ENOENT') {
          throw error;
        }
      }

      logs.push(logEntry);

      // Keep only last 1000 logs
      if (logs.length > 1000) {
        logs = logs.slice(-1000);
      }

      await writeDataFile(EXECUTION_LOGS_FILE, logs);
    } catch (error) {
      console.error(`Failed to log execution: ${error.message}`);
      // Don't throw - logging failure shouldn't break execution
    }
  }

  /**
   * Get execution logs for this sector
   * @param {number} limit - Maximum number of logs to return
   * @returns {Promise<Array>} Array of execution logs
   */
  async getExecutionLogs(limit = 100) {
    try {
      const logs = await readDataFile(EXECUTION_LOGS_FILE);
      const allLogs = Array.isArray(logs) ? logs : [];
      
      // Filter by sector and sort by timestamp (newest first)
      const sectorLogs = allLogs
        .filter(log => log.sectorId === this.sectorId)
        .sort((a, b) => (b.timestamp || 0) - (a.timestamp || 0))
        .slice(0, limit);

      return sectorLogs;
    } catch (error) {
      if (error.code === 'ENOENT') {
        return [];
      }
      throw error;
    }
  }
}

module.exports = ExecutionAgent;

