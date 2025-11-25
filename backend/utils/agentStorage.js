const fs = require('fs').promises;
const path = require('path');

const STORAGE_DIR = path.join(__dirname, '..', 'storage');
const AGENTS_FILE = path.join(STORAGE_DIR, 'agents.json');

async function ensureStorageDir() {
  try {
    await fs.mkdir(STORAGE_DIR, { recursive: true });
  } catch (error) {
    if (error.code !== 'EEXIST') {
      throw error;
    }
  }
}

async function loadAgents() {
  try {
    await ensureStorageDir();
    const data = await fs.readFile(AGENTS_FILE, 'utf8');
    return JSON.parse(data);
  } catch (error) {
    if (error.code === 'ENOENT') {
      await ensureStorageDir();
      await fs.writeFile(AGENTS_FILE, JSON.stringify([], null, 2));
      return [];
    }
    throw error;
  }
}

async function saveAgents(agents) {
  await ensureStorageDir();
  await fs.writeFile(AGENTS_FILE, JSON.stringify(agents, null, 2), 'utf8');
}

module.exports = {
  loadAgents,
  saveAgents
};

