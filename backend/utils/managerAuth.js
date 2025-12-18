/**
 * Manager Authorization Utilities
 * 
 * Provides utilities to check if an agent is a manager and enforce
 * manager-only authority for checklist mutations.
 */

const { loadAgents } = require('./agentStorage');

/**
 * Check if an agent is a manager
 * @param {string} agentId - Agent ID to check
 * @returns {Promise<boolean>} True if agent is a manager
 */
async function isManager(agentId) {
  if (!agentId) {
    return false;
  }

  try {
    const agents = await loadAgents();
    const agent = agents.find(a => a && a.id === agentId);
    
    if (!agent) {
      return false;
    }

    // Check if agent role is manager
    const role = agent.role || '';
    return role === 'manager' || role.toLowerCase().includes('manager');
  } catch (error) {
    console.error(`[managerAuth] Error checking if agent ${agentId} is manager:`, error.message);
    return false;
  }
}

/**
 * Get manager agent by ID
 * @param {string} agentId - Agent ID
 * @returns {Promise<Object|null>} Manager agent or null
 */
async function getManagerById(agentId) {
  if (!agentId) {
    return null;
  }

  try {
    const agents = await loadAgents();
    const agent = agents.find(a => a && a.id === agentId);
    
    if (!agent) {
      return null;
    }

    const role = agent.role || '';
    const isManagerRole = role === 'manager' || role.toLowerCase().includes('manager');
    
    return isManagerRole ? agent : null;
  } catch (error) {
    console.error(`[managerAuth] Error getting manager ${agentId}:`, error.message);
    return null;
  }
}

/**
 * Log a violation when a non-manager attempts checklist mutation
 * @param {string} agentId - Agent ID that attempted the violation
 * @param {string} checklistItemId - Checklist item ID that was targeted
 * @param {string} action - Action attempted (e.g., 'APPROVE', 'REJECT', 'EXECUTE')
 * @param {string} endpoint - API endpoint where violation occurred
 */
function logViolation(agentId, checklistItemId, action, endpoint) {
  const timestamp = new Date().toISOString();
  const violation = {
    timestamp,
    agentId,
    checklistItemId,
    action,
    endpoint,
    message: `[CHECKLIST_AUTHORITY_VIOLATION] Non-manager agent ${agentId} attempted to ${action} checklist item ${checklistItemId} via ${endpoint}`
  };

  console.error(JSON.stringify(violation, null, 2));
  
  // Could also write to a violations log file if needed
  // For now, we'll use console.error which can be captured by logging systems
}

/**
 * Verify that the requesting agent is a manager
 * Throws an error if not a manager
 * @param {string} agentId - Agent ID to verify
 * @param {string} checklistItemId - Checklist item ID (for logging)
 * @param {string} action - Action being attempted (for logging)
 * @param {string} endpoint - Endpoint where check is performed (for logging)
 * @throws {Error} If agent is not a manager
 */
async function requireManager(agentId, checklistItemId, action, endpoint) {
  const isManagerAgent = await isManager(agentId);
  
  if (!isManagerAgent) {
    logViolation(agentId, checklistItemId, action, endpoint);
    throw new Error(`Unauthorized: Only manager agents can ${action} checklist items. Agent ${agentId} is not a manager.`);
  }
}

module.exports = {
  isManager,
  getManagerById,
  logViolation,
  requireManager
};

