const { getSectorById, updateSector } = require('../utils/sectorStorage');
const { readDataFile, writeDataFile } = require('../utils/persistence');
const { v4: uuidv4 } = require('uuid');
const { findDiscussionById } = require('../utils/discussionStorage');
const { updateAgent } = require('../utils/agentStorage');
const DiscussionRoom = require('../models/DiscussionRoom');
const { getManagerById, getExecutionList, removeExecutionItem } = require('../utils/executionListStorage');
const { calculateNewPrice, mapActionToImpact } = require('../simulation/priceModel');

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

    // Initialize sectorState with capital and position
    // Map balance to capital, and track position in performance or as separate field
    const initialHoldings = (sector.holdings && typeof sector.holdings === 'object')
      ? { ...sector.holdings }
      : {};

    if (typeof initialHoldings.position !== 'number') {
      initialHoldings.position = typeof sector.position === 'number'
        ? sector.position
        : (sector.performance?.position || 0);
    }

    const startingBalance = typeof sector.balance === 'number' ? sector.balance : 0;

    const sectorState = {
      id: sector.id,
      balance: startingBalance, // Single source of truth for sector balance
      holdings: initialHoldings,
      position: typeof initialHoldings.position === 'number' ? initialHoldings.position : 0,
      performance: sector.performance && typeof sector.performance === 'object' ? { ...sector.performance } : {},
      utilization: typeof sector.utilization === 'number' ? sector.utilization : 0,
      currentPrice: typeof sector.currentPrice === 'number' ? sector.currentPrice : 100,
      agents: Array.isArray(sector.agents) ? sector.agents : []
    };

    const startingPrice = sectorState.currentPrice;

    const getHoldingsTotal = () => {
      const holdings = sectorState.holdings || {};
      return Object.entries(holdings).reduce((sum, [key, value]) => {
        const keyLower = key.toLowerCase();
        if (keyLower === 'balance' || keyLower === 'cash') {
          return sum;
        }
        return sum + (typeof value === 'number' ? value : 0);
      }, 0);
    };

    const syncPosition = () => {
      sectorState.position = typeof sectorState.holdings.position === 'number'
        ? sectorState.holdings.position
        : 0;
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

      // Extract amount - must come from checklist JSON (no defaults)
      let amount = 0;
      if (typeof item.amount === 'number' && item.amount > 0) {
        amount = item.amount;
      } else if (typeof item.quantity === 'number' && item.quantity > 0) {
        amount = item.quantity;
      }

      const requiresAmount = !['rebalance', 'hold'].includes(action || '');
      if (requiresAmount && amount <= 0) {
        tradeResults.push({
          itemId: item.id || null,
          action: action,
          amount: 0,
          success: false,
          reason: 'Invalid or missing amount'
        });
        continue;
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

      let executionSucceeded = false;
      let executedAction = null;

      try {
        switch (action) {
          case 'buy':
            if (amount > 0 && sectorState.balance >= amount) {
              sectorState.balance -= amount; // Update balance (single source of truth)
              sectorState.position += amount;
              sectorState.holdings.position = sectorState.position;
              tradeResults.push({
                itemId: item.id || null,
                action: 'buy',
                amount: amount,
                success: true,
                reason: 'Buy executed successfully'
              });
              executionSucceeded = true;
              executedAction = 'BUY';
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
                reason: amount <= 0 ? 'Invalid amount' : 'Insufficient balance'
              });
            }
            break;

          case 'sell':
            if (amount > 0 && sectorState.position >= amount) {
              sectorState.balance += amount; // Update balance (single source of truth)
              sectorState.position -= amount;
              sectorState.holdings.position = sectorState.position;
              tradeResults.push({
                itemId: item.id || null,
                action: 'sell',
                amount: amount,
                success: true,
                reason: 'Sell executed successfully'
              });
              executionSucceeded = true;
              executedAction = 'SELL';
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
            executionSucceeded = true;
            executedAction = 'HOLD';
            // Update agent rewards for successful execution
            try {
              await this.updateAgentRewards(allAgents, item, checklistId);
            } catch (rewardError) {
              console.warn(`[ExecutionEngine] Failed to update rewards for item ${item.id}: ${rewardError.message}`);
            }
            break;

          case 'rebalance': {
            const totalValue = sectorState.balance + getHoldingsTotal();
            const ratioInput = item.ratio || item.targetRatio || item.targetAllocation || item.allocationRatio;
            let rebalanceSuccess = false;
            let rebalanceReason = 'Rebalance executed successfully';

            if (ratioInput && typeof ratioInput === 'object') {
              const ratioEntries = Object.entries(ratioInput).filter(([, value]) => typeof value === 'number' && value > 0);
              if (ratioEntries.length > 0 && totalValue > 0) {
                const ratioSum = ratioEntries.reduce((sum, [, value]) => sum + value, 0);
                const newHoldings = { ...sectorState.holdings };
                let newBalance = 0;
                let allocatedTotal = 0;

                for (const [key, value] of ratioEntries) {
                  const targetValue = totalValue * (value / ratioSum);
                  const keyLower = key.toLowerCase();
                  if (keyLower === 'balance' || keyLower === 'cash') {
                    newBalance += targetValue;
                  } else {
                    newHoldings[key] = targetValue;
                    if (key === 'position') {
                      sectorState.position = targetValue;
                    }
                  }
                  allocatedTotal += targetValue;
                }

                // Any leftover goes to balance
                newBalance += Math.max(totalValue - allocatedTotal, 0);

                sectorState.holdings = newHoldings;
                sectorState.balance = newBalance; // Update balance (single source of truth)
                syncPosition();
                rebalanceSuccess = true;
              } else {
                rebalanceReason = 'Invalid ratio for rebalance';
              }
            } else if (typeof ratioInput === 'number' && ratioInput >= 0) {
              const clampedRatio = Math.min(Math.max(ratioInput, 0), 1);
              const targetPosition = totalValue * clampedRatio;
              const rebalanceAmount = targetPosition - sectorState.position;

              if (Math.abs(rebalanceAmount) > 0.01) {
                if (rebalanceAmount > 0) {
                  const buyAmount = Math.min(rebalanceAmount, sectorState.balance);
                  if (buyAmount > 0) {
                    sectorState.balance -= buyAmount; // Update balance (single source of truth)
                    sectorState.position += buyAmount;
                  }
                } else {
                  const sellAmount = Math.min(Math.abs(rebalanceAmount), sectorState.position);
                  if (sellAmount > 0) {
                    sectorState.balance += sellAmount; // Update balance (single source of truth)
                    sectorState.position -= sellAmount;
                  }
                }
                sectorState.holdings.position = sectorState.position;
              }

              rebalanceSuccess = true;
            } else {
              rebalanceReason = 'Missing or invalid rebalance ratio';
            }

            if (rebalanceSuccess) {
              tradeResults.push({
                itemId: item.id || null,
                action: 'rebalance',
                amount: totalValue,
                success: true,
                reason: 'Rebalance executed successfully'
              });
              executionSucceeded = true;
              executedAction = 'REBALANCE';
              // Update agent rewards for successful execution
              try {
                await this.updateAgentRewards(allAgents, item, checklistId);
              } catch (rewardError) {
                console.warn(`[ExecutionEngine] Failed to update rewards for item ${item.id}: ${rewardError.message}`);
              }
            } else {
              tradeResults.push({
                itemId: item.id || null,
                action: 'rebalance',
                amount: 0,
                success: false,
                reason: rebalanceReason
              });
            }
            break;
          }

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

        if (executionSucceeded && executedAction) {
          await this.applyPriceUpdateForAction(sector, sectorState, executedAction);
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
    const previousPosition = typeof sector.holdings?.position === 'number'
      ? sector.holdings.position
      : (typeof sector.position === 'number' ? sector.position : (sector.performance?.position || 0));
    const previousTotalValue = previousCapital + previousPosition;

    const currentPosition = sectorState.position;
    const currentTotalValue = sectorState.balance + getHoldingsTotal();
    const pnl = currentTotalValue - previousTotalValue;
    const pnlPercent = previousTotalValue > 0 ? (pnl / previousTotalValue) * 100 : 0;

    sectorState.performance = {
      ...sectorState.performance,
      totalPL: (sectorState.performance.totalPL || 0) + pnl,
      pnl: pnl,
      pnlPercent: pnlPercent,
      position: currentPosition,
      capital: sectorState.balance, // Keep for backward compatibility in performance tracking
      totalValue: currentTotalValue,
      lastUpdated: timestamp
    };

    // Recalculate utilization
    // Utilization = (position / total value) * 100
    const totalValue = sectorState.balance + getHoldingsTotal();
    sectorState.utilization = totalValue > 0 
      ? (currentPosition / totalValue) * 100 
      : 0;

    // Price is already updated per executed item via applyPriceUpdateForAction.
    // Calculate aggregate change for logging purposes only.
    const previousPrice = startingPrice || sector.currentPrice || sector.simulatedPrice || sector.lastSimulatedPrice || 100;
    const newPrice = sectorState.currentPrice;
    const priceChangePercent = previousPrice > 0 ? ((newPrice - previousPrice) / previousPrice) * 100 : 0;

    // Ensure the latest balance/positions snapshot is persisted alongside the final price
    const updates = {
      balance: sectorState.balance,
      holdings: sectorState.holdings,
      position: sectorState.position,
      positions: sectorState.position,
      performance: sectorState.performance,
      utilization: sectorState.utilization,
      currentPrice: newPrice,
      simulatedPrice: newPrice,
      lastSimulatedPrice: newPrice,
      lastPriceUpdate: Date.now(),
      change: newPrice - previousPrice,
      changePercent: priceChangePercent
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
        balance: sectorState.balance,
        holdings: sectorState.holdings,
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
    // Check item.type first, then item.action, then try to extract from item.text
    let itemType = (item.type || item.action || '').toUpperCase();
    
    // If still no type found, try to extract from text
    if (!itemType && item.text) {
      const textUpper = item.text.toUpperCase();
      if (textUpper.includes('BUY') || textUpper.includes('DEPLOY CAPITAL') || textUpper.includes('DEPLOY')) {
        itemType = 'BUY';
      } else if (textUpper.includes('SELL') || textUpper.includes('WITHDRAW')) {
        itemType = 'SELL';
      } else if (textUpper.includes('HOLD')) {
        itemType = 'HOLD';
      } else if (textUpper.includes('REBALANCE') || textUpper.includes('ALLOCATE')) {
        itemType = 'REBALANCE';
      }
    }
    
    // Also check reasoning field
    if (!itemType && item.reasoning) {
      const reasoningUpper = item.reasoning.toUpperCase();
      if (reasoningUpper.includes('BUY') || reasoningUpper.includes('DEPLOY')) {
        itemType = 'BUY';
      } else if (reasoningUpper.includes('SELL')) {
        itemType = 'SELL';
      } else if (reasoningUpper.includes('HOLD')) {
        itemType = 'HOLD';
      } else if (reasoningUpper.includes('REBALANCE')) {
        itemType = 'REBALANCE';
      }
    }

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
   * Resolve trend factor from sector object (supports trendCurveValue or trendCurve)
   */
  getTrendFactor(sector) {
    if (!sector) {
      return 0;
    }
    if (typeof sector.trendCurveValue === 'number') {
      return sector.trendCurveValue;
    }
    if (typeof sector.trendCurve === 'number') {
      return sector.trendCurve;
    }
    return 0;
  }

  /**
   * Apply the mandated price model and persist sector state (price + balance/positions)
   * after an executed action.
   */
  async applyPriceUpdateForAction(sector, sectorState, actionType) {
    const previousPrice = typeof sectorState.currentPrice === 'number'
      ? sectorState.currentPrice
      : (sector.currentPrice || sector.simulatedPrice || sector.lastSimulatedPrice || 100);

    const trendFactor = this.getTrendFactor(sector);
    const managerImpact = mapActionToImpact(actionType);
    const newPrice = calculateNewPrice(previousPrice, { managerImpact, trendFactor });

    sectorState.currentPrice = newPrice;
    const updates = {
      balance: sectorState.balance,
      holdings: sectorState.holdings,
      position: sectorState.position,
      positions: sectorState.position,
      currentPrice: newPrice,
      simulatedPrice: newPrice,
      lastSimulatedPrice: newPrice,
      lastPriceUpdate: Date.now(),
      change: newPrice - previousPrice,
      changePercent: previousPrice > 0 ? ((newPrice - previousPrice) / previousPrice) * 100 : 0
    };

    await updateSector(sector.id, updates);

    // Keep sector reference aligned for subsequent actions within the same execution
    sector.currentPrice = newPrice;
    sector.balance = sectorState.balance;
    sector.holdings = sectorState.holdings;
    sector.position = sectorState.position;
    sector.positions = sectorState.position;

    return newPrice;
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

    const managerImpact = executionImpact && typeof executionImpact.managerImpact === 'number'
      ? executionImpact.managerImpact
      : 0;

    const trendFactor = this.getTrendFactor(sector);
    const newPrice = calculateNewPrice(oldPrice, { managerImpact, trendFactor });
    const priceChange = newPrice - oldPrice;
    const changePercent = oldPrice > 0 ? (priceChange / oldPrice) * 100 : 0;

    // Update sector with new simulated price and timestamp
    const updates = {
      simulatedPrice: newPrice,
      lastPriceUpdate: Date.now(),
      currentPrice: newPrice,
      lastSimulatedPrice: newPrice,
      change: priceChange,
      changePercent: changePercent
    };

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
    
    // Track which agents have already been counted (to avoid double-counting)
    const processedAgents = new Set();
    
    // Determine support/opposition from discussion messages
    if (discussionRoom && Array.isArray(discussionRoom.messages)) {
      // Analyze each message to determine support/opposition
      discussionRoom.messages.forEach(message => {
        if (!message.agentId || !message.content) {
          return;
        }

        // Skip the proposer (already rewarded)
        if (message.agentId === checklistItem.agentId) {
          return;
        }

        // Skip if we've already processed this agent
        if (processedAgents.has(message.agentId)) {
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
            processedAgents.add(message.agentId);
            console.log(`[ExecutionEngine] Rewarded supporter ${message.agentId}: +1 token`);
          }
          // Oppose: opposite actions (buy vs sell)
          else if (
            (messageAction === 'buy' && itemAction === 'sell') ||
            (messageAction === 'sell' && itemAction === 'buy')
          ) {
            agent.rewards -= 1;
            agent.updated = true;
            processedAgents.add(message.agentId);
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

  /**
   * Process execution list from manager - Phase 4 implementation
   * Reads items from manager.executionList FIFO and executes them
   * @param {string} managerId - Manager agent ID
   * @returns {Promise<Object>} Execution results with summary
   */
  async processExecutionList(managerId) {
    if (!managerId) {
      throw new Error('managerId is required');
    }

    // Get manager and execution list
    const manager = await getManagerById(managerId);
    if (!manager) {
      throw new Error(`Manager with ID ${managerId} not found`);
    }

    const executionList = await getExecutionList(managerId);
    if (!Array.isArray(executionList) || executionList.length === 0) {
      console.log(`[ExecutionEngine] No items in execution list for manager ${managerId}`);
      return {
        success: true,
        executed: 0,
        results: []
      };
    }

    const sectorId = manager.sectorId;
    if (!sectorId) {
      throw new Error(`Manager ${managerId} has no sectorId`);
    }

    // Load sector state
    const sector = await getSectorById(sectorId);
    if (!sector) {
      throw new Error(`Sector ${sectorId} not found`);
    }

    // Check if there are active agents in the sector
    const { loadAgents } = require('../utils/agentStorage');
    const allAgents = await loadAgents();
    const sectorAgents = allAgents.filter(agent => agent && agent.sectorId === sectorId);
    const activeAgents = sectorAgents.filter(agent => agent && agent.status === 'active');
    const activeAgentsCount = activeAgents.length;

    // Initialize sectorState
    const sectorState = {
      id: sector.id,
      balance: typeof sector.balance === 'number' ? sector.balance : 0, // Single source of truth for sector balance
      position: typeof sector.position === 'number' ? sector.position : (sector.performance?.position || 0),
      holdings: { position: typeof sector.position === 'number' ? sector.position : (sector.performance?.position || 0) },
      performance: sector.performance && typeof sector.performance === 'object' ? { ...sector.performance } : {},
      utilization: typeof sector.utilization === 'number' ? sector.utilization : 0,
      currentPrice: typeof sector.currentPrice === 'number' ? sector.currentPrice : 100,
      agents: Array.isArray(sector.agents) ? sector.agents : []
    };

    const executionResults = [];
    const timestamp = Date.now();
    const startingPrice = sectorState.currentPrice;

    // Process each item FIFO
    for (const item of executionList) {
      try {
        const actionType = item.actionType?.toUpperCase();
        const symbol = item.symbol || sectorId;
        const allocation = typeof item.allocation === 'number' ? item.allocation : 0;

        if (!actionType || !['BUY', 'SELL', 'HOLD', 'REBALANCE'].includes(actionType)) {
          console.warn(`[ExecutionEngine] Skipping invalid actionType: ${actionType} for item ${item.id}`);
          executionResults.push({
            itemId: item.id,
            actionType: actionType || 'UNKNOWN',
            symbol: symbol,
            success: false,
            reason: `Invalid actionType: ${actionType}`
          });
          continue;
        }

        // Execute action
        let result;
        switch (actionType) {
          case 'BUY':
            result = await this.applyBuy(sectorState, allocation, symbol);
            break;
          case 'SELL':
            result = await this.applySell(sectorState, allocation, symbol);
            break;
          case 'HOLD':
            result = await this.applyHold(sectorState, symbol);
            break;
          case 'REBALANCE':
            result = await this.applyRebalance(sectorState, allocation);
            break;
          default:
            result = { success: false, reason: `Unknown action: ${actionType}` };
        }

        // Store result
        executionResults.push({
          itemId: item.id,
          actionType: actionType,
          symbol: symbol,
          allocation: allocation,
          success: result.success,
          reason: result.reason || 'Executed successfully',
          managerImpact: result.managerImpact || 0
        });

        // Remove item from execution list after successful execution
        if (result.success) {
          await this.applyPriceUpdateForAction(sector, sectorState, actionType);
          await removeExecutionItem(managerId, item.id);
          console.log(`[ExecutionEngine] Executed ${actionType} on ${symbol} for manager ${managerId}.`);
        } else {
          console.warn(`[ExecutionEngine] Failed to execute ${actionType} on ${symbol} for manager ${managerId}: ${result.reason}`);
        }
      } catch (error) {
        console.error(`[ExecutionEngine] Error processing execution item ${item.id}:`, error);
        executionResults.push({
          itemId: item.id,
          actionType: item.actionType || 'UNKNOWN',
          symbol: item.symbol || sectorId,
          success: false,
          reason: error.message
        });
      }
    }

    // Recalculate performance
    const previousCapital = typeof sector.balance === 'number' ? sector.balance : 0;
    const previousPosition = typeof sector.position === 'number' ? sector.position : (sector.performance?.position || 0);
    const previousTotalValue = previousCapital + previousPosition;

    const currentTotalValue = sectorState.balance + sectorState.position;
    const pnl = currentTotalValue - previousTotalValue;
    const pnlPercent = previousTotalValue > 0 ? (pnl / previousTotalValue) * 100 : 0;

    sectorState.performance = {
      ...sectorState.performance,
      totalPL: (sectorState.performance.totalPL || 0) + pnl,
      pnl: pnl,
      pnlPercent: pnlPercent,
      position: sectorState.position,
      capital: sectorState.balance, // Keep for backward compatibility in performance tracking
      totalValue: currentTotalValue,
      lastUpdated: timestamp
    };

    // Recalculate utilization
    const totalValue = sectorState.balance + sectorState.position;
    sectorState.utilization = totalValue > 0 
      ? (sectorState.position / totalValue) * 100 
      : 0;

    const previousPrice = startingPrice || sector.currentPrice || sector.simulatedPrice || sector.lastSimulatedPrice || 100;
    const newPrice = sectorState.currentPrice;
    const priceChangePercent = previousPrice > 0 ? ((newPrice - previousPrice) / previousPrice) * 100 : 0;

    // Update sector
    const updates = {
      balance: sectorState.balance, // Persist balance (single source of truth)
      position: sectorState.position,
      positions: sectorState.position,
      performance: sectorState.performance,
      utilization: sectorState.utilization,
      currentPrice: newPrice,
      simulatedPrice: newPrice,
      lastSimulatedPrice: newPrice,
      lastPriceUpdate: Date.now(),
      change: newPrice - previousPrice,
      changePercent: priceChangePercent
    };

    await updateSector(sectorId, updates);

    // Generate execution log
    const logEntry = {
      id: uuidv4(),
      sectorId: sectorId,
      managerId: managerId,
      timestamp: timestamp,
      executionType: 'execution_list',
      results: executionResults
    };

    await this._appendExecutionLog(logEntry);

    const executedCount = executionResults.filter(r => r.success).length;

    return {
      success: true,
      executed: executedCount,
      total: executionResults.length,
      results: executionResults,
      updatedSectorState: {
        id: sectorState.id,
        balance: sectorState.balance,
        position: sectorState.position,
        performance: sectorState.performance,
        utilization: sectorState.utilization,
        currentPrice: sectorState.currentPrice
      }
    };
  }

  /**
   * Apply BUY action
   * @param {Object} sectorState - Current sector state
   * @param {number} amount - Amount to buy
   * @param {string} symbol - Symbol/ticker
   * @returns {Promise<Object>} Result with success, reason, and managerImpact
   */
  async applyBuy(sectorState, amount, symbol) {
    if (amount <= 0) {
      return { success: false, reason: 'Invalid amount: must be positive' };
    }

    if (sectorState.balance < amount) {
      return { success: false, reason: 'Insufficient balance' };
    }

    sectorState.balance -= amount; // Update balance (single source of truth)
    sectorState.position += amount;

    // Calculate manager impact: positive impact for buy orders
    const currentExposure = sectorState.position;
    const managerImpact = amount > 0 ? (amount / Math.max(currentExposure, 1000)) * 0.001 : 0;

    return {
      success: true,
      reason: 'Buy executed successfully',
      managerImpact: managerImpact
    };
  }

  /**
   * Apply SELL action
   * @param {Object} sectorState - Current sector state
   * @param {number} amount - Amount to sell
   * @param {string} symbol - Symbol/ticker
   * @returns {Promise<Object>} Result with success, reason, and managerImpact
   */
  async applySell(sectorState, amount, symbol) {
    if (amount <= 0) {
      return { success: false, reason: 'Invalid amount: must be positive' };
    }

    if (sectorState.position < amount) {
      return { success: false, reason: 'Insufficient position' };
    }

    sectorState.balance += amount; // Update balance (single source of truth)
    sectorState.position -= amount;

    // Calculate manager impact: negative impact for sell orders
    const currentExposure = sectorState.position + amount; // Use position before sell
    const managerImpact = amount > 0 ? -(amount / Math.max(currentExposure, 1000)) * 0.001 : 0;

    return {
      success: true,
      reason: 'Sell executed successfully',
      managerImpact: managerImpact
    };
  }

  /**
   * Apply HOLD action (no-op)
   * @param {Object} sectorState - Current sector state
   * @param {string} symbol - Symbol/ticker
   * @returns {Promise<Object>} Result with success, reason, and managerImpact
   */
  async applyHold(sectorState, symbol) {
    // HOLD is a no-op, but we still log it
    return {
      success: true,
      reason: 'Hold action - no changes',
      managerImpact: 0.001 // Small neutral impact
    };
  }

  /**
   * Apply REBALANCE action
   * @param {Object} sectorState - Current sector state
   * @param {number} targetAllocation - Target allocation (optional, defaults to 50/50)
   * @returns {Promise<Object>} Result with success, reason, and managerImpact
   */
  async applyRebalance(sectorState, targetAllocation = 0.5) {
    const totalValue = sectorState.balance + sectorState.position;
    const targetPosition = totalValue * targetAllocation;
    const currentPosition = sectorState.position;
    const rebalanceAmount = targetPosition - currentPosition;

    if (Math.abs(rebalanceAmount) < 0.01) {
      return {
        success: true,
        reason: 'Rebalance not needed - already balanced',
        managerImpact: 0.002
      };
    }

    if (rebalanceAmount > 0) {
      // Need to buy more
      const buyAmount = Math.min(rebalanceAmount, sectorState.balance);
      if (buyAmount > 0) {
        sectorState.balance -= buyAmount; // Update balance (single source of truth)
        sectorState.position += buyAmount;
      }
    } else {
      // Need to sell
      const sellAmount = Math.min(Math.abs(rebalanceAmount), sectorState.position);
      if (sellAmount > 0) {
        sectorState.balance += sellAmount; // Update balance (single source of truth)
        sectorState.position -= sellAmount;
      }
    }

    return {
      success: true,
      reason: 'Rebalance executed successfully',
      managerImpact: 0.002 // Small positive impact indicating risk reduction
    };
  }
}

module.exports = ExecutionEngine;

