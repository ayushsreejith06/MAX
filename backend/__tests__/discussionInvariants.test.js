/**
 * Discussion State Invariant Tests
 * 
 * These tests enforce critical invariants that must never be violated:
 * 1. DECIDED discussions cannot have pending checklist items
 * 2. Manager evaluation must not leave pending items
 * 3. Single-agent discussions cannot run multiple rounds
 * 
 * These tests are designed to block merges if violated.
 */

const DiscussionRoom = require('../models/DiscussionRoom');
const { findDiscussionById, loadDiscussions } = require('../utils/discussionStorage');
const DiscussionEngine = require('../core/DiscussionEngine');

/**
 * Invariant 1: DECIDED discussion with pending checklist → FAIL
 * A discussion with status DECIDED must not have any checklist items with status PENDING, RESUBMITTED, or REVISE_REQUIRED
 * 
 * @param {string|Object} discussionIdOrRoom - Discussion ID or DiscussionRoom instance
 * @returns {Promise<{valid: boolean, violations: Array<string>}>}
 */
async function testDecidedWithPendingChecklist(discussionIdOrRoom) {
  const violations = [];
  
  let discussionRoom;
  if (typeof discussionIdOrRoom === 'string') {
    const discussionData = await findDiscussionById(discussionIdOrRoom);
    if (!discussionData) {
      return {
        valid: false,
        violations: [`Discussion ${discussionIdOrRoom} not found`]
      };
    }
    discussionRoom = DiscussionRoom.fromData(discussionData);
  } else {
    discussionRoom = discussionIdOrRoom;
  }
  
  const status = (discussionRoom.status || '').toUpperCase();
  
  // Only check DECIDED discussions
  if (status !== 'DECIDED') {
    return { valid: true, violations: [] };
  }
  
  // Check for pending items
  const checklist = Array.isArray(discussionRoom.checklist) ? discussionRoom.checklist : [];
  const nonTerminalStatuses = ['PENDING', 'RESUBMITTED', 'REVISE_REQUIRED'];
  
  const pendingItems = [];
  for (const item of checklist) {
    const itemStatus = (item.status || '').toUpperCase();
    if (!itemStatus || itemStatus === 'PENDING' || nonTerminalStatuses.includes(itemStatus)) {
      pendingItems.push({
        id: item.id || 'unknown',
        status: itemStatus || 'PENDING',
        action: item.action || item.actionType || 'unknown',
        symbol: item.symbol || 'unknown'
      });
    }
  }
  
  if (pendingItems.length > 0) {
    const pendingItemIds = pendingItems.map(item => item.id).join(', ');
    const pendingItemDetails = pendingItems.map(item => 
      `  - ${item.id} (${item.status}): ${item.action} ${item.symbol || ''}`
    ).join('\n');
    
    violations.push(
      `INVARIANT VIOLATION: DECIDED discussion ${discussionRoom.id} has ${pendingItems.length} pending checklist item(s). ` +
      `All items must be resolved (APPROVED, REJECTED, or ACCEPT_REJECTION) before a discussion can be marked as DECIDED.\n` +
      `Pending items:\n${pendingItemDetails}`
    );
  }
  
  return {
    valid: violations.length === 0,
    violations
  };
}

/**
 * Invariant 2: Manager evaluation leaves pending items → FAIL
 * After managerEvaluateChecklist is called, there should be no pending items remaining
 * 
 * @param {string|Object} discussionIdOrRoom - Discussion ID or DiscussionRoom instance
 * @returns {Promise<{valid: boolean, violations: Array<string>}>}
 */
async function testManagerEvaluationLeavesPending(discussionIdOrRoom) {
  const violations = [];
  
  let discussionRoom;
  if (typeof discussionIdOrRoom === 'string') {
    const discussionData = await findDiscussionById(discussionIdOrRoom);
    if (!discussionData) {
      return {
        valid: false,
        violations: [`Discussion ${discussionIdOrRoom} not found`]
      };
    }
    discussionRoom = DiscussionRoom.fromData(discussionData);
  } else {
    discussionRoom = discussionIdOrRoom;
  }
  
  // Check for pending items that should have been evaluated
  const checklist = Array.isArray(discussionRoom.checklist) ? discussionRoom.checklist : [];
  const nonTerminalStatuses = ['PENDING', 'RESUBMITTED'];
  
  const pendingItems = [];
  for (const item of checklist) {
    const itemStatus = (item.status || '').toUpperCase();
    // PENDING and RESUBMITTED items should have been evaluated by manager
    // REVISE_REQUIRED is allowed as it's an intermediate state
    if (!itemStatus || itemStatus === 'PENDING' || itemStatus === 'RESUBMITTED') {
      pendingItems.push({
        id: item.id || 'unknown',
        status: itemStatus || 'PENDING',
        action: item.action || item.actionType || 'unknown',
        symbol: item.symbol || 'unknown',
        evaluatedAt: item.evaluatedAt || null
      });
    }
  }
  
  if (pendingItems.length > 0) {
    const pendingItemIds = pendingItems.map(item => item.id).join(', ');
    const pendingItemDetails = pendingItems.map(item => 
      `  - ${item.id} (${item.status}): ${item.action} ${item.symbol || ''}${item.evaluatedAt ? ` - evaluated at ${item.evaluatedAt}` : ' - never evaluated'}`
    ).join('\n');
    
    violations.push(
      `INVARIANT VIOLATION: Manager evaluation left ${pendingItems.length} pending checklist item(s) in discussion ${discussionRoom.id}. ` +
      `All PENDING and RESUBMITTED items must be evaluated by the manager. ` +
      `REVISE_REQUIRED is allowed as an intermediate state.\n` +
      `Pending items:\n${pendingItemDetails}`
    );
  }
  
  return {
    valid: violations.length === 0,
    violations
  };
}

/**
 * Invariant 3: Single-agent discussion runs multiple rounds → FAIL
 * A discussion with only one agent (excluding manager) should not run multiple rounds
 * 
 * @param {string|Object} discussionIdOrRoom - Discussion ID or DiscussionRoom instance
 * @returns {Promise<{valid: boolean, violations: Array<string>}>}
 */
async function testSingleAgentMultipleRounds(discussionIdOrRoom) {
  const violations = [];
  
  let discussionRoom;
  if (typeof discussionIdOrRoom === 'string') {
    const discussionData = await findDiscussionById(discussionIdOrRoom);
    if (!discussionData) {
      return {
        valid: false,
        violations: [`Discussion ${discussionIdOrRoom} not found`]
      };
    }
    discussionRoom = DiscussionRoom.fromData(discussionData);
  } else {
    discussionRoom = discussionIdOrRoom;
  }
  
  // Check if this is a single-agent discussion
  const discussionEngine = new DiscussionEngine();
  const isSingleAgent = discussionEngine.isSingleAgentDiscussion(discussionRoom);
  
  if (!isSingleAgent) {
    return { valid: true, violations: [] };
  }
  
  // Check round count
  const currentRound = discussionRoom.currentRound || discussionRoom.round || 1;
  const roundHistory = Array.isArray(discussionRoom.roundHistory) ? discussionRoom.roundHistory : [];
  
  // Single-agent discussions should only have 1 round
  if (currentRound > 1 || roundHistory.length > 0) {
    violations.push(
      `INVARIANT VIOLATION: Single-agent discussion ${discussionRoom.id} has run multiple rounds. ` +
      `Current round: ${currentRound}, Round history length: ${roundHistory.length}. ` +
      `Single-agent discussions should only run 1 round. ` +
      `Agent IDs: ${(discussionRoom.agentIds || []).join(', ')}`
    );
  }
  
  return {
    valid: violations.length === 0,
    violations
  };
}

/**
 * Run all invariant tests on a discussion
 * 
 * @param {string|Object} discussionIdOrRoom - Discussion ID or DiscussionRoom instance
 * @returns {Promise<{valid: boolean, violations: Array<string>, testResults: Object}>}
 */
async function runAllInvariantTests(discussionIdOrRoom) {
  const testResults = {
    decidedWithPending: null,
    managerEvaluationLeavesPending: null,
    singleAgentMultipleRounds: null
  };
  
  const allViolations = [];
  
  // Test 1: DECIDED with pending checklist
  try {
    testResults.decidedWithPending = await testDecidedWithPendingChecklist(discussionIdOrRoom);
    if (!testResults.decidedWithPending.valid) {
      allViolations.push(...testResults.decidedWithPending.violations);
    }
  } catch (error) {
    allViolations.push(`Error testing DECIDED with pending checklist: ${error.message}`);
    testResults.decidedWithPending = { valid: false, violations: [error.message] };
  }
  
  // Test 2: Manager evaluation leaves pending
  try {
    testResults.managerEvaluationLeavesPending = await testManagerEvaluationLeavesPending(discussionIdOrRoom);
    if (!testResults.managerEvaluationLeavesPending.valid) {
      allViolations.push(...testResults.managerEvaluationLeavesPending.violations);
    }
  } catch (error) {
    allViolations.push(`Error testing manager evaluation leaves pending: ${error.message}`);
    testResults.managerEvaluationLeavesPending = { valid: false, violations: [error.message] };
  }
  
  // Test 3: Single-agent multiple rounds
  try {
    testResults.singleAgentMultipleRounds = await testSingleAgentMultipleRounds(discussionIdOrRoom);
    if (!testResults.singleAgentMultipleRounds.valid) {
      allViolations.push(...testResults.singleAgentMultipleRounds.violations);
    }
  } catch (error) {
    allViolations.push(`Error testing single-agent multiple rounds: ${error.message}`);
    testResults.singleAgentMultipleRounds = { valid: false, violations: [error.message] };
  }
  
  return {
    valid: allViolations.length === 0,
    violations: allViolations,
    testResults
  };
}

/**
 * Run invariant tests on all discussions
 * 
 * @returns {Promise<{valid: boolean, violations: Array<string>, discussionResults: Array<Object}>}
 */
async function runInvariantTestsOnAllDiscussions() {
  const discussions = await loadDiscussions();
  const allViolations = [];
  const discussionResults = [];
  
  for (const discussionData of discussions) {
    try {
      const result = await runAllInvariantTests(discussionData);
      discussionResults.push({
        discussionId: discussionData.id,
        valid: result.valid,
        violations: result.violations,
        testResults: result.testResults
      });
      
      if (!result.valid) {
        allViolations.push(...result.violations);
      }
    } catch (error) {
      allViolations.push(`Error testing discussion ${discussionData.id}: ${error.message}`);
      discussionResults.push({
        discussionId: discussionData.id,
        valid: false,
        violations: [error.message],
        testResults: null
      });
    }
  }
  
  return {
    valid: allViolations.length === 0,
    violations: allViolations,
    discussionResults
  };
}

module.exports = {
  testDecidedWithPendingChecklist,
  testManagerEvaluationLeavesPending,
  testSingleAgentMultipleRounds,
  runAllInvariantTests,
  runInvariantTestsOnAllDiscussions
};

