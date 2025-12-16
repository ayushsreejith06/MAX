const { updateAgent } = require('./agentStorage');
const { loadDiscussions } = require('./discussionStorage');
const { AgentStatus } = require('../core/state');

/**
 * Agent status constants
 * Note: AgentStatus enum only includes IDLE and ACTIVE as per contract
 * THINKING, DISCUSSING, and EXECUTING are all mapped to ACTIVE since they indicate active work
 */
const STATUS = {
  IDLE: AgentStatus.IDLE,
  ACTIVE: AgentStatus.ACTIVE,
  // Legacy mappings - these all map to ACTIVE
  THINKING: AgentStatus.ACTIVE,
  DISCUSSING: AgentStatus.ACTIVE,
  EXECUTING: AgentStatus.ACTIVE
};

/**
 * Check if an agent is participating in any active discussions
 * @param {string} agentId - Agent ID
 * @returns {Promise<boolean>} True if agent is in an active discussion
 */
async function isAgentInActiveDiscussion(agentId) {
  try {
    const discussions = await loadDiscussions();
    const activeStatuses = ['OPEN', 'IN_PROGRESS', 'open', 'in_progress', 'ACTIVE', 'active', 'CREATED', 'created'];
    
    return discussions.some(d => {
      const status = (d.status || '').toUpperCase();
      const isActive = activeStatuses.includes(status);
      const agentIds = Array.isArray(d.agentIds) ? d.agentIds : [];
      return isActive && agentIds.includes(agentId);
    });
  } catch (error) {
    console.error(`[agentStatusService] Error checking active discussions for agent ${agentId}:`, error);
    return false;
  }
}

/**
 * Check if an agent has unresolved checklist items
 * Unresolved items are: PENDING, REVISE_REQUIRED, RESUBMITTED, or REJECTED (but not ACCEPT_REJECTION)
 * @param {string} agentId - Agent ID
 * @returns {Promise<boolean>} True if agent has unresolved checklist items
 */
async function hasUnresolvedChecklistItems(agentId) {
  try {
    const discussions = await loadDiscussions();
    
    for (const discussion of discussions) {
      const checklist = Array.isArray(discussion.checklist) ? discussion.checklist : [];
      const finalizedChecklist = Array.isArray(discussion.finalizedChecklist) ? discussion.finalizedChecklist : [];
      const allItems = [...checklist, ...finalizedChecklist];
      
      // Check if any item belongs to this agent and is unresolved
      const hasUnresolved = allItems.some(item => {
        const itemAgentId = item.agentId || item.sourceAgentId;
        if (itemAgentId !== agentId) {
          return false;
        }
        
        const itemStatus = (item.status || '').toUpperCase();
        
        // ACCEPT_REJECTION means the worker accepted the rejection - this is resolved
        if (itemStatus === 'ACCEPT_REJECTION') {
          return false;
        }
        
        // Unresolved statuses: PENDING, REVISE_REQUIRED, RESUBMITTED, REJECTED
        const unresolvedStatuses = ['PENDING', 'REVISE_REQUIRED', 'RESUBMITTED', 'REJECTED'];
        const isUnresolved = unresolvedStatuses.includes(itemStatus);
        
        // Also check requiresRevision flag
        const needsRevision = item.requiresRevision === true;
        
        return isUnresolved || needsRevision;
      });
      
      if (hasUnresolved) {
        return true;
      }
    }
    
    return false;
  } catch (error) {
    console.error(`[agentStatusService] Error checking unresolved checklist items for agent ${agentId}:`, error);
    return false;
  }
}

/**
 * Check if an agent is refining a rejected proposal
 * This checks for items with REVISE_REQUIRED status or items in active refinement cycles
 * @param {string} agentId - Agent ID
 * @returns {Promise<boolean>} True if agent is refining a rejected proposal
 */
async function isRefiningRejectedProposal(agentId) {
  try {
    const discussions = await loadDiscussions();
    
    for (const discussion of discussions) {
      // Check active refinement cycles
      const activeRefinementCycles = Array.isArray(discussion.activeRefinementCycles) 
        ? discussion.activeRefinementCycles 
        : [];
      
      const hasActiveRefinement = activeRefinementCycles.some(cycle => {
        // Find the item in the checklist
        const checklist = Array.isArray(discussion.checklist) ? discussion.checklist : [];
        const item = checklist.find(i => i.id === cycle.itemId);
        if (!item) return false;
        
        const itemAgentId = item.agentId || item.sourceAgentId;
        return itemAgentId === agentId;
      });
      
      if (hasActiveRefinement) {
        return true;
      }
      
      // Check for items with REVISE_REQUIRED status
      const checklist = Array.isArray(discussion.checklist) ? discussion.checklist : [];
      const finalizedChecklist = Array.isArray(discussion.finalizedChecklist) ? discussion.finalizedChecklist : [];
      const allItems = [...checklist, ...finalizedChecklist];
      
      const hasReviseRequired = allItems.some(item => {
        const itemAgentId = item.agentId || item.sourceAgentId;
        if (itemAgentId !== agentId) {
          return false;
        }
        
        const itemStatus = (item.status || '').toUpperCase();
        return itemStatus === 'REVISE_REQUIRED' || item.requiresRevision === true;
      });
      
      if (hasReviseRequired) {
        return true;
      }
    }
    
    return false;
  } catch (error) {
    console.error(`[agentStatusService] Error checking rejected proposal refinement for agent ${agentId}:`, error);
    return false;
  }
}

/**
 * Update agent status atomically
 * @param {string} agentId - Agent ID
 * @param {string} newStatus - New status (STATUS.IDLE or STATUS.ACTIVE)
 * @param {string} reason - Optional reason for status change (for logging)
 * @returns {Promise<Object|null>} Updated agent or null if not found
 */
async function updateAgentStatus(agentId, newStatus, reason = '') {
  try {
    // Validate status
    const validStatuses = Object.values(STATUS);
    if (!validStatuses.includes(newStatus)) {
      console.warn(`[agentStatusService] Invalid status ${newStatus} for agent ${agentId}, using IDLE`);
      newStatus = STATUS.IDLE;
    }

    const updatedAgent = await updateAgent(agentId, { status: newStatus });
    
    if (updatedAgent && reason) {
      console.log(`[agentStatusService] Agent ${agentId} status updated to ${newStatus}: ${reason}`);
    }
    
    return updatedAgent;
  } catch (error) {
    console.error(`[agentStatusService] Error updating status for agent ${agentId}:`, error);
    throw error;
  }
}

/**
 * Update agent status to ACTIVE (when generating messages or reasoning)
 * @param {string} agentId - Agent ID
 * @param {string} reason - Reason for thinking (e.g., "Generating message", "Producing research signal")
 * @returns {Promise<Object|null>} Updated agent or null if not found
 */
async function setAgentThinking(agentId, reason = 'Generating message or reasoning') {
  return updateAgentStatus(agentId, AgentStatus.ACTIVE, reason);
}

/**
 * Update agent status to ACTIVE (when participating in a discussion)
 * @param {string} agentId - Agent ID
 * @param {string} discussionId - Discussion ID (optional, for logging)
 * @returns {Promise<Object|null>} Updated agent or null if not found
 */
async function setAgentDiscussing(agentId, discussionId = '') {
  const reason = discussionId ? `Participating in discussion ${discussionId}` : 'Participating in discussion';
  return updateAgentStatus(agentId, AgentStatus.ACTIVE, reason);
}

/**
 * Update agent status to ACTIVE (when executing an action)
 * @param {string} agentId - Agent ID
 * @param {string} action - Action being executed (e.g., "BUY", "SELL")
 * @returns {Promise<Object|null>} Updated agent or null if not found
 */
async function setAgentExecuting(agentId, action = '') {
  const reason = action ? `Executing ${action} action` : 'Executing action';
  return updateAgentStatus(agentId, AgentStatus.ACTIVE, reason);
}

/**
 * Update agent status to IDLE (when not in any active discussions)
 * This should only be called when the agent is confirmed to have no pending responsibilities
 * @param {string} agentId - Agent ID
 * @returns {Promise<Object|null>} Updated agent or null if not found
 */
async function setAgentIdle(agentId) {
  return updateAgentStatus(agentId, STATUS.IDLE, 'No pending responsibilities');
}

/**
 * Update agent status based on current state
 * Dynamically sets status based on agent's actual participation:
 * - ACTIVE when: has unresolved checklist items, responding to discussion, or refining rejected proposal
 * - IDLE only when: no pending discussion responsibilities
 * @param {string} agentId - Agent ID
 * @returns {Promise<Object|null>} Updated agent or null if not found
 */
async function refreshAgentStatus(agentId) {
  try {
    const { loadAgents } = require('./agentStorage');
    const agents = await loadAgents();
    const agent = agents.find(a => a.id === agentId);
    
    if (!agent) {
      console.warn(`[agentStatusService] Agent ${agentId} not found`);
      return null;
    }
    
    const currentStatus = (agent.status || '').toUpperCase();
    
    // Check all conditions that make an agent ACTIVE
    const [inActiveDiscussion, hasUnresolvedItems, isRefining] = await Promise.all([
      isAgentInActiveDiscussion(agentId),
      hasUnresolvedChecklistItems(agentId),
      isRefiningRejectedProposal(agentId)
    ]);
    
    // Agent is ACTIVE if any of these conditions are true:
    // 1. Participating in active discussion
    // 2. Has unresolved checklist items
    // 3. Is refining a rejected proposal
    const shouldBeActive = inActiveDiscussion || hasUnresolvedItems || isRefining;
    
    if (shouldBeActive) {
      // Set to ACTIVE if not already ACTIVE
      if (currentStatus !== AgentStatus.ACTIVE) {
        const reason = [];
        if (inActiveDiscussion) reason.push('participating in discussion');
        if (hasUnresolvedItems) reason.push('has unresolved checklist items');
        if (isRefining) reason.push('refining rejected proposal');
        
        return updateAgentStatus(agentId, AgentStatus.ACTIVE, reason.join(', '));
      }
    } else {
      // Agent has no pending responsibilities - set to IDLE
      if (currentStatus !== AgentStatus.IDLE) {
        return setAgentIdle(agentId);
      }
    }
    
    return null;
  } catch (error) {
    console.error(`[agentStatusService] Error refreshing status for agent ${agentId}:`, error);
    throw error;
  }
}

/**
 * Update multiple agents' status atomically
 * @param {Array<string>} agentIds - Array of agent IDs
 * @param {string} newStatus - New status
 * @param {string} reason - Optional reason for status change
 * @returns {Promise<Array<Object>>} Array of updated agents
 */
async function updateMultipleAgentStatuses(agentIds, newStatus, reason = '') {
  const results = await Promise.allSettled(
    agentIds.map(agentId => updateAgentStatus(agentId, newStatus, reason))
  );
  
  const updated = results
    .filter(r => r.status === 'fulfilled' && r.value !== null)
    .map(r => r.value);
  
  const failed = results.filter(r => r.status === 'rejected');
  if (failed.length > 0) {
    console.warn(`[agentStatusService] Failed to update ${failed.length} agent statuses`);
  }
  
  return updated;
}

module.exports = {
  STATUS,
  updateAgentStatus,
  setAgentThinking,
  setAgentDiscussing,
  setAgentExecuting,
  setAgentIdle,
  refreshAgentStatus,
  isAgentInActiveDiscussion,
  hasUnresolvedChecklistItems,
  isRefiningRejectedProposal,
  updateMultipleAgentStatuses
};

