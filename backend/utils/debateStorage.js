const { readDataFile, writeDataFile } = require('./persistence');

const DEBATES_FILE = 'debates.json';

async function loadDebates() {
  try {
    const data = await readDataFile(DEBATES_FILE);
    return Array.isArray(data) ? data : [];
  } catch (error) {
    // If file doesn't exist, return empty array and create it
    if (error.code === 'ENOENT') {
      await writeDataFile(DEBATES_FILE, []);
      return [];
    }
    throw error;
  }
}

async function saveDebates(debates) {
  await writeDataFile(DEBATES_FILE, debates);
}

async function findDebateById(id) {
  const debates = await loadDebates();
  return debates.find(d => d.id === id) || null;
}

async function saveDebate(debate) {
  const debates = await loadDebates();
  const idx = debates.findIndex(d => d.id === debate.id);

  const data = debate.toJSON ? debate.toJSON() : debate;

  if (idx >= 0) {
    debates[idx] = data;
  } else {
    debates.push(data);
  }

  await saveDebates(debates);
}

module.exports = {
  loadDebates,
  saveDebates,
  findDebateById,
  saveDebate
};
