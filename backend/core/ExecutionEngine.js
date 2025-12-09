const { getSectorById, updateSector } = require('../utils/sectorStorage');
const { readDataFile, writeDataFile } = require('../utils/persistence');
const { v4: uuidv4 } = require('uuid');

const EXECUTION_LOGS_FILE = 'executionLogs.json';

/**
 * ExecutionEngine - Handles execution of approved checklists
 */
class ExecutionEngine {
  constructor() {
    // ExecutionEngine is a stateless coordinator
  }

  /**
   * Execute a checklist of approved items
   * @param {Array} checklistItems - Array of checklist items with action and amount
   * @param {string} sectorId - Sector ID for execution
   * @param {string} checklistId - Optional checklist ID for logging
   * @returns {Promise<Object>} Execution results with updated sectorState
   */
  async executeChecklist(checklistItems, sectorId, checklistId = null) {
    if (!Array.isArray(checklistItems)) {
      throw new Error('checklistItems must be an array');
    }

    if (!sectorId) {
      throw new Error('sectorId is required');
    }

    // Load sector state
    const sector = await getSectorById(sectorId);
    if (!sector) {
      throw new Error(`Sector ${sectorId} not found`);
    }

    // Initialize sectorState with capital and position
    // Map balance to capital, and track position in performance or as separate field
    const sectorState = {
      id: sector.id,
      capital: typeof sector.balance === 'number' ? sector.balance : 0,
      position: typeof sector.position === 'number' ? sector.position : (sector.performance?.position || 0),
      performance: sector.performance && typeof sector.performance === 'object' ? { ...sector.performance } : {},
      utilization: typeof sector.utilization === 'number' ? sector.utilization : 0,
      currentPrice: typeof sector.currentPrice === 'number' ? sector.currentPrice : 100,
      agents: Array.isArray(sector.agents) ? sector.agents : []
    };

    const tradeResults = [];
    const timestamp = Date.now();

    // Process each checklist item
    for (const item of checklistItems) {
      // Skip items that are not approved
      if (item.status && item.status !== 'approved') {
        console.log(`[ExecutionEngine] Skipping item ${item.id || 'unknown'}: status is ${item.status}`);
        continue;
      }

      // Extract action from item - support multiple formats
      let action = null;
      if (item.action) {
        action = item.action.toLowerCase();
      } else if (item.text) {
        // Extract action from text (e.g., "deploy capital", "buy", "sell")
        const textLower = item.text.toLowerCase();
        if (textLower.includes('buy') || textLower.includes('deploy capital')) {
          action = 'buy';
        } else if (textLower.includes('sell')) {
          action = 'sell';
        } else if (textLower.includes('hold')) {
          action = 'hold';
        } else if (textLower.includes('rebalance')) {
          action = 'rebalance';
        }
      }

      // Extract amount - support multiple formats
      let amount = 0;
      if (typeof item.amount === 'number' && item.amount > 0) {
        amount = item.amount;
      } else if (typeof item.quantity === 'number' && item.quantity > 0) {
        amount = item.quantity;
      } else if (item.confidence && typeof item.confidence === 'number') {
        // Calculate amount from confidence if available (default: 1000 * confidence)
        amount = Math.floor(1000 * item.confidence);
      } else {
        // Default amount if none specified
        amount = 1000;
      }

      if (!action) {
        console.warn(`[ExecutionEngine] Skipping item ${item.id || 'unknown'}: no action specified`);
        tradeResults.push({
          itemId: item.id || null,
          action: null,
          amount: 0,
          success: false,
          reason: 'No action specified'
        });
        continue;
      }

      try {
        switch (action) {
          case 'buy':
            if (amount > 0 && sectorState.capital >= amount) {
              sectorState.capital -= amount;
              sectorState.position += amount;
              tradeResults.push({
                itemId: item.id || null,
                action: 'buy',
                amount: amount,
                success: true,
                reason: 'Buy executed successfully'
              });
            } else {
              tradeResults.push({
                itemId: item.id || null,
                action: 'buy',
                amount: amount,
                success: false,
                reason: amount <= 0 ? 'Invalid amount' : 'Insufficient capital'
              });
            }
            break;

          case 'sell':
            if (amount > 0 && sectorState.position >= amount) {
              sectorState.capital += amount;
              sectorState.position -= amount;
              tradeResults.push({
                itemId: item.id || null,
                action: 'sell',
                amount: amount,
                success: true,
                reason: 'Sell executed successfully'
              });
            } else {
              tradeResults.push({
                itemId: item.id || null,
                action: 'sell',
                amount: amount,
                success: false,
                reason: amount <= 0 ? 'Invalid amount' : 'Insufficient position'
              });
            }
            break;

          case 'hold':
            // Do nothing for hold
            tradeResults.push({
              itemId: item.id || null,
              action: 'hold',
              amount: 0,
              success: true,
              reason: 'Hold action - no changes'
            });
            break;

          case 'rebalance':
            // Rebalance: adjust position to target allocation
            // Target: 50% capital, 50% position (both in same units)
            // This can be enhanced with more sophisticated logic
            const totalValue = sectorState.capital + sectorState.position;
            const targetPosition = totalValue * 0.5; // 50% target
            const currentPosition = sectorState.position;
            const rebalanceAmount = targetPosition - currentPosition;

            if (Math.abs(rebalanceAmount) > 0.01) { // Only rebalance if difference is significant
              if (rebalanceAmount > 0) {
                // Need to buy more - move capital to position
                const buyAmount = Math.min(rebalanceAmount, sectorState.capital);
                if (buyAmount > 0) {
                  sectorState.capital -= buyAmount;
                  sectorState.position += buyAmount;
                }
              } else {
                // Need to sell - move position to capital
                const sellAmount = Math.min(Math.abs(rebalanceAmount), sectorState.position);
                if (sellAmount > 0) {
                  sectorState.capital += sellAmount;
                  sectorState.position -= sellAmount;
                }
              }
            }

            tradeResults.push({
              itemId: item.id || null,
              action: 'rebalance',
              amount: Math.abs(rebalanceAmount),
              success: true,
              reason: 'Rebalance executed successfully'
            });
            break;

          default:
            console.warn(`[ExecutionEngine] Unknown action: ${action} for item ${item.id || 'unknown'}`);
            tradeResults.push({
              itemId: item.id || null,
              action: action,
              amount: amount,
              success: false,
              reason: `Unknown action: ${action}`
            });
        }
      } catch (error) {
        console.error(`[ExecutionEngine] Error processing item ${item.id || 'unknown'}:`, error);
        tradeResults.push({
          itemId: item.id || null,
          action: action,
          amount: amount,
          success: false,
          reason: error.message
        });
      }
    }

    // Recalculate performance
    const previousCapital = typeof sector.balance === 'number' ? sector.balance : 0;
    const previousPosition = typeof sector.position === 'number' ? sector.position : (sector.performance?.position || 0);
    const previousTotalValue = previousCapital + previousPosition;

    const currentTotalValue = sectorState.capital + sectorState.position;
    const pnl = currentTotalValue - previousTotalValue;
    const pnlPercent = previousTotalValue > 0 ? (pnl / previousTotalValue) * 100 : 0;

    sectorState.performance = {
      ...sectorState.performance,
      totalPL: (sectorState.performance.totalPL || 0) + pnl,
      pnl: pnl,
      pnlPercent: pnlPercent,
      position: sectorState.position,
      capital: sectorState.capital,
      totalValue: currentTotalValue,
      lastUpdated: timestamp
    };

    // Recalculate utilization
    // Utilization = (position / total value) * 100
    const totalValue = sectorState.capital + sectorState.position;
    sectorState.utilization = totalValue > 0 
      ? (sectorState.position / totalValue) * 100 
      : 0;

    // Write updated sectorState back to persistent state
    // NOTE: balance is NEVER updated here - it should only be updated via the deposit endpoint
    // We only update position, performance, and utilization which are simulation/execution state
    const updates = {
      position: sectorState.position,
      performance: sectorState.performance,
      utilization: sectorState.utilization
    };

    await updateSector(sectorId, updates);

    // Append execution log entry
    const logEntry = {
      id: uuidv4(),
      sectorId: sectorId,
      checklistId: checklistId || null,
      timestamp: timestamp,
      results: tradeResults
    };

    await this._appendExecutionLog(logEntry);

    // Return success payload
    return {
      success: true,
      updatedSectorState: {
        id: sectorState.id,
        capital: sectorState.capital,
        position: sectorState.position,
        performance: sectorState.performance,
        utilization: sectorState.utilization,
        currentPrice: sectorState.currentPrice
      }
    };
  }

  /**
   * Append execution log entry to execution logs file
   * @private
   */
  async _appendExecutionLog(logEntry) {
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
      console.error(`[ExecutionEngine] Failed to log execution: ${error.message}`);
      // Don't throw - logging failure shouldn't break execution
    }
  }
}

module.exports = ExecutionEngine;

