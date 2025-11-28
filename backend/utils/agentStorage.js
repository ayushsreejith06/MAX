const { readDataFile, writeDataFile } = require('./persistence');

const AGENTS_FILE = 'agents.json';

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

async function saveAgents(agents) {
  await writeDataFile(AGENTS_FILE, agents);
}

module.exports = {
  loadAgents,
  saveAgents
};

