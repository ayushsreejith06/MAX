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
export enum DiscussionStatus {
  IN_PROGRESS = 'IN_PROGRESS',
  DECIDED = 'DECIDED'
}

/**
 * Execution Mode
 * Represents whether an execution has been completed
 */
export enum ExecutionMode {
  PENDING = 'PENDING',
  EXECUTED = 'EXECUTED'
}

/**
 * Agent Status
 * Represents the current activity state of an agent
 */
export enum AgentStatus {
  IDLE = 'IDLE',
  ACTIVE = 'ACTIVE'
}

/**
 * Rejected Item Status
 * Represents the finality of a rejected item
 */
export enum RejectedItemStatus {
  REJECT_FINAL = 'REJECT_FINAL',
  REJECT_REVISE = 'REJECT_REVISE'
}

