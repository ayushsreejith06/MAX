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

/**
 * Get a sector by ID
 * @param {string} id - Sector ID
 * @returns {Promise<Object|null>} Sector object or null if not found
 */
async function getSectorById(id) {
  try {
    const sectors = await loadSectors();
    return sectors.find(s => s.id === id) || null;
  } catch (error) {
    console.error('Error in getSectorById:', error);
    return null;
  }
}

module.exports = {
  loadSectors,
  saveSectors,
  getSectorById
};

