const { readDataFile, writeDataFile, atomicUpdate } = require('./persistence');

const AGENTS_FILE = 'agents.json';

/**
 * Normalize agent ID: ensure it's a string and trim whitespace
 * @param {any} id - Agent ID (can be string, number, or undefined)
 * @returns {string} Normalized string ID or empty string if invalid
 */
function normalizeAgentId(id) {
  if (!id) return '';
  const normalized = String(id).trim();
  return normalized || '';
}

/**
 * Load all agents from storage
 * @returns {Promise<Array>} Array of agent objects
 */
async function loadAgents() {
  try {
    const data = await readDataFile(AGENTS_FILE);
    const agents = Array.isArray(data) ? data : [];
    
    // Normalize all agent IDs when loading
    return agents.map(agent => {
      if (agent && agent.id) {
        return {
          ...agent,
          id: normalizeAgentId(agent.id)
        };
      }
      return agent;
    }).filter(agent => agent && agent.id); // Filter out agents with invalid IDs
  } catch (error) {
    // If file doesn't exist, return empty array and create it
    if (error.code === 'ENOENT') {
      await writeDataFile(AGENTS_FILE, []);
      return [];
    }
    throw error;
  }
}

/**
 * Save all agents to storage
 * Validates JSON structure, removes duplicate IDs, and ensures atomic write
 * @param {Array} agents - Array of agent objects
 * @returns {Promise<void>}
 */
async function saveAgents(agents) {
  // Validate input is an array
  if (!Array.isArray(agents)) {
    throw new Error('saveAgents: agents must be an array');
  }

  // Remove duplicates by ID (keep last occurrence)
  const seenIds = new Set();
  const deduplicatedAgents = [];
  
  // Iterate in reverse to keep the last occurrence of each ID
  for (let i = agents.length - 1; i >= 0; i--) {
    const agent = agents[i];
    
    // Validate agent has required structure
    if (!agent || typeof agent !== 'object') {
      console.warn('saveAgents: Skipping invalid agent at index', i);
      continue;
    }
    
    // Normalize and validate agent ID
    const normalizedId = normalizeAgentId(agent.id);
    if (!normalizedId) {
      console.warn('saveAgents: Skipping agent without valid ID at index', i);
      continue;
    }
    
    // Only add if we haven't seen this ID yet (since we're iterating backwards)
    if (!seenIds.has(normalizedId)) {
      seenIds.add(normalizedId);
      // Ensure the agent has the normalized ID
      deduplicatedAgents.unshift({ ...agent, id: normalizedId }); // Add to front to maintain order
    } else {
      console.warn(`saveAgents: Removed duplicate agent with ID ${normalizedId}`);
    }
  }

  // Use atomicUpdate to ensure concurrency safety
  await atomicUpdate(AGENTS_FILE, () => deduplicatedAgents);
}

/**
 * Update an agent in storage (atomic read-modify-write operation)
 * @param {string} agentId - Agent ID
 * @param {Object} updates - Updates to apply to the agent
 * @returns {Promise<Object|null>} Updated agent object or null if not found
 */
async function updateAgent(agentId, updates) {
  try {
    const normalizedId = normalizeAgentId(agentId);
    if (!normalizedId) {
      throw new Error('Invalid agent ID provided');
    }

    const updatedAgents = await atomicUpdate(AGENTS_FILE, (agents) => {
      const agentIndex = agents.findIndex(a => normalizeAgentId(a.id) === normalizedId);
      
      if (agentIndex === -1) {
        return agents; // Return unchanged if not found
      }

      // Merge updates with existing agent data, ensuring ID remains normalized
      agents[agentIndex] = {
        ...agents[agentIndex],
        ...updates,
        id: normalizedId // Ensure ID stays normalized
      };

      return agents;
    });

    // Find and return the updated agent
    const updatedAgent = updatedAgents.find(a => normalizeAgentId(a.id) === normalizedId);
    return updatedAgent || null;
  } catch (error) {
    console.error('Error in updateAgent:', error);
    throw error;
  }
}

/**
 * Delete an agent from storage (atomic read-modify-write operation)
 * @param {string} agentId - Agent ID to delete
 * @returns {Promise<boolean>} True if agent was deleted, false if not found
 */
async function deleteAgent(agentId) {
  try {
    const normalizedId = normalizeAgentId(agentId);
    if (!normalizedId) {
      throw new Error('Invalid agent ID provided');
    }

    let deleted = false;
    await atomicUpdate(AGENTS_FILE, (agents) => {
      const agentIndex = agents.findIndex(a => normalizeAgentId(a.id) === normalizedId);
      
      if (agentIndex === -1) {
        return agents; // Return unchanged if not found
      }

      // Remove the agent
      agents.splice(agentIndex, 1);
      deleted = true;
      return agents;
    });

    return deleted;
  } catch (error) {
    console.error('Error in deleteAgent:', error);
    throw error;
  }
}

module.exports = {
  loadAgents,
  saveAgents,
  updateAgent,
  deleteAgent
};

