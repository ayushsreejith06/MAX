const { findDiscussionById, saveDiscussion } = require('./discussionStorage');
const DiscussionRoom = require('../models/DiscussionRoom');
const { ChecklistStatus } = require('../core/state');

/**
 * Deadlock Detection Service
 * 
 * Detects and resolves deadlocks where checklist items remain PENDING after:
 * - Manager evaluation pass
 * - Discussion status change attempt
 * 
 * Resolution process:
 * 1. Force manager reevaluation
 * 2. If still unresolved, auto-REJECT with reason "Deadlock resolution"
 */

// Track deadlock detection attempts per item
const deadlockAttempts = new Map(); // itemId -> attemptCount

/**
 * Log deadlock resolution
 * @param {string} checklistItemId - ID of the checklist item
 * @param {number} timePending - Time in milliseconds the item was pending
 * @param {string} resolutionMethod - Method used to resolve deadlock
 */
function logDeadlockResolution(checklistItemId, timePending, resolutionMethod) {
  const logEntry = {
    checklistItemId,
    timePending,
    timePendingSeconds: Math.round(timePending / 1000),
    resolutionMethod,
    timestamp: new Date().toISOString()
  };
  
  console.log(`[DeadlockDetection] Resolution logged:`, logEntry);
  
  // TODO: Consider persisting to a dedicated log file or database table
  // For now, we log to console
}

/**
 * Check if a checklist item is in PENDING state
 * @param {Object} item - Checklist item
 * @returns {boolean} True if item is PENDING
 */
function isPendingItem(item) {
  if (!item) return false;
  const status = (item.status || '').toUpperCase();
  return !status || status === ChecklistStatus.PENDING || status === 'RESUBMITTED';
}

/**
 * Calculate time pending for a checklist item
 * @param {Object} item - Checklist item
 * @param {number} currentTime - Current timestamp in milliseconds
 * @returns {number} Time pending in milliseconds
 */
function calculateTimePending(item, currentTime) {
  if (!item) return 0;
  
  // Use createdAt if available, otherwise use current time as fallback
  const itemCreatedAt = item.createdAt ? new Date(item.createdAt).getTime() : currentTime;
  const itemUpdatedAt = item.updatedAt ? new Date(item.updatedAt).getTime() : itemCreatedAt;
  
  // Use the most recent timestamp
  const itemTimestamp = Math.max(itemCreatedAt, itemUpdatedAt);
  
  return currentTime - itemTimestamp;
}

/**
 * Force manager reevaluation for a specific item
 * @param {string} discussionId - Discussion ID
 * @param {string} itemId - Checklist item ID
 * @param {Object} ManagerEngine - ManagerEngine instance
 * @returns {Promise<boolean>} True if item was resolved after reevaluation
 */
async function forceManagerReevaluation(discussionId, itemId, ManagerEngine) {
  try {
    console.log(`[DeadlockDetection] Forcing manager reevaluation for item ${itemId} in discussion ${discussionId}`);
    
    // Reload discussion to get latest state
    const discussionData = await findDiscussionById(discussionId);
    if (!discussionData) {
      console.error(`[DeadlockDetection] Discussion ${discussionId} not found`);
      return false;
    }
    
    const discussionRoom = DiscussionRoom.fromData(discussionData);
    const item = discussionRoom.checklist?.find(i => i.id === itemId);
    
    if (!item) {
      console.error(`[DeadlockDetection] Item ${itemId} not found in discussion ${discussionId}`);
      return false;
    }
    
    // Check if item is still pending
    if (!isPendingItem(item)) {
      console.log(`[DeadlockDetection] Item ${itemId} is no longer PENDING (status: ${item.status}), skipping reevaluation`);
      return true; // Already resolved
    }
    
    // Force reevaluation by calling managerEvaluateChecklist
    // This will re-evaluate all pending items, including this one
    await ManagerEngine.managerEvaluateChecklist(discussionId);
    
    // Reload discussion after reevaluation
    const updatedDiscussionData = await findDiscussionById(discussionId);
    if (!updatedDiscussionData) {
      return false;
    }
    
    const updatedDiscussionRoom = DiscussionRoom.fromData(updatedDiscussionData);
    const updatedItem = updatedDiscussionRoom.checklist?.find(i => i.id === itemId);
    
    if (!updatedItem) {
      return false;
    }
    
    // Check if item is still pending after reevaluation
    const stillPending = isPendingItem(updatedItem);
    
    if (!stillPending) {
      console.log(`[DeadlockDetection] Item ${itemId} resolved after forced reevaluation (new status: ${updatedItem.status})`);
      return true;
    }
    
    console.warn(`[DeadlockDetection] Item ${itemId} still PENDING after forced reevaluation`);
    return false;
  } catch (error) {
    console.error(`[DeadlockDetection] Error during forced manager reevaluation for item ${itemId}:`, error.message);
    return false;
  }
}

/**
 * Auto-reject a checklist item with deadlock resolution reason
 * @param {string} discussionId - Discussion ID
 * @param {string} itemId - Checklist item ID
 * @param {number} timePending - Time in milliseconds the item was pending
 * @returns {Promise<boolean>} True if item was successfully rejected
 */
async function autoRejectDeadlockedItem(discussionId, itemId, timePending) {
  try {
    console.log(`[DeadlockDetection] Auto-rejecting deadlocked item ${itemId} in discussion ${discussionId}`);
    
    // Reload discussion to get latest state
    const discussionData = await findDiscussionById(discussionId);
    if (!discussionData) {
      console.error(`[DeadlockDetection] Discussion ${discussionId} not found`);
      return false;
    }
    
    const discussionRoom = DiscussionRoom.fromData(discussionData);
    const itemIndex = discussionRoom.checklist?.findIndex(i => i.id === itemId);
    
    if (itemIndex === -1 || itemIndex === undefined) {
      console.error(`[DeadlockDetection] Item ${itemId} not found in discussion ${discussionId}`);
      return false;
    }
    
    const item = discussionRoom.checklist[itemIndex];
    
    // Check if item is still pending
    if (!isPendingItem(item)) {
      console.log(`[DeadlockDetection] Item ${itemId} is no longer PENDING (status: ${item.status}), skipping auto-reject`);
      return true; // Already resolved
    }
    
    // Auto-reject the item
    item.status = ChecklistStatus.REJECTED;
    item.managerReason = `Deadlock resolution: Item remained PENDING for ${Math.round(timePending / 1000)}s after manager evaluation and status change attempts.`;
    item.evaluatedAt = new Date().toISOString();
    item.updatedAt = item.evaluatedAt;
    
    // Add rejection reason
    item.rejectionReason = {
      reason: 'Deadlock resolution',
      timePending: timePending,
      timePendingSeconds: Math.round(timePending / 1000),
      resolutionMethod: 'auto-reject'
    };
    
    // Mark as terminal (no revision allowed for deadlock resolutions)
    item.status = 'ACCEPT_REJECTION';
    item.requiresRevision = false;
    
    // Update item in checklist
    discussionRoom.checklist[itemIndex] = item;
    discussionRoom.updatedAt = new Date().toISOString();
    
    // Save discussion
    await saveDiscussion(discussionRoom);
    
    // Log the resolution
    logDeadlockResolution(itemId, timePending, 'auto-reject');
    
    console.log(`[DeadlockDetection] Successfully auto-rejected deadlocked item ${itemId}`);
    return true;
  } catch (error) {
    console.error(`[DeadlockDetection] Error auto-rejecting deadlocked item ${itemId}:`, error.message);
    return false;
  }
}

/**
 * Detect and resolve deadlocks for PENDING checklist items
 * @param {string} discussionId - Discussion ID
 * @param {string} trigger - Trigger that caused the check ('manager_evaluation' or 'status_change')
 * @param {Object} ManagerEngine - ManagerEngine instance (required for forced reevaluation)
 * @returns {Promise<Array>} Array of resolved items with resolution details
 */
async function detectAndResolveDeadlocks(discussionId, trigger, ManagerEngine = null) {
  if (!discussionId) {
    throw new Error('discussionId is required');
  }
  
  if (!ManagerEngine && trigger === 'manager_evaluation') {
    // ManagerEngine is required for manager_evaluation trigger
    throw new Error('ManagerEngine instance is required for manager_evaluation trigger');
  }
  
  const resolvedItems = [];
  const currentTime = Date.now();
  
  try {
    // Load discussion
    const discussionData = await findDiscussionById(discussionId);
    if (!discussionData) {
      console.error(`[DeadlockDetection] Discussion ${discussionId} not found`);
      return resolvedItems;
    }
    
    const discussionRoom = DiscussionRoom.fromData(discussionData);
    
    // Check if discussion has checklist items
    if (!Array.isArray(discussionRoom.checklist) || discussionRoom.checklist.length === 0) {
      return resolvedItems; // No items to check
    }
    
    // Find all PENDING items
    const pendingItems = discussionRoom.checklist.filter(isPendingItem);
    
    if (pendingItems.length === 0) {
      return resolvedItems; // No pending items
    }
    
    console.log(`[DeadlockDetection] Checking ${pendingItems.length} PENDING items in discussion ${discussionId} (trigger: ${trigger})`);
    
    // Process each pending item
    for (const item of pendingItems) {
      const itemId = item.id;
      const timePending = calculateTimePending(item, currentTime);
      
      // Get deadlock attempt count for this item
      const attemptCount = deadlockAttempts.get(itemId) || 0;
      
      // Check if this item should be resolved
      // Items that remain PENDING after manager evaluation or status change should be resolved
      if (trigger === 'manager_evaluation' || trigger === 'status_change') {
        // Increment attempt count
        deadlockAttempts.set(itemId, attemptCount + 1);
        
        // First attempt: Force manager reevaluation
        if (attemptCount === 0 && ManagerEngine) {
          console.log(`[DeadlockDetection] First deadlock resolution attempt for item ${itemId}: forcing manager reevaluation`);
          
          const resolved = await forceManagerReevaluation(discussionId, itemId, ManagerEngine);
          
          if (resolved) {
            // Item was resolved after reevaluation
            deadlockAttempts.delete(itemId); // Clear attempt count
            resolvedItems.push({
              checklistItemId: itemId,
              timePending,
              resolutionMethod: 'forced_reevaluation',
              resolved: true
            });
            logDeadlockResolution(itemId, timePending, 'forced_reevaluation');
            continue;
          }
        }
        
        // Second attempt (or if ManagerEngine not available): Auto-reject
        if (attemptCount >= 1 || !ManagerEngine) {
          console.log(`[DeadlockDetection] Second deadlock resolution attempt for item ${itemId}: auto-rejecting`);
          
          const resolved = await autoRejectDeadlockedItem(discussionId, itemId, timePending);
          
          if (resolved) {
            // Item was auto-rejected
            deadlockAttempts.delete(itemId); // Clear attempt count
            resolvedItems.push({
              checklistItemId: itemId,
              timePending,
              resolutionMethod: 'auto-reject',
              resolved: true
            });
            continue;
          }
        }
      }
    }
    
    return resolvedItems;
  } catch (error) {
    console.error(`[DeadlockDetection] Error detecting and resolving deadlocks for discussion ${discussionId}:`, error.message);
    return resolvedItems;
  }
}

/**
 * Clear deadlock attempt tracking for an item (useful when item is manually resolved)
 * @param {string} itemId - Checklist item ID
 */
function clearDeadlockTracking(itemId) {
  deadlockAttempts.delete(itemId);
}

/**
 * Get deadlock attempt count for an item
 * @param {string} itemId - Checklist item ID
 * @returns {number} Attempt count
 */
function getDeadlockAttemptCount(itemId) {
  return deadlockAttempts.get(itemId) || 0;
}

module.exports = {
  detectAndResolveDeadlocks,
  clearDeadlockTracking,
  getDeadlockAttemptCount,
  logDeadlockResolution
};

