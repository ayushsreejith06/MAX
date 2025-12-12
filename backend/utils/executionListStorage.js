const { loadAgents, updateAgent } = require('./agentStorage');
const { randomUUID } = require('crypto');

/**
 * Get manager agent by sector ID
 * @param {string} sectorId - Sector ID
 * @returns {Promise<Object|null>} Manager agent or null if not found
 */
async function getManagerBySectorId(sectorId) {
  const agents = await loadAgents();
  const manager = agents.find(agent => 
    agent && 
    agent.sectorId === sectorId &&
    (agent.role === 'manager' || (agent.role && agent.role.toLowerCase().includes('manager')))
  );
  return manager || null;
}

/**
 * Get manager agent by manager ID
 * @param {string} managerId - Manager agent ID
 * @returns {Promise<Object|null>} Manager agent or null if not found
 */
async function getManagerById(managerId) {
  const agents = await loadAgents();
  const manager = agents.find(agent => 
    agent && 
    agent.id === managerId &&
    (agent.role === 'manager' || (agent.role && agent.role.toLowerCase().includes('manager')))
  );
  return manager || null;
}

/**
 * Add an execution item to a manager's execution list
 * @param {string} managerId - Manager agent ID
 * @param {Object} executionItem - Execution item to add
 * @param {string} executionItem.actionType - Action type: 'BUY' | 'SELL' | 'HOLD' | 'REBALANCE'
 * @param {string} executionItem.symbol - Symbol/ticker
 * @param {number} executionItem.allocation - Allocation amount
 * @param {string} executionItem.generatedFromDiscussion - Discussion ID that generated this item
 * @returns {Promise<Object>} Updated execution item with ID and timestamp
 */
async function managerAddToExecutionList(managerId, executionItem) {
  if (!managerId) {
    throw new Error('Manager ID is required');
  }

  if (!executionItem || typeof executionItem !== 'object') {
    throw new Error('Execution item is required');
  }

  const { actionType, symbol, allocation, generatedFromDiscussion } = executionItem;

  if (!actionType || !['BUY', 'SELL', 'HOLD', 'REBALANCE'].includes(actionType)) {
    throw new Error('Invalid actionType. Must be one of: BUY, SELL, HOLD, REBALANCE');
  }

  if (!symbol || typeof symbol !== 'string') {
    throw new Error('Symbol is required and must be a string');
  }

  if (typeof allocation !== 'number' || allocation < 0) {
    throw new Error('Allocation must be a non-negative number');
  }

  if (!generatedFromDiscussion || typeof generatedFromDiscussion !== 'string') {
    throw new Error('generatedFromDiscussion (discussion ID) is required');
  }

  // Get manager
  const manager = await getManagerById(managerId);
  if (!manager) {
    throw new Error(`Manager with ID ${managerId} not found`);
  }

  // Create execution item with ID and timestamp
  const itemId = randomUUID();
  const executionItemWithMetadata = {
    id: itemId,
    actionType,
    symbol,
    allocation,
    generatedFromDiscussion,
    createdAt: Date.now()
  };

  // Get current execution list
  const currentExecutionList = Array.isArray(manager.executionList) ? manager.executionList : [];

  // Add new item to execution list
  const updatedExecutionList = [...currentExecutionList, executionItemWithMetadata];

  // Update manager
  await updateAgent(managerId, {
    executionList: updatedExecutionList
  });

  // Log the addition
  console.log(`[EXECUTION LIST] Manager ${managerId} added ${actionType} for ${symbol} to execution backlog from discussion ${generatedFromDiscussion}.`);

  return executionItemWithMetadata;
}

/**
 * Get execution list for a manager
 * @param {string} managerId - Manager agent ID
 * @returns {Promise<Array>} Array of execution items
 */
async function getExecutionList(managerId) {
  if (!managerId) {
    throw new Error('Manager ID is required');
  }

  const manager = await getManagerById(managerId);
  if (!manager) {
    throw new Error(`Manager with ID ${managerId} not found`);
  }

  return Array.isArray(manager.executionList) ? manager.executionList : [];
}

/**
 * Clear execution list for a manager
 * @param {string} managerId - Manager agent ID
 * @returns {Promise<boolean>} True if cleared successfully
 */
async function clearExecutionList(managerId) {
  if (!managerId) {
    throw new Error('Manager ID is required');
  }

  const manager = await getManagerById(managerId);
  if (!manager) {
    throw new Error(`Manager with ID ${managerId} not found`);
  }

  await updateAgent(managerId, {
    executionList: []
  });

  console.log(`[EXECUTION LIST] Cleared execution list for manager ${managerId}`);
  return true;
}

/**
 * Remove a specific execution item from a manager's execution list
 * @param {string} managerId - Manager agent ID
 * @param {string} itemId - Execution item ID to remove
 * @returns {Promise<boolean>} True if item was removed, false if not found
 */
async function removeExecutionItem(managerId, itemId) {
  if (!managerId) {
    throw new Error('Manager ID is required');
  }

  if (!itemId) {
    throw new Error('Item ID is required');
  }

  const manager = await getManagerById(managerId);
  if (!manager) {
    throw new Error(`Manager with ID ${managerId} not found`);
  }

  const currentExecutionList = Array.isArray(manager.executionList) ? manager.executionList : [];
  const itemIndex = currentExecutionList.findIndex(item => item.id === itemId);

  if (itemIndex === -1) {
    return false;
  }

  const updatedExecutionList = currentExecutionList.filter(item => item.id !== itemId);
  await updateAgent(managerId, {
    executionList: updatedExecutionList
  });

  console.log(`[EXECUTION LIST] Removed execution item ${itemId} from manager ${managerId}`);
  return true;
}

module.exports = {
  getManagerBySectorId,
  getManagerById,
  managerAddToExecutionList,
  getExecutionList,
  clearExecutionList,
  removeExecutionItem
};

