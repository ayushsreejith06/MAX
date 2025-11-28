const { readDataFile, writeDataFile } = require('./persistence');

const SECTORS_FILE = 'sectors.json';

/**
 * Load all sectors from storage
 * @returns {Promise<Array>} Array of sector objects
 */
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

/**
 * Save all sectors to storage
 * @param {Array} sectors - Array of sector objects
 * @returns {Promise<void>}
 */
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

/**
 * Update a sector in storage
 * @param {string} id - Sector ID
 * @param {Object} updates - Updates to apply to the sector
 * @returns {Promise<Object|null>} Updated sector object or null if not found
 */
async function updateSector(id, updates) {
  try {
    const sectors = await loadSectors();
    const sectorIndex = sectors.findIndex(s => s.id === id);
    
    if (sectorIndex === -1) {
      return null;
    }

    // Merge updates with existing sector data
    sectors[sectorIndex] = {
      ...sectors[sectorIndex],
      ...updates
    };

    await saveSectors(sectors);
    return sectors[sectorIndex];
  } catch (error) {
    console.error('Error in updateSector:', error);
    throw error;
  }
}

module.exports = {
  loadSectors,
  saveSectors,
  getSectorById,
  updateSector
};
