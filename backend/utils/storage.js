const { readDataFile, writeDataFile } = require('./persistence');

const SECTORS_FILE = 'sectors.json';

async function loadSectors() {
  try {
    const data = await readDataFile(SECTORS_FILE);
    return Array.isArray(data) ? data : [];
  } catch (error) {
    // If file doesn't exist, return empty array and create it
    if (error.code === 'ENOENT') {
      await writeDataFile(SECTORS_FILE, []);
      return [];
    }
    throw error;
  }
}

async function saveSectors(sectors) {
  await writeDataFile(SECTORS_FILE, sectors);
}

module.exports = {
  loadSectors,
  saveSectors
};

