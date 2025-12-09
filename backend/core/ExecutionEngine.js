const { getSectorById, updateSector } = require('../utils/sectorStorage');
const { readDataFile, writeDataFile } = require('../utils/persistence');
const { v4: uuidv4 } = require('uuid');
const { findDiscussionById } = require('../utils/discussionStorage');
const { updateAgent } = require('../utils/agentStorage');
const DiscussionRoom = require('../models/DiscussionRoom');

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

    // Check if there are active agents in the sector
    // Price should only update when there are active agents
    const { loadAgents } = require('../utils/agentStorage');
    const allAgents = await loadAgents();
    const sectorAgents = allAgents.filter(agent => agent && agent.sectorId === sectorId);
    const activeAgents = sectorAgents.filter(agent => agent && agent.status === 'active');
    const activeAgentsCount = activeAgents.length;

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
        // Extract action from text (e.g., "deploy capital", "buy", "sell", "deploy", "withdraw", "allocate")
        const textLower = item.text.toLowerCase();
        if (textLower.includes('buy') || textLower.includes('deploy capital') || textLower.includes('deploy')) {
          action = 'buy';
        } else if (textLower.includes('sell') || textLower.includes('withdraw')) {
          action = 'sell';
        } else if (textLower.includes('hold')) {
          action = 'hold';
        } else if (textLower.includes('rebalance') || textLower.includes('allocate')) {
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
              // Update agent rewards for successful execution
              try {
                await this.updateAgentRewards(allAgents, item, checklistId);
              } catch (rewardError) {
                console.warn(`[ExecutionEngine] Failed to update rewards for item ${item.id}: ${rewardError.message}`);
              }
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
              // Update agent rewards for successful execution
              try {
                await this.updateAgentRewards(allAgents, item, checklistId);
              } catch (rewardError) {
                console.warn(`[ExecutionEngine] Failed to update rewards for item ${item.id}: ${rewardError.message}`);
              }
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

    // CRITICAL: Update price ONLY when checklist items are executed AND there are active agents
    // Price should NOT change if there are no active agents in the sector
    // Price changes based on executed actions:
    // - Buy actions increase price (demand increases)
    // - Sell actions decrease price (supply increases)
    // - Change magnitude is proportional to the amount executed relative to total value
    const previousPrice = sector.currentPrice || 100;
    let priceChange = 0;
    let totalExecutedAmount = 0;
    
    // Only update price if there are active agents
    if (activeAgentsCount > 0) {
      // Calculate price impact from executed trades
      for (const result of tradeResults) {
        if (result.success && result.amount > 0) {
          if (result.action === 'buy') {
            // Buy actions increase price (positive impact)
            totalExecutedAmount += result.amount;
            // Price impact: 0.1% per $1000 of buy orders (scaled by total value)
            const impactPercent = (result.amount / Math.max(totalValue, 1000)) * 0.1;
            priceChange += previousPrice * impactPercent;
          } else if (result.action === 'sell') {
            // Sell actions decrease price (negative impact)
            totalExecutedAmount += result.amount;
            // Price impact: -0.1% per $1000 of sell orders (scaled by total value)
            const impactPercent = (result.amount / Math.max(totalValue, 1000)) * 0.1;
            priceChange -= previousPrice * impactPercent;
          }
        }
      }
    } else {
      console.log(`[ExecutionEngine] Skipping price update - no active agents in sector (${activeAgentsCount} active)`);
    }
    
    // Calculate new price (only if priceChange was calculated)
    const newPrice = activeAgentsCount > 0 && priceChange !== 0
      ? Math.max(0.01, previousPrice + priceChange)
      : previousPrice;
    const priceChangePercent = previousPrice > 0 ? ((newPrice - previousPrice) / previousPrice) * 100 : 0;
    
    // Update sectorState with new price
    sectorState.currentPrice = Number(newPrice.toFixed(2));
    
    if (activeAgentsCount > 0 && priceChange !== 0) {
      console.log(`[ExecutionEngine] Price updated after checklist execution: ${previousPrice.toFixed(2)} -> ${newPrice.toFixed(2)} (${priceChangePercent.toFixed(2)}%)`);
    }

    // Write updated sectorState back to persistent state
    // Update balance when checklist items are executed (balance changes only via checklist execution)
    // Balance represents the actual funds available in the sector
    // Price is ONLY updated when checklist items are executed (not in simulation ticks)
    const updates = {
      balance: sectorState.capital, // Update balance to reflect capital changes from checklist execution
      position: sectorState.position,
      performance: sectorState.performance,
      utilization: sectorState.utilization,
      currentPrice: sectorState.currentPrice, // Update price based on executed actions
      change: newPrice - previousPrice,
      changePercent: priceChangePercent,
      lastSimulatedPrice: sectorState.currentPrice // Also update lastSimulatedPrice to match currentPrice
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
   * Interpret a checklist item and return its effect on exposure and manager impact
   * Does NOT update prices - returns effect description for use by updateSimulatedPrice()
   * @param {Object} item - Checklist item with type and amount
   * @param {Object} sector - Sector object
   * @param {Array} agents - Array of agents (for future use)
   * @returns {Object} Object with exposureDelta and managerImpact
   */
  interpretChecklistItem(item, sector, agents = []) {
    if (!item || !sector) {
      throw new Error('item and sector are required');
    }

    // Get current exposure - use sector.exposure if available, otherwise fallback to position or 0
    const currentExposure = typeof sector.exposure === 'number' 
      ? sector.exposure 
      : (typeof sector.position === 'number' ? sector.position : 0);

    // Extract amount from item
    const amount = typeof item.amount === 'number' && item.amount > 0 
      ? item.amount 
      : 0;

    // Normalize item type to uppercase
    const itemType = (item.type || item.action || '').toUpperCase();

    let exposureDelta = 0;
    let managerImpact = 0;

    switch (itemType) {
      case 'BUY':
        // BUY → increase sector.exposure by item.amount and return a positive managerImpact
        exposureDelta = amount;
        // Positive manager impact: 0.1% per $1000 of buy orders (scaled)
        managerImpact = amount > 0 ? (amount / Math.max(currentExposure + amount, 1000)) * 0.1 : 0;
        break;

      case 'SELL':
        // SELL → decrease sector.exposure by item.amount and return a negative managerImpact
        exposureDelta = -Math.min(amount, currentExposure); // Can't sell more than current exposure
        // Negative manager impact: -0.1% per $1000 of sell orders (scaled)
        managerImpact = amount > 0 ? -(amount / Math.max(currentExposure, 1000)) * 0.1 : 0;
        break;

      case 'HOLD':
        // HOLD → no exposure change but return a small neutral managerImpact near zero
        exposureDelta = 0;
        // Small neutral impact near zero (slight positive to indicate stability)
        managerImpact = 0.001; // Very small positive value near zero
        break;

      case 'REBALANCE':
        // REBALANCE → redistribute sector.exposure evenly across internal simulated assets
        // If we do not yet support multi-asset tracking, just reduce exposure volatility by 50%
        // For now, we'll reduce exposure volatility by 50% (no multi-asset support yet)
        // This means we'll reduce the exposure by 50% of its current value
        // and return a neutral manager impact
        exposureDelta = -currentExposure * 0.5; // Reduce exposure by 50%
        // Neutral impact for rebalancing (slight positive to indicate risk reduction)
        managerImpact = 0.002; // Small positive value indicating risk reduction
        break;

      default:
        // Unknown type - no change
        console.warn(`[ExecutionEngine] Unknown checklist item type: ${itemType}`);
        exposureDelta = 0;
        managerImpact = 0;
        break;
    }

    return {
      exposureDelta,
      managerImpact
    };
  }

  /**
   * Update simulated price for a sector based on volatility, noise, trend, and manager impact
   * @param {Object} sector - Sector object
   * @param {Object} executionImpact - Execution impact object with managerImpact
   * @returns {Promise<number>} New simulated price
   */
  async updateSimulatedPrice(sector, executionImpact) {
    // Read old price from sector.simulatedPrice, fallback to currentPrice or lastSimulatedPrice
    const oldPrice = sector.simulatedPrice || sector.currentPrice || sector.lastSimulatedPrice || 100;

    // Calculate volatility: vol = sector.volatility / 100
    const vol = typeof sector.volatility === 'number' ? sector.volatility / 100 : 0.02 / 100;

    // Generate volatility noise: random in [-vol, +vol]
    const volatilityNoise = (Math.random() * 2 - 1) * vol;

    // Generate random noise: random in [-0.005, +0.005]
    const randomNoise = (Math.random() * 2 - 1) * 0.005;

    // Get trend component: sector.trendCurve or 0 if not present
    const trendComponent = typeof sector.trendCurve === 'number' ? sector.trendCurve : 0;

    // Get manager impact: executionImpact.managerImpact or 0
    // Multiply by 1.5 to increase visibility of BUY/SELL actions
    const managerImpact = executionImpact && typeof executionImpact.managerImpact === 'number' 
      ? executionImpact.managerImpact * 1.5
      : 0;

    // Calculate new price using the formula
    let newPrice = oldPrice * (1 + volatilityNoise + randomNoise + trendComponent + managerImpact);

    // Clamp newPrice to minimum 0.01
    newPrice = Math.max(0.01, newPrice);

    // Update sector with new simulated price and timestamp
    const updates = {
      simulatedPrice: newPrice,
      lastPriceUpdate: Date.now()
    };

    // Also update currentPrice and lastSimulatedPrice for consistency
    updates.currentPrice = newPrice;
    updates.lastSimulatedPrice = newPrice;

    await updateSector(sector.id, updates);

    return newPrice;
  }

  /**
   * Update sector performance based on simulated price and initial price
   * Calculates: performance = (simulatedPrice - initialPrice) / initialPrice
   * Performance is rounded to 4 decimal places
   * @param {Object} sector - Sector object
   * @returns {number} Calculated performance value (float rounded to 4 decimals)
   */
  updateSectorPerformance(sector) {
    if (!sector) {
      return 0;
    }

    // Get simulatedPrice (fallback to currentPrice or lastSimulatedPrice)
    const simulatedPrice = typeof sector.simulatedPrice === 'number' 
      ? sector.simulatedPrice 
      : (typeof sector.currentPrice === 'number' && sector.currentPrice > 0 
          ? sector.currentPrice 
          : (typeof sector.lastSimulatedPrice === 'number' && sector.lastSimulatedPrice > 0
              ? sector.lastSimulatedPrice
              : 100));

    // Get initialPrice (fallback to currentPrice if > 0, otherwise default to 100)
    const initialPrice = typeof sector.initialPrice === 'number' && sector.initialPrice > 0
      ? sector.initialPrice
      : (typeof sector.currentPrice === 'number' && sector.currentPrice > 0
          ? sector.currentPrice
          : 100);

    // Calculate performance: (simulatedPrice - initialPrice) / initialPrice
    if (initialPrice === 0) {
      return 0; // Avoid division by zero
    }

    const performance = (simulatedPrice - initialPrice) / initialPrice;
    
    // Round to 4 decimal places
    const roundedPerformance = Math.round(performance * 10000) / 10000;
    
    return roundedPerformance;
  }

  /**
   * Update agent rewards based on checklist item execution
   * @param {Array} agents - Array of agent objects
   * @param {Object} checklistItem - Checklist item that was executed
   * @param {string} discussionId - Optional discussion ID to analyze support/opposition
   * @returns {Promise<void>}
   */
  async updateAgentRewards(agents, checklistItem, discussionId = null) {
    if (!Array.isArray(agents) || !checklistItem) {
      console.warn('[ExecutionEngine] updateAgentRewards: Invalid parameters');
      return;
    }

    // Initialize rewards for all agents if not present
    const agentRewards = new Map();
    agents.forEach(agent => {
      if (agent && agent.id) {
        const currentRewards = typeof agent.rewards === 'number' ? agent.rewards : 0;
        agentRewards.set(agent.id, {
          agent: agent,
          rewards: currentRewards,
          updated: false
        });
      }
    });

    // Reward proposer: +2 tokens
    if (checklistItem.agentId) {
      const proposer = agentRewards.get(checklistItem.agentId);
      if (proposer) {
        proposer.rewards += 2;
        proposer.updated = true;
        console.log(`[ExecutionEngine] Rewarded proposer ${checklistItem.agentId}: +2 tokens`);
      }
    }

    // Analyze discussion to determine supporters and opposers
    let discussionRoom = null;
    if (discussionId) {
      try {
        const discussionData = await findDiscussionById(discussionId);
        if (discussionData) {
          discussionRoom = DiscussionRoom.fromData(discussionData);
        }
      } catch (error) {
        console.warn(`[ExecutionEngine] Could not load discussion ${discussionId}: ${error.message}`);
      }
    }

    // Extract action from checklist item
    const itemAction = (checklistItem.action || '').toLowerCase();
    
    // Determine support/opposition from discussion messages
    if (discussionRoom && Array.isArray(discussionRoom.messages)) {
      const actionMap = {
        'buy': 'buy',
        'sell': 'sell',
        'hold': 'hold',
        'rebalance': 'rebalance'
      };

      // Analyze each message to determine support/opposition
      discussionRoom.messages.forEach(message => {
        if (!message.agentId || !message.content) {
          return;
        }

        // Skip the proposer (already rewarded)
        if (message.agentId === checklistItem.agentId) {
          return;
        }

        const agent = agentRewards.get(message.agentId);
        if (!agent) {
          return;
        }

        // Extract action from message content
        const contentLower = message.content.toLowerCase();
        let messageAction = null;

        if (contentLower.includes('buy') || contentLower.includes('deploy capital') || contentLower.includes('deploy')) {
          messageAction = 'buy';
        } else if (contentLower.includes('sell') || contentLower.includes('withdraw')) {
          messageAction = 'sell';
        } else if (contentLower.includes('hold')) {
          messageAction = 'hold';
        } else if (contentLower.includes('rebalance') || contentLower.includes('allocate')) {
          messageAction = 'rebalance';
        }

        // Determine if message supports or opposes the item
        if (messageAction && itemAction) {
          // Support: same action
          if (messageAction === itemAction) {
            agent.rewards += 1;
            agent.updated = true;
            console.log(`[ExecutionEngine] Rewarded supporter ${message.agentId}: +1 token`);
          }
          // Oppose: opposite actions (buy vs sell)
          else if (
            (messageAction === 'buy' && itemAction === 'sell') ||
            (messageAction === 'sell' && itemAction === 'buy')
          ) {
            agent.rewards -= 1;
            agent.updated = true;
            console.log(`[ExecutionEngine] Penalized opposer ${message.agentId}: -1 token`);
          }
        }
      });
    }

    // Reward manager: +1 token per executed item
    agents.forEach(agent => {
      if (agent && agent.id) {
        const isManager = agent.role === 'manager' || 
                         (agent.role && agent.role.toLowerCase().includes('manager'));
        if (isManager) {
          const manager = agentRewards.get(agent.id);
          if (manager) {
            manager.rewards += 1;
            manager.updated = true;
            console.log(`[ExecutionEngine] Rewarded manager ${agent.id}: +1 token`);
          }
        }
      }
    });

    // Persist updated rewards
    for (const [agentId, agentData] of agentRewards.entries()) {
      if (agentData.updated) {
        try {
          // Initialize rewards field if it doesn't exist
          const updates = {
            rewards: agentData.rewards
          };
          
          await updateAgent(agentId, updates);
          console.log(`[ExecutionEngine] Updated rewards for agent ${agentId}: ${agentData.rewards} tokens`);
        } catch (error) {
          console.error(`[ExecutionEngine] Failed to update rewards for agent ${agentId}: ${error.message}`);
        }
      }
    }
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

