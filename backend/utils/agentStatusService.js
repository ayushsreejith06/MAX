const { updateAgent } = require('./agentStorage');
const { loadDiscussions } = require('./discussionStorage');

/**
 * Agent status constants
 */
const STATUS = {
  IDLE: 'IDLE',
  THINKING: 'THINKING',
  DISCUSSING: 'DISCUSSING',
  EXECUTING: 'EXECUTING'
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
 * Update agent status atomically
 * @param {string} agentId - Agent ID
 * @param {string} newStatus - New status (STATUS.IDLE, STATUS.THINKING, STATUS.DISCUSSING, STATUS.EXECUTING)
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
 * Update agent status to THINKING (when generating messages or reasoning)
 * @param {string} agentId - Agent ID
 * @param {string} reason - Reason for thinking (e.g., "Generating message", "Producing research signal")
 * @returns {Promise<Object|null>} Updated agent or null if not found
 */
async function setAgentThinking(agentId, reason = 'Generating message or reasoning') {
  return updateAgentStatus(agentId, STATUS.THINKING, reason);
}

/**
 * Update agent status to DISCUSSING (when participating in a discussion)
 * @param {string} agentId - Agent ID
 * @param {string} discussionId - Discussion ID (optional, for logging)
 * @returns {Promise<Object|null>} Updated agent or null if not found
 */
async function setAgentDiscussing(agentId, discussionId = '') {
  const reason = discussionId ? `Participating in discussion ${discussionId}` : 'Participating in discussion';
  return updateAgentStatus(agentId, STATUS.DISCUSSING, reason);
}

/**
 * Update agent status to EXECUTING (when executing an action)
 * @param {string} agentId - Agent ID
 * @param {string} action - Action being executed (e.g., "BUY", "SELL")
 * @returns {Promise<Object|null>} Updated agent or null if not found
 */
async function setAgentExecuting(agentId, action = '') {
  const reason = action ? `Executing ${action} action` : 'Executing action';
  return updateAgentStatus(agentId, STATUS.EXECUTING, reason);
}

/**
 * Update agent status to IDLE (when not in any active discussions)
 * This should only be called when the agent is confirmed to not be in any active discussions
 * @param {string} agentId - Agent ID
 * @returns {Promise<Object|null>} Updated agent or null if not found
 */
async function setAgentIdle(agentId) {
  return updateAgentStatus(agentId, STATUS.IDLE, 'No active discussions');
}

/**
 * Update agent status based on current state
 * This is a smart function that checks if agent is in active discussions
 * and sets status accordingly
 * @param {string} agentId - Agent ID
 * @returns {Promise<Object|null>} Updated agent or null if not found
 */
async function refreshAgentStatus(agentId) {
  try {
    const inActiveDiscussion = await isAgentInActiveDiscussion(agentId);
    
    if (inActiveDiscussion) {
      // If agent is in active discussion but status is not DISCUSSING or THINKING or EXECUTING,
      // set to DISCUSSING (default for active participation)
      // Note: We don't override THINKING or EXECUTING as those are more specific states
      const { loadAgents } = require('./agentStorage');
      const agents = await loadAgents();
      const agent = agents.find(a => a.id === agentId);
      
      if (agent) {
        const currentStatus = (agent.status || '').toUpperCase();
        if (currentStatus !== STATUS.THINKING && currentStatus !== STATUS.EXECUTING && currentStatus !== STATUS.DISCUSSING) {
          return setAgentDiscussing(agentId);
        }
      }
    } else {
      // Agent is not in any active discussions, set to IDLE
      return setAgentIdle(agentId);
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
  updateMultipleAgentStatuses
};

