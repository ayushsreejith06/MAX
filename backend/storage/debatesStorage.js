const fs = require('fs').promises;
const path = require('path');

const STORAGE_DIR = path.join(__dirname, '..', 'storage');
const DEBATES_FILE = path.join(STORAGE_DIR, 'debates.json');

async function ensureStorageDir() {
  try {
    await fs.mkdir(STORAGE_DIR, { recursive: true });
  } catch (error) {
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

async function saveDebate(updatedDebate) {
  const debates = await loadDebates();
  const debateIndex = debates.findIndex(debate => debate.id === updatedDebate.id);
  
  const debateData = updatedDebate.toJSON ? updatedDebate.toJSON() : updatedDebate;
  
  if (debateIndex >= 0) {
    debates[debateIndex] = debateData;
  } else {
    debates.push(debateData);
  }
  
  await saveDebates(debates);
  return debateData;
}

module.exports = {
  loadDebates,
  saveDebates,
  findDebateById,
  saveDebate
};

