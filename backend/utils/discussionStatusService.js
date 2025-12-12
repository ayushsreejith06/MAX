const { findDiscussionById, saveDiscussion } = require('./discussionStorage');
const DiscussionRoom = require('../models/DiscussionRoom');

/**
 * Discussion Status Service
 * 
 * Single authoritative source for discussion status transitions.
 * Enforces state machine: CREATED → IN_PROGRESS → DECIDED → CLOSED
 * 
 * State Machine Rules:
 * - Status may only move forward (no backward transitions)
 * - CREATED: Initial state when discussion is created
 * - IN_PROGRESS: Discussion has started, agents are active
 * - DECIDED: Discussion has produced a decision/checklist
 * - CLOSED: Discussion is finalized and archived
 */

// Valid status values (uppercase for consistency)
const STATUS = {
  CREATED: 'CREATED',
  IN_PROGRESS: 'IN_PROGRESS',
  DECIDED: 'DECIDED',
  CLOSED: 'CLOSED'
};

// Valid state transitions (from -> to)
const VALID_TRANSITIONS = {
  [STATUS.CREATED]: [STATUS.IN_PROGRESS, STATUS.CLOSED], // Can skip to CLOSED if failed
  [STATUS.IN_PROGRESS]: [STATUS.DECIDED, STATUS.CLOSED], // Can close early if needed
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
  
  // VALIDATION: Cannot transition to DECIDED without checklist items
  // A discussion must have checklist items to be considered DECIDED
  if (normalizedNewStatus === STATUS.DECIDED) {
    const hasChecklistItems = Array.isArray(discussionRoom.checklist) && discussionRoom.checklist.length > 0;
    const hasChecklistDraft = Array.isArray(discussionRoom.checklistDraft) && discussionRoom.checklistDraft.length > 0;
    
    if (!hasChecklistItems && !hasChecklistDraft) {
      const error = `Cannot transition discussion to DECIDED: Discussion ${discussionId} has no checklist items. A discussion must have checklist items before it can be marked as DECIDED.`;
      logTransition(discussionId, currentStatus, normalizedNewStatus, `REJECTED: ${error}`);
      throw new Error(error);
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
    'DECIDED': STATUS.DECIDED,
    'CLOSED': STATUS.CLOSED,
    'FINALIZED': STATUS.CLOSED,
    'ARCHIVED': STATUS.CLOSED,
    'ACCEPTED': STATUS.CLOSED,
    'COMPLETED': STATUS.CLOSED
  };
  
  return statusMap[statusUpper] || STATUS.CREATED;
}

module.exports = {
  STATUS,
  transitionStatus,
  getStatus,
  isStatus,
  isValidTransition,
  normalizeStatus
};

