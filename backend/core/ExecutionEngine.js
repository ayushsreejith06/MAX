const { getSectorById, updateSector } = require('../utils/sectorStorage');
const { readDataFile, writeDataFile } = require('../utils/persistence');
const { v4: uuidv4 } = require('uuid');
const { findDiscussionById, saveDiscussion } = require('../utils/discussionStorage');
const { updateAgent } = require('../utils/agentStorage');
const DiscussionRoom = require('../models/DiscussionRoom');
const { storePriceTick } = require('../utils/priceHistoryStorage');
const { getManagerById, getExecutionList, removeExecutionItem } = require('../utils/executionListStorage');
const { calculateNewPrice, mapActionToImpact } = require('../simulation/priceModel');
const { setAgentExecuting, refreshAgentStatus } = require('../utils/agentStatusService');
const { captureConfidenceSnapshot, calculateConfidenceMultiplier, applyConfidenceMultiplier } = require('../utils/confidenceMultiplier');

const EXECUTION_LOGS_FILE = 'executionLogs.json';

/**
 * ExecutionEngine - Handles execution of approved checklists
 */
class ExecutionEngine {
  constructor() {
    // ExecutionEngine is a stateless coordinator
  }

  /**
   * Execute a single checklist item
   * @param {string} checklistItemId - ID of the checklist item to execute
   * @param {string} discussionId - Discussion ID containing the item
   * @returns {Promise<Object>} Execution result with success, impact, delta, timestamp, sectorId, discussionId
   */
  async executeChecklistItem(checklistItemId, discussionId) {
    if (!checklistItemId) {
      throw new Error('checklistItemId is required');
    }
    if (!discussionId) {
      throw new Error('discussionId is required');
    }

    // Load discussion to find the checklist item
    const discussionData = await findDiscussionById(discussionId);
    if (!discussionData) {
      throw new Error(`Discussion ${discussionId} not found`);
    }

    const discussionRoom = DiscussionRoom.fromData(discussionData);
    const sectorId = discussionRoom.sectorId;

    // Find the checklist item in finalizedChecklist or checklist
    let checklistItem = null;
    if (Array.isArray(discussionRoom.finalizedChecklist)) {
      checklistItem = discussionRoom.finalizedChecklist.find(item => item.id === checklistItemId);
    }
    if (!checklistItem && Array.isArray(discussionRoom.checklist)) {
      checklistItem = discussionRoom.checklist.find(item => item.id === checklistItemId);
    }

    if (!checklistItem) {
      throw new Error(`Checklist item ${checklistItemId} not found in discussion ${discussionId}`);
    }

    // Check if already executed (prevent double execution)
    if (checklistItem.executedAt) {
      console.log(`[ExecutionEngine] Checklist item ${checklistItemId} already executed at ${checklistItem.executedAt}`);
      return {
        success: true,
        alreadyExecuted: true,
        executedAt: checklistItem.executedAt,
        itemId: checklistItemId,
        sectorId: sectorId,
        discussionId: discussionId
      };
    }

    // Verify item is approved
    const status = (checklistItem.status || '').toUpperCase();
    if (status !== 'APPROVED') {
      throw new Error(`Cannot execute checklist item ${checklistItemId}: status is ${status}, must be APPROVED`);
    }

    // Execution does NOT depend on discussion.status
    // Checklist item acceptance is the only trigger

    // Execute the single item using existing executeChecklist logic
    const executionResult = await this.executeChecklist([checklistItem], sectorId, discussionId);

    // Mark item as executed with timestamp and find execution log ID
    const executedAt = new Date().toISOString();
    checklistItem.executedAt = executedAt;
    checklistItem.status = 'EXECUTED';
    
    // Find the execution log entry for this item
    const ExecutionLog = require('../models/ExecutionLog');
    let executionLogId = null;
    try {
      const executionLog = await ExecutionLog.getByChecklistItemId(checklistItemId);
      if (executionLog) {
        executionLogId = executionLog.id;
        checklistItem.executionLogId = executionLogId;
      }
    } catch (logError) {
      console.warn(`[ExecutionEngine] Failed to find execution log for item ${checklistItemId}:`, logError.message);
    }

    // Update the item in both finalizedChecklist and checklist
    if (Array.isArray(discussionRoom.finalizedChecklist)) {
      const finalizedIndex = discussionRoom.finalizedChecklist.findIndex(item => item.id === checklistItemId);
      if (finalizedIndex >= 0) {
        discussionRoom.finalizedChecklist[finalizedIndex] = checklistItem;
      }
    }
    if (Array.isArray(discussionRoom.checklist)) {
      const checklistIndex = discussionRoom.checklist.findIndex(item => item.id === checklistItemId);
      if (checklistIndex >= 0) {
        discussionRoom.checklist[checklistIndex] = checklistItem;
      }
    }

    // Save updated discussion
    await saveDiscussion(discussionRoom);

    // Check if discussion should transition from AWAITING_EXECUTION to DECIDED
    // (all ACCEPTED items are now executed)
    try {
      const { checkAndTransitionToDecided } = require('../utils/discussionStatusService');
      await checkAndTransitionToDecided(discussionId);
    } catch (transitionError) {
      console.warn(`[ExecutionEngine] Failed to check transition to DECIDED:`, transitionError.message);
      // Don't throw - transition failure shouldn't break execution
    }

    // Extract execution details from result
    // executeChecklist returns { success, updatedSectorState } but doesn't expose individual results
    // We need to extract from the checklist item itself
    const action = (checklistItem.action || '').toUpperCase();
    const amount = typeof checklistItem.amount === 'number' ? checklistItem.amount : 0;
    const impact = amount;
    const delta = action === 'BUY' ? impact : (action === 'SELL' ? -impact : 0);
    const timestamp = Date.now();
    const price = executionResult.updatedSectorState?.currentPrice || 0;

    // Emit execution event
    const executionEvent = {
      type: 'CHECKLIST_ITEM_EXECUTED',
      itemId: checklistItemId,
      discussionId: discussionId,
      sectorId: sectorId,
      timestamp: timestamp,
      executedAt: executedAt,
      action: action,
      amount: impact,
      impact: impact,
      delta: delta,
      price: price,
      success: executionResult.success !== false
    };

    console.log(`[ExecutionEngine] Executed checklist item ${checklistItemId}:`, executionEvent);

    return {
      success: executionResult.success !== false,
      itemId: checklistItemId,
      discussionId: discussionId,
      sectorId: sectorId,
      executedAt: executedAt,
      impact: impact,
      delta: delta,
      timestamp: timestamp,
      action: action,
      amount: impact,
      price: price,
      event: executionEvent
    };
  }

  /**
   * Handle checklist item status transition - execute if item transitions to APPROVED
   * This is the main trigger for execution - called whenever an item's status changes to APPROVED
   * @param {string} checklistItemId - ID of the checklist item
   * @param {string} discussionId - Discussion ID containing the item
   * @param {string} previousStatus - Previous status of the item (optional)
   * @returns {Promise<Object>} Execution result or null if not executed
   */
  async handleItemStatusTransition(checklistItemId, discussionId, previousStatus = null) {
    if (!checklistItemId || !discussionId) {
      console.log(`[ExecutionEngine] handleItemStatusTransition called with invalid parameters: checklistItemId=${checklistItemId}, discussionId=${discussionId}`);
      return null;
    }

    try {
      // Load discussion to check current item status
      const discussionData = await findDiscussionById(discussionId);
      if (!discussionData) {
        console.warn(`[ExecutionEngine] Discussion ${discussionId} not found for item ${checklistItemId}`);
        return null;
      }

      const discussionRoom = DiscussionRoom.fromData(discussionData);
      const sectorId = discussionRoom.sectorId;
      
      // Find the checklist item
      let checklistItem = null;
      if (Array.isArray(discussionRoom.finalizedChecklist)) {
        checklistItem = discussionRoom.finalizedChecklist.find(item => item.id === checklistItemId);
      }
      if (!checklistItem && Array.isArray(discussionRoom.checklist)) {
        checklistItem = discussionRoom.checklist.find(item => item.id === checklistItemId);
      }

      if (!checklistItem) {
        console.warn(`[ExecutionEngine] Checklist item ${checklistItemId} not found in discussion ${discussionId}`);
        return null;
      }

      // Get current status
      const currentStatus = (checklistItem.status || '').toUpperCase();
      const normalizedPreviousStatus = previousStatus ? (previousStatus.toUpperCase()) : null;

      // Log execution trigger attempt
      console.log(`[ExecutionEngine] EXECUTION TRIGGER: Item ${checklistItemId} status transition from ${normalizedPreviousStatus || 'UNKNOWN'} to ${currentStatus} (discussionId=${discussionId}, sectorId=${sectorId})`);

      // Check if already executed (idempotent - prevent double execution)
      if (checklistItem.executedAt) {
        console.log(`[ExecutionEngine] EXECUTION BLOCKED: Item ${checklistItemId} already executed at ${checklistItem.executedAt}, skipping`);
        return {
          success: true,
          alreadyExecuted: true,
          executedAt: checklistItem.executedAt,
          itemId: checklistItemId,
          discussionId: discussionId,
          sectorId: sectorId
        };
      }

      // Block execution for PENDING status
      if (currentStatus === 'PENDING') {
        console.log(`[ExecutionEngine] EXECUTION BLOCKED: Item ${checklistItemId} has status PENDING - execution not allowed`);
        return {
          success: false,
          blocked: true,
          reason: 'Status is PENDING - execution blocked',
          itemId: checklistItemId,
          discussionId: discussionId,
          sectorId: sectorId,
          status: currentStatus
        };
      }

      // Block execution for REJECTED status
      if (currentStatus === 'REJECTED') {
        console.log(`[ExecutionEngine] EXECUTION BLOCKED: Item ${checklistItemId} has status REJECTED - execution not allowed`);
        return {
          success: false,
          blocked: true,
          reason: 'Status is REJECTED - execution blocked',
          itemId: checklistItemId,
          discussionId: discussionId,
          sectorId: sectorId,
          status: currentStatus
        };
      }

      // Only execute if status is APPROVED
      if (currentStatus !== 'APPROVED') {
        console.log(`[ExecutionEngine] EXECUTION BLOCKED: Item ${checklistItemId} has status ${currentStatus} (not APPROVED) - execution not allowed`);
        return {
          success: false,
          blocked: true,
          reason: `Status is ${currentStatus} - only APPROVED items can be executed`,
          itemId: checklistItemId,
          discussionId: discussionId,
          sectorId: sectorId,
          status: currentStatus
        };
      }

      // Skip if previous status was also APPROVED (no transition)
      if (normalizedPreviousStatus === 'APPROVED') {
        console.log(`[ExecutionEngine] EXECUTION SKIPPED: Item ${checklistItemId} was already APPROVED (no transition detected)`);
        return {
          success: false,
          skipped: true,
          reason: 'No status transition - item was already APPROVED',
          itemId: checklistItemId,
          discussionId: discussionId,
          sectorId: sectorId
        };
      }

      // Create EXECUTION_REQUESTED event
      const executionRequestedEvent = {
        type: 'EXECUTION_REQUESTED',
        checklistItemId: checklistItemId,
        discussionId: discussionId,
        sectorId: sectorId,
        previousStatus: normalizedPreviousStatus,
        currentStatus: currentStatus,
        timestamp: new Date().toISOString(),
        item: {
          id: checklistItem.id,
          action: checklistItem.action,
          amount: checklistItem.amount,
          status: currentStatus
        }
      };

      console.log(`[ExecutionEngine] EXECUTION REQUESTED: ${JSON.stringify(executionRequestedEvent)}`);

      // Execute the item
      console.log(`[ExecutionEngine] EXECUTING: Item ${checklistItemId} transitioned to APPROVED, starting execution...`);
      const result = await this.executeChecklistItem(checklistItemId, discussionId);
      
      // Add execution event to result
      if (result) {
        result.executionRequestedEvent = executionRequestedEvent;
      }
      
      console.log(`[ExecutionEngine] EXECUTION COMPLETE: Item ${checklistItemId} execution finished with success=${result?.success}`);
      return result;
    } catch (error) {
      console.error(`[ExecutionEngine] EXECUTION ERROR: Error handling status transition for item ${checklistItemId}:`, error);
      // Don't throw - return error result instead
      return {
        success: false,
        error: error.message,
        itemId: checklistItemId,
        discussionId: discussionId
      };
    }
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
    const executionId = uuidv4(); // Single execution ID for this checklist execution

    // Track price before execution for each item
    let priceBeforeItem = startingPrice;

    // Process each checklist item
    for (const item of checklistItems) {
      // Skip items that are already executed (prevent double execution)
      if (item.executedAt) {
        console.log(`[ExecutionEngine] Skipping item ${item.id || 'unknown'}: already executed at ${item.executedAt}`);
        continue;
      }

      // Skip items that are not approved
      const itemStatus = (item.status || '').toUpperCase();
      if (itemStatus !== 'APPROVED' && itemStatus !== 'approved') {
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
      const executionPrice = sectorState.currentPrice; // Capture price at execution time
      const priceBeforeExecution = priceBeforeItem; // Price before this item's execution
      const valuationBeforeExecution = sectorState.balance + getHoldingsTotal(); // Total value before execution

      try {
        switch (action) {
          case 'buy':
            // FAILSAFE: Reject execution if funds < allocation or amount <= 0
            if (amount <= 0) {
              tradeResults.push({
                itemId: item.id || null,
                action: 'buy',
                actionType: 'BUY',
                amount: amount,
                allocation: amount,
                price: executionPrice,
                success: false,
                reason: 'Invalid amount: must be greater than 0'
              });
              break;
            }

            // FAILSAFE: Reject execution if insufficient balance (never allow negative balance)
            if (sectorState.balance < amount) {
              tradeResults.push({
                itemId: item.id || null,
                action: 'buy',
                actionType: 'BUY',
                amount: amount,
                allocation: amount,
                price: executionPrice,
                success: false,
                reason: `Insufficient balance: ${sectorState.balance.toFixed(2)} < ${amount.toFixed(2)}`
              });
              break;
            }

            // Execute BUY: Deduct allocation from sector cash balance
            sectorState.balance -= amount; // Update balance (single source of truth)
            sectorState.position += amount;
            sectorState.holdings.position = sectorState.position;

            // Update allocation state: investedCapital += allocation, availableCapital -= allocation
            if (!sectorState.performance) {
              sectorState.performance = {};
            }
            sectorState.performance.investedCapital = (sectorState.performance.investedCapital || 0) + amount;
            sectorState.performance.availableCapital = sectorState.balance; // Available capital = remaining balance

            // Record execution with all required fields: timestamp, sectorId, amount, price
            tradeResults.push({
              itemId: item.id || null,
              action: 'buy',
              actionType: 'BUY',
              amount: amount,
              allocation: amount,
              price: executionPrice,
              timestamp: timestamp,
              sectorId: sectorId,
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
            break;

          case 'sell':
            // FAILSAFE: Reject execution if insufficient position
            if (amount <= 0) {
              tradeResults.push({
                itemId: item.id || null,
                action: 'sell',
                actionType: 'SELL',
                amount: amount,
                allocation: amount,
                price: executionPrice,
                success: false,
                reason: 'Invalid amount: must be greater than 0'
              });
              break;
            }

            if (sectorState.position < amount) {
              tradeResults.push({
                itemId: item.id || null,
                action: 'sell',
                actionType: 'SELL',
                amount: amount,
                allocation: amount,
                price: executionPrice,
                success: false,
                reason: `Insufficient position: ${sectorState.position.toFixed(2)} < ${amount.toFixed(2)}`
              });
              break;
            }

            sectorState.balance += amount; // Update balance (single source of truth)
            sectorState.position -= amount;
            sectorState.holdings.position = sectorState.position;

            // Update allocation state: investedCapital -= amount, availableCapital += amount
            if (!sectorState.performance) {
              sectorState.performance = {};
            }
            sectorState.performance.investedCapital = Math.max(0, (sectorState.performance.investedCapital || 0) - amount);
            sectorState.performance.availableCapital = sectorState.balance; // Available capital = remaining balance

            tradeResults.push({
              itemId: item.id || null,
              action: 'sell',
              actionType: 'SELL',
              amount: amount,
              allocation: amount,
              price: executionPrice,
              timestamp: timestamp,
              sectorId: sectorId,
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
            break;

          case 'hold':
            // Do nothing for hold, but still track price
            tradeResults.push({
              itemId: item.id || null,
              action: 'hold',
              actionType: 'HOLD',
              amount: 0,
              allocation: 0,
              price: executionPrice,
              timestamp: timestamp,
              sectorId: sectorId,
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
                actionType: 'REBALANCE',
                amount: totalValue,
                allocation: totalValue,
                price: executionPrice,
                timestamp: timestamp,
                sectorId: sectorId,
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
                actionType: 'REBALANCE',
                amount: 0,
                allocation: 0,
                price: executionPrice,
                timestamp: timestamp,
                sectorId: sectorId,
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
          const priceBeforeAction = sectorState.currentPrice;
          const positionValueBefore = sectorState.position; // Position value before execution
          
          // Pass execution amount for BUY/SELL to calculate valuation delta
          const executionAmount = (executedAction === 'BUY' || executedAction === 'SELL') ? amount : 0;
          await this.applyPriceUpdateForAction(sector, sectorState, executedAction, executionAmount);
          const priceAfterAction = sectorState.currentPrice;
          
          // Calculate position value after execution
          const positionValueAfter = sectorState.position; // Position value after execution
          
          // Calculate valuation delta: change in total portfolio value
          const valuationAfter = sectorState.balance + positionValueAfter;
          const deltaValue = valuationAfter - valuationBeforeExecution;
          
          // Store price change and valuation metrics in the trade result for logging
          const lastResult = tradeResults[tradeResults.length - 1];
          if (lastResult && lastResult.success) {
            lastResult.priceBefore = priceBeforeAction;
            lastResult.priceAfter = priceAfterAction;
            lastResult.priceChange = priceAfterAction - priceBeforeAction;
            lastResult.valuationBefore = valuationBeforeExecution;
            lastResult.valuationAfter = valuationAfter;
            lastResult.valuationDelta = deltaValue;
            lastResult.deltaValue = deltaValue; // Emit deltaValue
            lastResult.newPositionValue = positionValueAfter; // Emit newPositionValue
          }
          
          // Update price tracking for next item
          priceBeforeItem = sectorState.currentPrice;
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

    // Ensure investedCapital and availableCapital are tracked
    const investedCapital = sectorState.performance?.investedCapital || currentPosition;
    const availableCapital = sectorState.balance;

    sectorState.performance = {
      ...sectorState.performance,
      totalPL: (sectorState.performance.totalPL || 0) + pnl,
      pnl: pnl,
      pnlPercent: pnlPercent,
      position: currentPosition,
      capital: sectorState.balance, // Keep for backward compatibility in performance tracking
      investedCapital: investedCapital, // Track invested capital
      availableCapital: availableCapital, // Track available capital
      totalValue: currentTotalValue,
      lastUpdated: timestamp
    };

    // Recalculate utilization
    // Utilization = (position / total value) * 100
    const totalValue = sectorState.balance + getHoldingsTotal();
    sectorState.utilization = totalValue > 0 
      ? (currentPosition / totalValue) * 100 
      : 0;

    // Ensure the latest balance/positions snapshot is persisted alongside the final price
    // FAILSAFE: Never allow negative balance
    const finalBalance = Math.max(0, sectorState.balance);
    if (sectorState.balance !== finalBalance) {
      console.warn(`[ExecutionEngine] Corrected negative balance for sector ${sectorId}: ${sectorState.balance} -> ${finalBalance}`);
      sectorState.balance = finalBalance;
      sectorState.performance.availableCapital = finalBalance;
    }

    // Calculate final valuation as balance + position (ensures consistency)
    // Valuation changes ONLY when checklist items are executed
    const finalValuation = finalBalance + currentPosition;
    
    // Price is already updated per executed item via applyPriceUpdateForAction.
    // Recalculate to ensure consistency with balance + position
    const previousPrice = startingPrice || sector.currentPrice || sector.simulatedPrice || sector.lastSimulatedPrice || 100;
    const newPrice = finalValuation; // Use calculated valuation, not sectorState.currentPrice
    const priceChangePercent = previousPrice > 0 ? ((newPrice - previousPrice) / previousPrice) * 100 : 0;

    // Update sectorState.currentPrice to match calculated valuation
    sectorState.currentPrice = newPrice;

    const updates = {
      balance: finalBalance,
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

    // Append execution log entry with execution records
    // Every execution produces: execution record, timestamp, sectorId, amount, price at execution time
    const executedTrades = tradeResults.filter(r => r.success && (r.action === 'buy' || r.action === 'sell'));
    const executionRecords = executedTrades.map(trade => ({
      id: uuidv4(),
      timestamp: trade.timestamp || timestamp,
      sectorId: trade.sectorId || sectorId,
      amount: trade.amount,
      allocation: trade.allocation || trade.amount,
      price: trade.price,
      action: trade.actionType || trade.action,
      itemId: trade.itemId
    }));

    const logEntry = {
      id: uuidv4(),
      sectorId: sectorId,
      checklistId: checklistId || null,
      timestamp: timestamp,
      results: tradeResults,
      executionRecords: executionRecords // Include execution records with price
    };

    await this._appendExecutionLog(logEntry);

    // Create individual ExecutionLog entries for EACH executed checklist item
    // This ensures every executed item creates a persistent execution log entry
    const ExecutionLog = require('../models/ExecutionLog');
    
    // Get sector agents for confidence snapshot
    const sectorAgents = allAgents.filter(agent => agent && agent.sectorId === sectorId);
    
    // Map checklist items by ID for quick lookup
    const itemMap = new Map();
    checklistItems.forEach(item => {
      if (item && item.id) {
        itemMap.set(item.id, item);
      }
    });
    
    // Track execution log IDs for each item
    const executionLogIdMap = new Map();
    
    for (const result of tradeResults) {
      if (result.success && result.action) {
        const action = (result.action || result.actionType || '').toUpperCase();
        
        // Get the corresponding checklist item to extract additional metadata
        const item = result.itemId ? itemMap.get(result.itemId) : null;
        
        try {
          // Calculate price impact: change in price due to this action
          // Use the price change tracked during execution
          let basePriceImpact = typeof result.priceChange === 'number' 
            ? result.priceChange 
            : (typeof result.priceAfter === 'number' && typeof result.priceBefore === 'number'
              ? result.priceAfter - result.priceBefore
              : 0);
          
          // Capture confidence snapshot for future ML analysis
          const confidenceSnapshot = captureConfidenceSnapshot(sectorAgents, null);
          
          // Calculate confidence multiplier (returns null if feature disabled)
          const confidenceMultiplier = calculateConfidenceMultiplier(confidenceSnapshot, action);
          
          // Apply confidence multiplier to price impact (if feature enabled)
          const adjustedPriceImpact = applyConfidenceMultiplier(basePriceImpact, confidenceMultiplier);
          
          // Calculate valuation delta: change in total portfolio value
          // Use the valuation delta tracked during execution
          const valuationDelta = typeof result.valuationDelta === 'number'
            ? result.valuationDelta
            : (typeof result.valuationAfter === 'number' && typeof result.valuationBefore === 'number'
              ? result.valuationAfter - result.valuationBefore
              : 0);
          
          // Calculate allocation percent if total value is available
          let allocationPercent = null;
          if (result.amount && typeof result.valuationBefore === 'number' && result.valuationBefore > 0) {
            allocationPercent = (result.amount / result.valuationBefore) * 100;
          }
          
          // Create execution log entry with all required fields including confidence data
          const executionLog = new ExecutionLog({
            executionId: executionId,
            discussionId: checklistId || null,
            checklistItemId: result.itemId || item?.id || null,
            sectorId: sectorId,
            action: action,
            allocation: result.amount || result.allocation || null,
            allocationPercent: allocationPercent,
            priceImpact: adjustedPriceImpact, // Use adjusted price impact (with multiplier if enabled)
            valuationDelta: valuationDelta,
            deltaValue: typeof result.deltaValue === 'number' ? result.deltaValue : valuationDelta,
            newPositionValue: typeof result.newPositionValue === 'number' ? result.newPositionValue : null,
            timestamp: timestamp,
            confidenceSnapshot: confidenceSnapshot,
            confidenceMultiplier: confidenceMultiplier
          });
          
          await executionLog.save();
          
          // Store execution log ID for this item
          if (result.itemId) {
            executionLogIdMap.set(result.itemId, executionLog.id);
          }
        } catch (logError) {
          console.warn(`[ExecutionEngine] Failed to create ExecutionLog for ${action} (item ${result.itemId}):`, logError.message);
          // Don't throw - logging failure shouldn't break execution
        }
      }
    }
    
    // Mark executed items as EXECUTED and update discussion if checklistId is provided
    if (checklistId) {
      try {
        const discussionData = await findDiscussionById(checklistId);
        if (discussionData) {
          const discussionRoom = DiscussionRoom.fromData(discussionData);
          const executedAt = new Date().toISOString();
          let updated = false;
          
          // Update items in finalizedChecklist
          if (Array.isArray(discussionRoom.finalizedChecklist)) {
            for (const item of discussionRoom.finalizedChecklist) {
              if (item && item.id && executionLogIdMap.has(item.id)) {
                // Only mark as EXECUTED if it was successfully executed
                const result = tradeResults.find(r => r.itemId === item.id && r.success);
                if (result) {
                  item.executedAt = executedAt;
                  item.status = 'EXECUTED';
                  item.executionLogId = executionLogIdMap.get(item.id);
                  updated = true;
                }
              }
            }
          }
          
          // Update items in checklist
          if (Array.isArray(discussionRoom.checklist)) {
            for (const item of discussionRoom.checklist) {
              if (item && item.id && executionLogIdMap.has(item.id)) {
                // Only mark as EXECUTED if it was successfully executed
                const result = tradeResults.find(r => r.itemId === item.id && r.success);
                if (result) {
                  item.executedAt = executedAt;
                  item.status = 'EXECUTED';
                  item.executionLogId = executionLogIdMap.get(item.id);
                  updated = true;
                }
              }
            }
          }
          
          // Save updated discussion if any items were marked as executed
          if (updated) {
            await saveDiscussion(discussionRoom);
            console.log(`[ExecutionEngine] Marked ${executionLogIdMap.size} checklist items as EXECUTED in discussion ${checklistId}`);
            
            // Check if discussion should transition from AWAITING_EXECUTION to DECIDED
            // (all ACCEPTED items are now executed)
            try {
              const { checkAndTransitionToDecided } = require('../utils/discussionStatusService');
              await checkAndTransitionToDecided(checklistId);
            } catch (transitionError) {
              console.warn(`[ExecutionEngine] Failed to check transition to DECIDED:`, transitionError.message);
              // Don't throw - transition failure shouldn't break execution
            }
          }
        }
      } catch (updateError) {
        console.warn(`[ExecutionEngine] Failed to update discussion ${checklistId} with executed items:`, updateError.message);
        // Don't throw - update failure shouldn't break execution
      }
    }

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
   * Calculate valuation delta based on execution action
   * Valuation = balance + position
   * - BUY: increases position, valuation delta = +amount
   * - SELL: decreases position, valuation delta = -amount
   * - HOLD: no change, valuation delta = 0
   * - REBALANCE: redistributes, net delta = 0
   * @param {string} actionType - Action type (BUY, SELL, HOLD, REBALANCE)
   * @param {number} amount - Execution amount (for BUY/SELL)
   * @returns {number} Valuation delta
   */
  calculateValuationDelta(actionType, amount = 0) {
    const action = (actionType || '').toUpperCase();
    switch (action) {
      case 'BUY':
        return amount; // BUY increases exposure, increases valuation
      case 'SELL':
        return -amount; // SELL decreases exposure, decreases valuation
      case 'HOLD':
        return 0; // HOLD has zero valuation delta
      case 'REBALANCE':
        return 0; // REBALANCE redistributes but net delta = 0
      default:
        return 0;
    }
  }

  /**
   * Apply valuation update based on execution outcome
   * Valuation changes ONLY when a checklist item is executed
   * Valuation = cash + sum(positionValues) where positionValue = position amount
   * @param {Object} sector - Sector object
   * @param {Object} sectorState - Current sector state
   * @param {string} actionType - Action type (BUY, SELL, HOLD, REBALANCE)
   * @param {number} amount - Execution amount (for BUY/SELL)
   * @returns {Promise<Object>} Object with newValuation, deltaValue, newPositionValue
   */
  async applyPriceUpdateForAction(sector, sectorState, actionType, amount = 0) {
    // Calculate current valuation directly from balance (cash) + position value
    // Valuation = cash + sum(positionValues)
    // Position value is the current dollar amount of positions
    const currentBalance = typeof sectorState.balance === 'number' ? sectorState.balance : 0;
    const currentPosition = typeof sectorState.position === 'number' ? sectorState.position : 0;
    const positionValue = currentPosition; // Position value = position amount (in dollars)
    const newValuation = currentBalance + positionValue;
    
    // Ensure valuation never goes below 0
    const finalValuation = Math.max(0, newValuation);
    
    // Get previous valuation for change calculations
    const previousValuation = typeof sectorState.currentPrice === 'number' && sectorState.currentPrice > 0
      ? sectorState.currentPrice
      : (sector.currentPrice || (sector.balance || 0) + (sector.position || 0) || 100);

    // Get baseline price (price before this execution, used for change calculations)
    // Baseline price tracks market movements, not withdrawals
    const baselinePrice = typeof sector.baselinePrice === 'number' && sector.baselinePrice > 0
      ? sector.baselinePrice
      : (typeof sector.initialPrice === 'number' && sector.initialPrice > 0
        ? sector.initialPrice
        : previousValuation);

    // Calculate change/changePercent from baseline price (market movements only)
    // Only update if there's money in the sector
    let priceChange = 0;
    let priceChangePercent = 0;
    if (currentBalance > 0 && baselinePrice > 0) {
      priceChange = finalValuation - baselinePrice;
      priceChangePercent = (priceChange / baselinePrice) * 100;
    } else {
      // If no money, keep previous change values
      priceChange = typeof sector.change === 'number' ? sector.change : 0;
      priceChangePercent = typeof sector.changePercent === 'number' ? sector.changePercent : 0;
    }

    sectorState.currentPrice = finalValuation;
    // Update baseline price to new valuation after execution (market movement)
    const newBaselinePrice = finalValuation;
    
    const updates = {
      balance: sectorState.balance,
      holdings: sectorState.holdings,
      position: sectorState.position,
      positions: sectorState.position,
      currentPrice: finalValuation,
      simulatedPrice: finalValuation,
      lastSimulatedPrice: finalValuation,
      baselinePrice: newBaselinePrice, // Update baseline price with market movement
      lastPriceUpdate: Date.now(),
      change: priceChange,
      changePercent: priceChangePercent
    };

    await updateSector(sector.id, updates);

    // Store price tick for history
    try {
      await storePriceTick(sector.id, {
        price: finalValuation,
        timestamp: Date.now(),
        volume: sector.volume || 0,
        change: finalValuation - previousValuation,
        changePercent: previousValuation > 0 ? ((finalValuation - previousValuation) / previousValuation) * 100 : 0
      });
    } catch (tickError) {
      console.warn(`[ExecutionEngine] Failed to store price tick for sector ${sector.id}:`, tickError.message);
    }

    // Keep sector reference aligned for subsequent actions within the same execution
    sector.currentPrice = finalValuation;
    sector.balance = sectorState.balance;
    sector.holdings = sectorState.holdings;
    sector.position = sectorState.position;
    sector.positions = sectorState.position;

    // Return valuation metrics
    return {
      newValuation: finalValuation,
      deltaValue: finalValuation - previousValuation,
      newPositionValue: currentPosition
    };
  }

  /**
   * Update simulated price for a sector based on volatility, noise, trend, and manager impact
   * DEPRECATED: This method should NOT be used - it mutates prices randomly
   * Valuation ONLY changes due to executed checklist items (BUY/SELL/REBALANCE)
   * Price updates happen only in applyPriceUpdateForAction()
   * @param {Object} sector - Sector object
   * @param {Object} executionImpact - Execution impact object with managerImpact
   * @returns {Promise<number>} New simulated price (DEPRECATED - returns current price without updating)
   */
  async updateSimulatedPrice(sector, executionImpact) {
    // DEPRECATED: Do not update price here - valuation only changes on execution
    // Return current price without updating
    console.warn('[ExecutionEngine] updateSimulatedPrice called but is deprecated - valuation only changes on execution');
    return typeof sector.currentPrice === 'number' && sector.currentPrice > 0
      ? sector.currentPrice
      : (typeof sector.simulatedPrice === 'number' && sector.simulatedPrice > 0
        ? sector.simulatedPrice
        : 100);
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

        // Set agent status to EXECUTING if agentId is available
        if (item.agentId) {
          try {
            await setAgentExecuting(item.agentId, actionType);
          } catch (error) {
            console.warn(`[ExecutionEngine] Failed to update agent ${item.agentId} status to EXECUTING:`, error.message);
          }
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

        // After execution, refresh agent status (will set to DISCUSSING if in active discussion, or IDLE if not)
        if (item.agentId) {
          try {
            await refreshAgentStatus(item.agentId);
          } catch (error) {
            console.warn(`[ExecutionEngine] Failed to refresh agent ${item.agentId} status:`, error.message);
          }
        }

        // Store result with execution details (timestamp, sectorId, amount, price)
        executionResults.push({
          itemId: item.id,
          actionType: actionType,
          symbol: symbol,
          allocation: allocation,
          amount: allocation,
          success: result.success,
          reason: result.reason || 'Executed successfully',
          managerImpact: result.managerImpact || 0,
          price: result.price || sectorState.currentPrice || 0,
          timestamp: timestamp,
          sectorId: sectorId
        });

        // Remove item from execution list after successful execution
        if (result.success) {
          // Pass execution amount for BUY/SELL to calculate valuation delta
          const executionAmount = (actionType === 'BUY' || actionType === 'SELL') ? allocation : 0;
          const valuationBefore = sectorState.balance + sectorState.position;
          const positionValueBefore = sectorState.position;
          const valuationResult = await this.applyPriceUpdateForAction(sector, sectorState, actionType, executionAmount);
          
          // Update execution result with valuation metrics
          const lastResult = executionResults[executionResults.length - 1];
          if (lastResult && lastResult.success) {
            lastResult.deltaValue = valuationResult.deltaValue;
            lastResult.newPositionValue = valuationResult.newPositionValue;
            lastResult.valuationBefore = valuationBefore;
            lastResult.valuationAfter = valuationResult.newValuation;
            lastResult.valuationDelta = valuationResult.deltaValue;
          }
          
          await removeExecutionItem(managerId, item.id);
          console.log(`[ExecutionEngine] Executed ${actionType} on ${symbol} for manager ${managerId}.`);
          
          // Register BUY execution for price drift effect
          if (actionType === 'BUY') {
            try {
              const { registerBuyExecution } = require('../simulation/executionDrift');
              const confidence = typeof item.confidence === 'number' ? item.confidence : 0.5;
              registerBuyExecution(sectorId, timestamp, confidence);
            } catch (error) {
              console.warn(`[ExecutionEngine] Failed to register BUY execution for drift: ${error.message}`);
            }
          }
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

    // Ensure investedCapital and availableCapital are tracked
    const investedCapital = sectorState.performance?.investedCapital || sectorState.position;
    const availableCapital = sectorState.balance;

    sectorState.performance = {
      ...sectorState.performance,
      totalPL: (sectorState.performance.totalPL || 0) + pnl,
      pnl: pnl,
      pnlPercent: pnlPercent,
      position: sectorState.position,
      capital: sectorState.balance, // Keep for backward compatibility in performance tracking
      investedCapital: investedCapital, // Track invested capital
      availableCapital: availableCapital, // Track available capital
      totalValue: currentTotalValue,
      lastUpdated: timestamp
    };

    // Recalculate utilization
    const totalValue = sectorState.balance + sectorState.position;
    sectorState.utilization = totalValue > 0 
      ? (sectorState.position / totalValue) * 100 
      : 0;

    // Calculate final valuation as balance + position (ensures consistency)
    // Valuation changes ONLY when checklist items are executed
    const finalValuation = sectorState.balance + sectorState.position;
    
    const previousPrice = startingPrice || sector.currentPrice || sector.simulatedPrice || sector.lastSimulatedPrice || 100;
    const newPrice = finalValuation; // Use calculated valuation
    const priceChangePercent = previousPrice > 0 ? ((newPrice - previousPrice) / previousPrice) * 100 : 0;

    // Update sectorState.currentPrice to match calculated valuation
    sectorState.currentPrice = newPrice;

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

    // Generate execution log with execution records
    // Every execution produces: execution record, timestamp, sectorId, amount, price at execution time
    const executedTrades = executionResults.filter(r => r.success && (r.actionType === 'BUY' || r.actionType === 'SELL'));
    const executionRecords = executedTrades.map(trade => ({
      id: uuidv4(),
      timestamp: trade.timestamp || timestamp,
      sectorId: trade.sectorId || sectorId,
      amount: trade.amount || trade.allocation,
      allocation: trade.allocation,
      price: trade.price,
      action: trade.actionType,
      itemId: trade.itemId
    }));

    const logEntry = {
      id: uuidv4(),
      sectorId: sectorId,
      managerId: managerId,
      timestamp: timestamp,
      executionType: 'execution_list',
      results: executionResults,
      executionRecords: executionRecords // Include execution records with price
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
   * @returns {Promise<Object>} Result with success, reason, managerImpact, price, and execution details
   */
  async applySell(sectorState, amount, symbol) {
    // FAILSAFE: Reject execution if amount <= 0
    if (amount <= 0) {
      return { 
        success: false, 
        reason: 'Invalid amount: must be positive',
        price: sectorState.currentPrice || 0
      };
    }

    // FAILSAFE: Reject execution if insufficient position
    if (sectorState.position < amount) {
      return { 
        success: false, 
        reason: `Insufficient position: ${sectorState.position.toFixed(2)} < ${amount.toFixed(2)}`,
        price: sectorState.currentPrice || 0
      };
    }

    const executionPrice = sectorState.currentPrice || 0;

    sectorState.balance += amount; // Update balance (single source of truth)
    sectorState.position -= amount;

    // Update allocation state: investedCapital -= amount, availableCapital += amount
    if (!sectorState.performance) {
      sectorState.performance = {};
    }
    sectorState.performance.investedCapital = Math.max(0, (sectorState.performance.investedCapital || 0) - amount);
    sectorState.performance.availableCapital = sectorState.balance; // Available capital = remaining balance

    // Calculate manager impact: negative impact for sell orders
    const currentExposure = sectorState.position + amount; // Use position before sell
    const managerImpact = amount > 0 ? -(amount / Math.max(currentExposure, 1000)) * 0.001 : 0;

    return {
      success: true,
      reason: 'Sell executed successfully',
      managerImpact: managerImpact,
      price: executionPrice,
      amount: amount,
      allocation: amount
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

