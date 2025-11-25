const fs = require('fs').promises;
const path = require('path');

const STORAGE_DIR = path.join(__dirname, '..', 'storage');
const DEBATES_FILE = path.join(STORAGE_DIR, 'debates.json');

async function ensureStorageDir() {
  try {
    await fs.mkdir(STORAGE_DIR, { recursive: true });
  } catch (error) {
    // Directory already exists or other error
    if (error.code !== 'EEXIST') {
      throw error;
    }
  }
}

async function loadDebates() {
  try {
    await ensureStorageDir();
    const data = await fs.readFile(DEBATES_FILE, 'utf8');
    return JSON.parse(data);
  } catch (error) {
    if (error.code === 'ENOENT') {
      // File doesn't exist, return empty array
      await ensureStorageDir();
      await fs.writeFile(DEBATES_FILE, JSON.stringify([], null, 2));
      return [];
    }
    throw error;
  }
}

async function saveDebates(debates) {
  await ensureStorageDir();
  await fs.writeFile(DEBATES_FILE, JSON.stringify(debates, null, 2), 'utf8');
}

async function findDebateById(id) {
  const debates = await loadDebates();
  return debates.find(debate => debate.id === id) || null;
}

async function saveDebate(debate) {
  const debates = await loadDebates();
  const index = debates.findIndex(d => d.id === debate.id);
  
  if (index >= 0) {
    // Update existing debate
    debates[index] = debate;
  } else {
    // Add new debate
    debates.push(debate);
  }
  
  await saveDebates(debates);
  return debate;
}

module.exports = {
  loadDebates,
  saveDebates,
  findDebateById,
  saveDebate
};
