const { readDataFile, writeDataFile, atomicUpdate } = require('./persistence');

const REJECTED_ITEMS_FILE = 'rejectedItems.json';

/**
 * Load all rejected items from storage
 * @returns {Promise<Array>} Array of rejected items
 */
async function loadRejectedItems() {
  try {
    const data = await readDataFile(REJECTED_ITEMS_FILE);
    return Array.isArray(data) ? data : [];
  } catch (error) {
    // If file doesn't exist, return empty array and create it
    if (error.code === 'ENOENT') {
      await writeDataFile(REJECTED_ITEMS_FILE, []);
      return [];
    }
    throw error;
  }
}

/**
 * Save a rejected item to storage
 * @param {Object} rejectedItem - Rejected item object with required fields
 * @returns {Promise<void>}
 */
async function saveRejectedItem(rejectedItem) {
  await atomicUpdate(REJECTED_ITEMS_FILE, (items) => {
    // Check if item already exists (by id)
    const existingIndex = items.findIndex(item => item.id === rejectedItem.id);
    
    if (existingIndex >= 0) {
      // Update existing item
      items[existingIndex] = rejectedItem;
    } else {
      // Add new item
      items.push(rejectedItem);
    }
    
    return items;
  });
}

/**
 * Save multiple rejected items to storage
 * @param {Array<Object>} rejectedItems - Array of rejected item objects
 * @returns {Promise<void>}
 */
async function saveRejectedItems(rejectedItems) {
  if (!Array.isArray(rejectedItems) || rejectedItems.length === 0) {
    return;
  }
  
  await atomicUpdate(REJECTED_ITEMS_FILE, (items) => {
    // Ensure items is always an array
    if (!Array.isArray(items)) {
      items = [];
    }
    
    const existingIds = new Set(items.map(item => item.id));
    
    // Add new items that don't already exist
    rejectedItems.forEach(item => {
      if (!existingIds.has(item.id)) {
        items.push(item);
      }
    });
    
    return items;
  });
}

/**
 * Clear all rejected items (for testing/cleanup)
 * @returns {Promise<void>}
 */
async function clearRejectedItems() {
  await writeDataFile(REJECTED_ITEMS_FILE, []);
}

module.exports = {
  loadRejectedItems,
  saveRejectedItem,
  saveRejectedItems,
  clearRejectedItems
};

