const { findDiscussionById, saveDiscussion, loadDiscussions } = require('./discussionStorage');
const DiscussionRoom = require('../models/DiscussionRoom');
const { DiscussionStatus } = require('../core/state');
const { detectAndResolveDeadlocks } = require('./deadlockDetectionService');

/**
 * Discussion Status Service
 * 
 * Single authoritative source for discussion status transitions.
 * Enforces state machine: IN_PROGRESS → DECIDED
 * 
 * State Machine Rules:
 * - Discussion starts → IN_PROGRESS
 * - Discussion ends → DECIDED
 * - No intermediate states
 * - All transitions are explicit and logged
 */

// Valid status values (uppercase for consistency)
const STATUS = {
  IN_PROGRESS: DiscussionStatus.IN_PROGRESS,
  DECIDED: DiscussionStatus.DECIDED
};

// Valid state transitions (from -> to)
const VALID_TRANSITIONS = {
  [STATUS.IN_PROGRESS]: [STATUS.DECIDED],
  [STATUS.DECIDED]: [] // Terminal state - no transitions allowed
};

/**
 * Log status transition
 * All transitions are explicitly logged for audit purposes
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
 * Count APPROVED checklist items
 * @param {Array} checklist - Array of checklist items
 * @returns {Object} { count: number, approvedItems: Array }
 */
function countApprovedItems(checklist) {
  if (!Array.isArray(checklist) || checklist.length === 0) {
    return { count: 0, approvedItems: [] };
  }

  const approvedItems = [];

  for (const item of checklist) {
    const status = (item.status || '').toUpperCase();
    if (status === 'APPROVED') {
      approvedItems.push({
        id: item.id || 'unknown',
        status: status,
        action: item.action || item.actionType || 'unknown',
        symbol: item.symbol || 'unknown'
      });
    }
  }

  return {
    count: approvedItems.length,
    approvedItems: approvedItems
  };
}

/**
 * Check if there is at least one terminal checklist item
 * Terminal states: APPROVED, REJECTED, ACCEPT_REJECTION, EXECUTED
 * @param {Array} checklist - Array of checklist items
 * @returns {Object} { hasTerminal: boolean, terminalItems: Array, nonTerminalItems: Array }
 */
function checkHasTerminalItem(checklist) {
  if (!Array.isArray(checklist) || checklist.length === 0) {
    return { hasTerminal: false, terminalItems: [], nonTerminalItems: [] };
  }

  const terminalStatuses = ['APPROVED', 'REJECTED', 'ACCEPT_REJECTION', 'EXECUTED'];
  const terminalItems = [];
  const nonTerminalItems = [];

  for (const item of checklist) {
    const status = (item.status || '').toUpperCase();
    const isTerminal = terminalStatuses.includes(status);
    
    const itemInfo = {
      id: item.id || 'unknown',
      status: status || 'PENDING',
      action: item.action || item.actionType || 'unknown',
      symbol: item.symbol || 'unknown'
    };

    if (isTerminal) {
      terminalItems.push(itemInfo);
    } else {
      nonTerminalItems.push(itemInfo);
    }
  }

  return {
    hasTerminal: terminalItems.length > 0,
    terminalItems: terminalItems,
    nonTerminalItems: nonTerminalItems
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
    'OPEN': STATUS.IN_PROGRESS,
    'CREATED': STATUS.IN_PROGRESS,
    'ACTIVE': STATUS.IN_PROGRESS,
    'IN_PROGRESS': STATUS.IN_PROGRESS,
    'AWAITING_EXECUTION': STATUS.IN_PROGRESS, // Legacy state maps to IN_PROGRESS
    'DECIDED': STATUS.DECIDED,
    'CLOSED': STATUS.DECIDED, // Legacy CLOSED maps to DECIDED
    'FINALIZED': STATUS.DECIDED,
    'ARCHIVED': STATUS.DECIDED,
    'ACCEPTED': STATUS.DECIDED,
    'COMPLETED': STATUS.DECIDED
  };
  
  const normalizedFrom = statusMap[from] || STATUS.IN_PROGRESS; // Default to IN_PROGRESS for unknown states
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
  const currentStatus = discussionRoom.status || STATUS.IN_PROGRESS; // Default to IN_PROGRESS for new discussions
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

  // INVARIANT GUARD (HARD STOP): Cannot mark discussion as IN_PROGRESS while another discussion is IN_PROGRESS in the same sector
  // Per sector, there can only be one discussion at a time
  if (normalizedNewStatus === STATUS.IN_PROGRESS) {
    const allDiscussions = await loadDiscussions();
    const sectorId = discussionRoom.sectorId;
    
    // Find other IN_PROGRESS discussions in the same sector (excluding current discussion)
    const otherInProgressDiscussions = allDiscussions.filter(d => {
      if (!d.sectorId || d.id === discussionId) {
        return false; // Skip if no sectorId or if it's the current discussion
      }
      
      if (d.sectorId !== sectorId) {
        return false; // Skip if different sector
      }
      
      const status = (d.status || '').toUpperCase();
      // Check for IN_PROGRESS or legacy active statuses
      return status === 'IN_PROGRESS' || status === 'ACTIVE' || status === 'OPEN' || status === 'CREATED';
    });
    
    if (otherInProgressDiscussions.length > 0) {
      const otherDiscussionIds = otherInProgressDiscussions.map(d => d.id).join(', ');
      const otherDiscussionDetails = otherInProgressDiscussions.map(d => 
        `  - ${d.id} (${d.status || 'unknown'}): ${d.title || 'Untitled'}`
      ).join('\n');
      
      const errorMessage = `INVARIANT VIOLATION: Cannot mark discussion IN_PROGRESS while another discussion is IN_PROGRESS in the same sector`;
      const violationMessage = `${errorMessage}: Discussion ${discussionId} cannot be marked as IN_PROGRESS because sector ${sectorId} already has ${otherInProgressDiscussions.length} other active discussion(s). Per sector, there can only be one discussion at a time.\nOther active discussions:\n${otherDiscussionDetails}`;
      
      console.error(`[DiscussionStatusService] HARD STOP - ${violationMessage}`);
      logTransition(discussionId, currentStatus, normalizedNewStatus, `REJECTED: ${violationMessage}`);
      throw new Error(`${errorMessage}. Sector ${sectorId} has ${otherInProgressDiscussions.length} other active discussion(s) (IDs: ${otherDiscussionIds}).`);
    }
  }

  // Transition to DECIDED: No checklist-dependent or execution-linked validations
  // Discussion ends → DECIDED (explicit transition, no intermediate states)
  if (normalizedNewStatus === STATUS.DECIDED) {
    // No validations required - transition is explicit and logged
    // All transitions are explicit and logged via logTransition below
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
  
  // Save discussion
  await saveDiscussion(discussionRoom);
  
  // If discussion is being marked as DECIDED, refresh agent statuses
  // Agents should be set to IDLE if they're not in any other active discussions
  if (normalizedNewStatus === STATUS.DECIDED) {
    try {
      const { refreshAgentStatus } = require('./agentStatusService');
      const agentIds = Array.isArray(discussionRoom.agentIds) ? discussionRoom.agentIds : [];
      
      // Refresh status for all agents in this discussion
      await Promise.allSettled(
        agentIds.map(agentId => refreshAgentStatus(agentId))
      );
      
      console.log(`[DiscussionStatusService] Refreshed status for ${agentIds.length} agents after marking discussion ${discussionId} as DECIDED`);
    } catch (error) {
      console.warn(`[DiscussionStatusService] Failed to refresh agent statuses after marking discussion as DECIDED:`, error.message);
    }
  }
  
  // Deadlock detection: Check for items that remain PENDING after status change attempt
  // Note: ManagerEngine is optional here - if not available, deadlock detection will skip forced reevaluation
  // and go straight to auto-reject if needed
  try {
    // Try to get ManagerEngine if available (for forced reevaluation)
    let ManagerEngine = null;
    try {
      const ManagerEngineClass = require('../core/ManagerEngine');
      ManagerEngine = new ManagerEngineClass();
    } catch (error) {
      // ManagerEngine not available - deadlock detection will use auto-reject only
      console.debug(`[DiscussionStatusService] ManagerEngine not available for deadlock detection, will use auto-reject only`);
    }
    
    const resolvedItems = await detectAndResolveDeadlocks(discussionId, 'status_change', ManagerEngine);
    if (resolvedItems.length > 0) {
      console.log(`[DiscussionStatusService] Deadlock detection resolved ${resolvedItems.length} item(s) after status change attempt`);
      // Reload discussion to get updated state after deadlock resolution
      const updatedDiscussionData = await findDiscussionById(discussionId);
      if (updatedDiscussionData) {
        return DiscussionRoom.fromData(updatedDiscussionData);
      }
    }
  } catch (deadlockError) {
    console.error(`[DiscussionStatusService] Error during deadlock detection after status change:`, deadlockError.message);
    // Don't throw - continue with normal return even if deadlock detection fails
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
  return (discussionRoom.status || STATUS.IN_PROGRESS).toUpperCase();
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
  if (!status) return STATUS.IN_PROGRESS;
  
  const statusUpper = (status || '').toUpperCase();
  const statusMap = {
    'OPEN': STATUS.IN_PROGRESS,
    'CREATED': STATUS.IN_PROGRESS,
    'ACTIVE': STATUS.IN_PROGRESS,
    'IN_PROGRESS': STATUS.IN_PROGRESS,
    'AWAITING_EXECUTION': STATUS.IN_PROGRESS, // Legacy state maps to IN_PROGRESS
    'DECIDED': STATUS.DECIDED,
    'CLOSED': STATUS.DECIDED, // Legacy CLOSED maps to DECIDED
    'FINALIZED': STATUS.DECIDED,
    'ARCHIVED': STATUS.DECIDED,
    'ACCEPTED': STATUS.DECIDED,
    'COMPLETED': STATUS.DECIDED
  };
  
  return statusMap[statusUpper] || STATUS.IN_PROGRESS;
}

/**
 * @deprecated Removed: checkAndTransitionToAwaitingExecution
 * State machine no longer has AWAITING_EXECUTION state.
 * All transitions are now explicit: IN_PROGRESS → DECIDED
 */
async function checkAndTransitionToAwaitingExecution(discussionId) {
  console.warn(`[DiscussionStatusService] checkAndTransitionToAwaitingExecution is deprecated. State machine only supports IN_PROGRESS → DECIDED transitions.`);
  return false;
}

/**
 * @deprecated Removed: checkAndTransitionToDecided
 * State machine no longer has automatic transitions based on checklist or execution state.
 * All transitions must be explicit: IN_PROGRESS → DECIDED
 */
async function checkAndTransitionToDecided(discussionId) {
  console.warn(`[DiscussionStatusService] checkAndTransitionToDecided is deprecated. State machine only supports explicit transitions. Use transitionStatus() directly.`);
  return false;
}

/**
 * @deprecated Removed: fixInconsistentDecidedState
 * State machine no longer validates checklist state for DECIDED transitions.
 * All transitions are explicit and do not depend on checklist or execution state.
 */
async function fixInconsistentDecidedState(discussionId) {
  console.warn(`[DiscussionStatusService] fixInconsistentDecidedState is deprecated. State machine no longer validates checklist state.`);
  return true;
}

module.exports = {
  STATUS,
  transitionStatus,
  getStatus,
  isStatus,
  fixInconsistentDecidedState, // Deprecated but kept for backward compatibility
  isValidTransition,
  normalizeStatus,
  checkAndTransitionToAwaitingExecution, // Deprecated but kept for backward compatibility
  checkAndTransitionToDecided, // Deprecated but kept for backward compatibility
  checkChecklistItemsTerminal, // Kept for other uses (not for state transitions)
  checkAcceptedItemsExecuted, // Kept for other uses (not for state transitions)
  countApprovedItems, // Kept for other uses (not for state transitions)
  checkHasTerminalItem // Kept for other uses (not for state transitions)
};

