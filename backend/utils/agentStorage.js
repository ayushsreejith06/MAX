const { readDataFile, writeDataFile, atomicUpdate } = require('./persistence');

const AGENTS_FILE = 'agents.json';

/**
 * Load all agents from storage
 * @returns {Promise<Array>} Array of agent objects
 */
async function loadAgents() {
  try {
    const data = await readDataFile(AGENTS_FILE);
    return Array.isArray(data) ? data : [];
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
    
    if (!agent.id || typeof agent.id !== 'string') {
      console.warn('saveAgents: Skipping agent without valid ID at index', i);
      continue;
    }
    
    // Only add if we haven't seen this ID yet (since we're iterating backwards)
    if (!seenIds.has(agent.id)) {
      seenIds.add(agent.id);
      deduplicatedAgents.unshift(agent); // Add to front to maintain order
    } else {
      console.warn(`saveAgents: Removed duplicate agent with ID ${agent.id}`);
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
    const updatedAgents = await atomicUpdate(AGENTS_FILE, (agents) => {
      const agentIndex = agents.findIndex(a => a.id === agentId);
      
      if (agentIndex === -1) {
        return agents; // Return unchanged if not found
      }

      // Merge updates with existing agent data
      agents[agentIndex] = {
        ...agents[agentIndex],
        ...updates
      };

      return agents;
    });

    // Find and return the updated agent
    const updatedAgent = updatedAgents.find(a => a.id === agentId);
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
    let deleted = false;
    await atomicUpdate(AGENTS_FILE, (agents) => {
      const agentIndex = agents.findIndex(a => a.id === agentId);
      
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

