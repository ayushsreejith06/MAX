/**
 * State Contract
 * 
 * Centralized state enums for the MAX system.
 * This file defines all status enums used throughout the codebase.
 * 
 * IMPORTANT: This file contains ONLY enum definitions - no logic.
 */

/**
 * Discussion Status
 * Represents the current state of a discussion
 */
const DiscussionStatus = {
  IN_PROGRESS: 'IN_PROGRESS',
  DECIDED: 'DECIDED'
};

/**
 * Checklist Status
 * Represents the approval/execution state of a checklist item
 */
const ChecklistStatus = {
  PENDING: 'PENDING',
  ACCEPTED: 'ACCEPTED',
  REJECTED: 'REJECTED'
};

/**
 * Execution Mode
 * Represents whether an execution has been completed
 */
const ExecutionMode = {
  PENDING: 'PENDING',
  EXECUTED: 'EXECUTED'
};

/**
 * Agent Status
 * Represents the current activity state of an agent
 */
const AgentStatus = {
  IDLE: 'IDLE',
  ACTIVE: 'ACTIVE'
};

/**
 * Rejected Item Status
 * Represents the finality of a rejected item
 */
const RejectedItemStatus = {
  REJECT_FINAL: 'REJECT_FINAL',
  REJECT_REVISE: 'REJECT_REVISE'
};

module.exports = {
  DiscussionStatus,
  ChecklistStatus,
  ExecutionMode,
  AgentStatus,
  RejectedItemStatus
};

