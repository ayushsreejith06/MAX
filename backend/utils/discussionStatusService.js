const { findDiscussionById, saveDiscussion } = require('./discussionStorage');
const DiscussionRoom = require('../models/DiscussionRoom');

/**
 * Discussion Status Service
 * 
 * Single authoritative source for discussion status transitions.
 * Enforces state machine: CREATED → IN_PROGRESS → AWAITING_EXECUTION → DECIDED → CLOSED
 * 
 * State Machine Rules:
 * - Status may only move forward (no backward transitions)
 * - CREATED: Initial state when discussion is created
 * - IN_PROGRESS: Discussion has started, agents are active
 * - AWAITING_EXECUTION: All checklist items are in terminal states (ACCEPTED/REJECTED), waiting for execution
 * - DECIDED: All ACCEPTED checklist items have been executed
 * - CLOSED: Discussion is finalized and archived
 */

// Valid status values (uppercase for consistency)
const STATUS = {
  CREATED: 'CREATED',
  IN_PROGRESS: 'IN_PROGRESS',
  AWAITING_EXECUTION: 'AWAITING_EXECUTION',
  DECIDED: 'DECIDED',
  CLOSED: 'CLOSED'
};

// Valid state transitions (from -> to)
const VALID_TRANSITIONS = {
  [STATUS.CREATED]: [STATUS.IN_PROGRESS, STATUS.CLOSED], // Can skip to CLOSED if failed
  [STATUS.IN_PROGRESS]: [STATUS.AWAITING_EXECUTION, STATUS.CLOSED], // Can close early if needed
  [STATUS.AWAITING_EXECUTION]: [STATUS.DECIDED, STATUS.CLOSED], // Can close early if needed
  [STATUS.DECIDED]: [STATUS.CLOSED],
  [STATUS.CLOSED]: [] // Terminal state - no transitions allowed
};

/**
 * Log status transition
 * @private
 */
function logTransition(discussionId, fromStatus, toStatus, reason = '') {
  const timestamp = new Date().toISOString();
  const logMessage = `[DiscussionStatusService] ${timestamp} - Discussion ${discussionId}: ${fromStatus} → ${toStatus}${reason ? ` (${reason})` : ''}`;
  console.log(logMessage);
  return logMessage;
}

/**
 * Check if all checklist items are in terminal approval states (ACCEPTED or REJECTED)
 * Terminal approval states: APPROVED (ACCEPTED), REJECTED, ACCEPT_REJECTION
 * Non-terminal states: PENDING, REVISE_REQUIRED, RESUBMITTED, or missing status
 * Note: EXECUTED is also terminal but indicates execution completion, not just approval
 * @param {Array} checklist - Array of checklist items
 * @returns {Object} { allTerminal: boolean, pendingItems: Array }
 */
function checkChecklistItemsTerminal(checklist) {
  if (!Array.isArray(checklist) || checklist.length === 0) {
    return { allTerminal: true, pendingItems: [] };
  }

  // Terminal approval states: APPROVED (ACCEPTED), REJECTED, ACCEPT_REJECTION, EXECUTED
  // EXECUTED is included as it's also a terminal state
  const terminalStatuses = ['APPROVED', 'REJECTED', 'ACCEPT_REJECTION', 'EXECUTED'];
  const pendingItems = [];

  for (const item of checklist) {
    const status = (item.status || '').toUpperCase();
    const isTerminal = terminalStatuses.includes(status);
    
    if (!isTerminal) {
      pendingItems.push({
        id: item.id || 'unknown',
        status: status || 'PENDING',
        action: item.action || item.actionType || 'unknown',
        symbol: item.symbol || 'unknown'
      });
    }
  }

  return {
    allTerminal: pendingItems.length === 0,
    pendingItems: pendingItems
  };
}

/**
 * Check if all ACCEPTED (APPROVED) checklist items have been executed
 * @param {Array} checklist - Array of checklist items
 * @returns {Object} { allExecuted: boolean, unexecutedItems: Array }
 */
function checkAcceptedItemsExecuted(checklist) {
  if (!Array.isArray(checklist) || checklist.length === 0) {
    return { allExecuted: true, unexecutedItems: [] };
  }

  const unexecutedItems = [];

  for (const item of checklist) {
    const status = (item.status || '').toUpperCase();
    // Items with status APPROVED are ACCEPTED items that need execution
    if (status === 'APPROVED') {
      unexecutedItems.push({
        id: item.id || 'unknown',
        status: status,
        action: item.action || item.actionType || 'unknown',
        symbol: item.symbol || 'unknown'
      });
    }
  }

  return {
    allExecuted: unexecutedItems.length === 0,
    unexecutedItems: unexecutedItems
  };
}

/**
 * Check if a status transition is valid
 * @param {string} fromStatus - Current status
 * @param {string} toStatus - Desired status
 * @returns {boolean} True if transition is valid
 */
function isValidTransition(fromStatus, toStatus) {
  // Normalize statuses to uppercase
  const from = (fromStatus || '').toUpperCase();
  const to = (toStatus || '').toUpperCase();
  
  // Map legacy statuses to canonical ones
  const statusMap = {
    'OPEN': STATUS.CREATED,
    'ACTIVE': STATUS.IN_PROGRESS,
    'IN_PROGRESS': STATUS.IN_PROGRESS,
    'AWAITING_EXECUTION': STATUS.AWAITING_EXECUTION,
    'DECIDED': STATUS.DECIDED,
    'CLOSED': STATUS.CLOSED,
    'FINALIZED': STATUS.CLOSED,
    'ARCHIVED': STATUS.CLOSED,
    'ACCEPTED': STATUS.CLOSED,
    'COMPLETED': STATUS.CLOSED
  };
  
  const normalizedFrom = statusMap[from] || from;
  const normalizedTo = statusMap[to] || to;
  
  // Same status is always valid (idempotent)
  if (normalizedFrom === normalizedTo) {
    return true;
  }
  
  // Check if transition is in valid transitions list
  const allowedTransitions = VALID_TRANSITIONS[normalizedFrom] || [];
  return allowedTransitions.includes(normalizedTo);
}

/**
 * Transition discussion status (with validation and logging)
 * @param {string} discussionId - Discussion ID
 * @param {string} newStatus - Target status
 * @param {string} reason - Optional reason for transition
 * @returns {Promise<Object>} Updated discussion
 * @throws {Error} If transition is invalid
 */
async function transitionStatus(discussionId, newStatus, reason = '') {
  if (!discussionId) {
    throw new Error('discussionId is required');
  }
  
  if (!newStatus) {
    throw new Error('newStatus is required');
  }
  
  // Load discussion
  const discussionData = await findDiscussionById(discussionId);
  if (!discussionData) {
    throw new Error(`Discussion ${discussionId} not found`);
  }
  
  const discussionRoom = DiscussionRoom.fromData(discussionData);
  const currentStatus = discussionRoom.status || STATUS.CREATED;
  const normalizedNewStatus = newStatus.toUpperCase();
  
  // Validate transition
  if (!isValidTransition(currentStatus, normalizedNewStatus)) {
    const error = `Invalid status transition: ${currentStatus} → ${normalizedNewStatus}`;
    logTransition(discussionId, currentStatus, normalizedNewStatus, `REJECTED: ${error}`);
    throw new Error(error);
  }
  
  // If status is already the target, return early (idempotent)
  const normalizedCurrentStatus = (currentStatus || '').toUpperCase();
  if (normalizedCurrentStatus === normalizedNewStatus) {
    return discussionRoom;
  }

  // VALIDATION: Transition to AWAITING_EXECUTION
  // A discussion can transition to AWAITING_EXECUTION when all checklist items are in terminal approval states
  if (normalizedNewStatus === STATUS.AWAITING_EXECUTION) {
    const hasChecklistItems = Array.isArray(discussionRoom.checklist) && discussionRoom.checklist.length > 0;
    const hasChecklistDraft = Array.isArray(discussionRoom.checklistDraft) && discussionRoom.checklistDraft.length > 0;
    
    if (!hasChecklistItems && !hasChecklistDraft) {
      const error = `Cannot transition discussion to AWAITING_EXECUTION: Discussion ${discussionId} has no checklist items.`;
      logTransition(discussionId, currentStatus, normalizedNewStatus, `REJECTED: ${error}`);
      throw new Error(error);
    }

    // All items must be in terminal approval states (ACCEPTED/REJECTED)
    if (hasChecklistItems) {
      const checklistCheck = checkChecklistItemsTerminal(discussionRoom.checklist);
      
      if (!checklistCheck.allTerminal) {
        const pendingItemIds = checklistCheck.pendingItems.map(item => item.id).join(', ');
        const pendingItemDetails = checklistCheck.pendingItems.map(item => 
          `  - ${item.id} (${item.status}): ${item.action} ${item.symbol || ''}`
        ).join('\n');
        
        const warning = `Cannot transition discussion to AWAITING_EXECUTION: Discussion ${discussionId} has ${checklistCheck.pendingItems.length} pending checklist item(s). All items must be in terminal states (APPROVED, REJECTED, or ACCEPT_REJECTION) before a discussion can be marked as AWAITING_EXECUTION.\nPending items:\n${pendingItemDetails}`;
        
        console.warn(`[DiscussionStatusService] ${warning}`);
        logTransition(discussionId, currentStatus, normalizedNewStatus, `REJECTED: ${warning}`);
        throw new Error(`Cannot transition to AWAITING_EXECUTION: ${checklistCheck.pendingItems.length} checklist item(s) still pending (IDs: ${pendingItemIds}).`);
      }
    }
  }

  // VALIDATION: Transition to DECIDED
  // A discussion can only transition to DECIDED if:
  // 1. All checklist items are in terminal approval states (ACCEPTED or REJECTED)
  // 2. All ACCEPTED (APPROVED) checklist items have execution.status === 'EXECUTED'
  if (normalizedNewStatus === STATUS.DECIDED) {
    const hasChecklistItems = Array.isArray(discussionRoom.checklist) && discussionRoom.checklist.length > 0;
    const hasChecklistDraft = Array.isArray(discussionRoom.checklistDraft) && discussionRoom.checklistDraft.length > 0;
    
    if (!hasChecklistItems && !hasChecklistDraft) {
      const error = `Cannot transition discussion to DECIDED: Discussion ${discussionId} has no checklist items. A discussion must have checklist items before it can be marked as DECIDED.`;
      logTransition(discussionId, currentStatus, normalizedNewStatus, `REJECTED: ${error}`);
      throw new Error(error);
    }
    
    // VALIDATION: Cannot transition to DECIDED if there are active refinement cycles
    // All rejected items must be resolved (either revised and approved, or accepted as rejection)
    const activeRefinementCycles = Array.isArray(discussionRoom.activeRefinementCycles) 
      ? discussionRoom.activeRefinementCycles 
      : [];
    
    if (activeRefinementCycles.length > 0) {
      // Check if all items in refinement cycles have been resolved
      const allItems = Array.isArray(discussionRoom.checklist) ? discussionRoom.checklist : [];
      const unresolvedCycles = activeRefinementCycles.filter(cycle => {
        // Check if there's a new item from the same agent that addresses this rejection
        // OR if the original item has been accepted as rejection
        const originalItem = allItems.find(item => item.id === cycle.itemId);
        if (originalItem) {
          const status = (originalItem.status || '').toUpperCase();
          // Item is resolved if it's ACCEPT_REJECTION or if there's a new APPROVED item from same agent
          if (status === 'ACCEPT_REJECTION') {
            return false; // Resolved
          }
        }
        
        // Check if there's a new APPROVED item from the same agent (revised proposal)
        const originalItemAgentId = cycle.originalItem?.sourceAgentId || cycle.originalItem?.agentId;
        if (originalItemAgentId) {
          const hasNewApprovedItem = allItems.some(item => {
            const itemAgentId = item.sourceAgentId || item.agentId;
            const itemStatus = (item.status || '').toUpperCase();
            return itemAgentId === originalItemAgentId && 
                   itemStatus === 'APPROVED' && 
                   item.id !== cycle.itemId; // Different item (new proposal)
          });
          if (hasNewApprovedItem) {
            return false; // Resolved - agent created new approved proposal
          }
        }
        
        return true; // Still unresolved
      });
      
      if (unresolvedCycles.length > 0) {
        const error = `Cannot transition discussion to DECIDED: Discussion ${discussionId} has ${unresolvedCycles.length} active refinement cycle(s). All rejected items must be resolved (revised and approved, or accepted as rejection) before the discussion can be marked as DECIDED.`;
        logTransition(discussionId, currentStatus, normalizedNewStatus, `REJECTED: ${error}`);
        throw new Error(error);
      }
    }

    if (hasChecklistItems) {
      // First check: All items must be in terminal approval states
      const checklistCheck = checkChecklistItemsTerminal(discussionRoom.checklist);
      
      if (!checklistCheck.allTerminal) {
        const pendingItemIds = checklistCheck.pendingItems.map(item => item.id).join(', ');
        const pendingItemDetails = checklistCheck.pendingItems.map(item => 
          `  - ${item.id} (${item.status}): ${item.action} ${item.symbol || ''}`
        ).join('\n');
        
        const warning = `Cannot transition discussion to DECIDED: Discussion ${discussionId} has ${checklistCheck.pendingItems.length} pending checklist item(s). All items must be in terminal states (APPROVED, REJECTED, or ACCEPT_REJECTION) before a discussion can be marked as DECIDED.\nPending items:\n${pendingItemDetails}`;
        
        console.warn(`[DiscussionStatusService] ${warning}`);
        logTransition(discussionId, currentStatus, normalizedNewStatus, `REJECTED: ${warning}`);
        throw new Error(`Cannot transition to DECIDED: ${checklistCheck.pendingItems.length} checklist item(s) still pending (IDs: ${pendingItemIds}).`);
      }

      // Second check: All ACCEPTED (APPROVED) items must be EXECUTED
      const executionCheck = checkAcceptedItemsExecuted(discussionRoom.checklist);
      
      if (!executionCheck.allExecuted) {
        const unexecutedItemIds = executionCheck.unexecutedItems.map(item => item.id).join(', ');
        const unexecutedItemDetails = executionCheck.unexecutedItems.map(item => 
          `  - ${item.id} (${item.status}): ${item.action} ${item.symbol || ''}`
        ).join('\n');
        
        const warning = `Cannot transition discussion to DECIDED: Discussion ${discussionId} has ${executionCheck.unexecutedItems.length} ACCEPTED (APPROVED) checklist item(s) that have not been executed. All ACCEPTED items must have execution.status === 'EXECUTED' before a discussion can be marked as DECIDED.\nUnexecuted items:\n${unexecutedItemDetails}`;
        
        console.warn(`[DiscussionStatusService] ${warning}`);
        logTransition(discussionId, currentStatus, normalizedNewStatus, `REJECTED: ${warning}`);
        throw new Error(`Cannot transition to DECIDED: ${executionCheck.unexecutedItems.length} ACCEPTED checklist item(s) not yet executed (IDs: ${unexecutedItemIds}). Discussion must be in AWAITING_EXECUTION state until all ACCEPTED items are executed.`);
      }
    }
  }
  
  // Log transition
  logTransition(discussionId, currentStatus, normalizedNewStatus, reason);
  
  // Update status
  discussionRoom.status = normalizedNewStatus;
  discussionRoom.updatedAt = new Date().toISOString();
  
  // Set timestamps based on status
  if (normalizedNewStatus === STATUS.DECIDED && !discussionRoom.decidedAt) {
    discussionRoom.decidedAt = new Date().toISOString();
  }
  
  if (normalizedNewStatus === STATUS.CLOSED && !discussionRoom.discussionClosedAt) {
    discussionRoom.discussionClosedAt = new Date().toISOString();
  }
  
  // Save discussion
  await saveDiscussion(discussionRoom);
  
  // If discussion is being closed, refresh agent statuses
  // Agents should be set to IDLE if they're not in any other active discussions
  if (normalizedNewStatus === STATUS.CLOSED) {
    try {
      const { refreshAgentStatus } = require('./agentStatusService');
      const agentIds = Array.isArray(discussionRoom.agentIds) ? discussionRoom.agentIds : [];
      
      // Refresh status for all agents in this discussion
      await Promise.allSettled(
        agentIds.map(agentId => refreshAgentStatus(agentId))
      );
      
      console.log(`[DiscussionStatusService] Refreshed status for ${agentIds.length} agents after closing discussion ${discussionId}`);
    } catch (error) {
      console.warn(`[DiscussionStatusService] Failed to refresh agent statuses after closing discussion:`, error.message);
    }
  }
  
  return discussionRoom;
}

/**
 * Get current status of a discussion
 * @param {string} discussionId - Discussion ID
 * @returns {Promise<string>} Current status
 */
async function getStatus(discussionId) {
  const discussionData = await findDiscussionById(discussionId);
  if (!discussionData) {
    throw new Error(`Discussion ${discussionId} not found`);
  }
  
  const discussionRoom = DiscussionRoom.fromData(discussionData);
  return (discussionRoom.status || STATUS.CREATED).toUpperCase();
}

/**
 * Check if discussion is in a specific status
 * @param {string} discussionId - Discussion ID
 * @param {string} status - Status to check
 * @returns {Promise<boolean>} True if discussion is in the specified status
 */
async function isStatus(discussionId, status) {
  const currentStatus = await getStatus(discussionId);
  const normalizedStatus = (status || '').toUpperCase();
  return currentStatus === normalizedStatus;
}

/**
 * Normalize legacy status values to canonical statuses
 * @param {string} status - Status to normalize
 * @returns {string} Normalized status
 */
function normalizeStatus(status) {
  if (!status) return STATUS.CREATED;
  
  const statusUpper = (status || '').toUpperCase();
  const statusMap = {
    'OPEN': STATUS.CREATED,
    'CREATED': STATUS.CREATED,
    'ACTIVE': STATUS.IN_PROGRESS,
    'IN_PROGRESS': STATUS.IN_PROGRESS,
    'AWAITING_EXECUTION': STATUS.AWAITING_EXECUTION,
    'DECIDED': STATUS.DECIDED,
    'CLOSED': STATUS.CLOSED,
    'FINALIZED': STATUS.CLOSED,
    'ARCHIVED': STATUS.CLOSED,
    'ACCEPTED': STATUS.CLOSED,
    'COMPLETED': STATUS.CLOSED
  };
  
  return statusMap[statusUpper] || STATUS.CREATED;
}

/**
 * Check if discussion should transition to AWAITING_EXECUTION
 * Transitions to AWAITING_EXECUTION when all checklist items are in terminal approval states
 * @param {string} discussionId - Discussion ID
 * @returns {Promise<boolean>} True if transition was made or already in correct state
 */
async function checkAndTransitionToAwaitingExecution(discussionId) {
  try {
    const currentStatus = await getStatus(discussionId);
    
    // Only transition from IN_PROGRESS
    if (currentStatus !== STATUS.IN_PROGRESS) {
      return currentStatus === STATUS.AWAITING_EXECUTION || 
             currentStatus === STATUS.DECIDED || 
             currentStatus === STATUS.CLOSED;
    }
    
    const discussionData = await findDiscussionById(discussionId);
    if (!discussionData) {
      return false;
    }
    
    const discussionRoom = DiscussionRoom.fromData(discussionData);
    const hasChecklistItems = Array.isArray(discussionRoom.checklist) && discussionRoom.checklist.length > 0;
    
    if (!hasChecklistItems) {
      return false;
    }
    
    const checklistCheck = checkChecklistItemsTerminal(discussionRoom.checklist);
    
    if (checklistCheck.allTerminal) {
      await transitionStatus(discussionId, STATUS.AWAITING_EXECUTION, 'All checklist items in terminal states');
      return true;
    }
    
    return false;
  } catch (error) {
    console.warn(`[DiscussionStatusService] Error checking transition to AWAITING_EXECUTION:`, error.message);
    return false;
  }
}

/**
 * Check if discussion should transition from AWAITING_EXECUTION to DECIDED
 * Transitions to DECIDED when all ACCEPTED (APPROVED) items are EXECUTED
 * @param {string} discussionId - Discussion ID
 * @returns {Promise<boolean>} True if transition was made or already in correct state
 */
async function checkAndTransitionToDecided(discussionId) {
  try {
    const currentStatus = await getStatus(discussionId);
    
    // Only transition from AWAITING_EXECUTION
    if (currentStatus !== STATUS.AWAITING_EXECUTION) {
      return currentStatus === STATUS.DECIDED || currentStatus === STATUS.CLOSED;
    }
    
    const discussionData = await findDiscussionById(discussionId);
    if (!discussionData) {
      return false;
    }
    
    const discussionRoom = DiscussionRoom.fromData(discussionData);
    const hasChecklistItems = Array.isArray(discussionRoom.checklist) && discussionRoom.checklist.length > 0;
    
    if (!hasChecklistItems) {
      return false;
    }
    
    // Check if all items are terminal
    const checklistCheck = checkChecklistItemsTerminal(discussionRoom.checklist);
    if (!checklistCheck.allTerminal) {
      return false;
    }
    
    // Check if all ACCEPTED items are executed
    const executionCheck = checkAcceptedItemsExecuted(discussionRoom.checklist);
    
    if (executionCheck.allExecuted) {
      await transitionStatus(discussionId, STATUS.DECIDED, 'All ACCEPTED checklist items executed');
      return true;
    }
    
    return false;
  } catch (error) {
    console.warn(`[DiscussionStatusService] Error checking transition to DECIDED:`, error.message);
    return false;
  }
}

module.exports = {
  STATUS,
  transitionStatus,
  getStatus,
  isStatus,
  isValidTransition,
  normalizeStatus,
  checkAndTransitionToAwaitingExecution,
  checkAndTransitionToDecided,
  checkChecklistItemsTerminal,
  checkAcceptedItemsExecuted
};

