const { readDataFile, writeDataFile, atomicUpdate } = require('./persistence');
const { v4: uuidv4 } = require('uuid');

const SECTORS_FILE = 'sectors.json';

/**
 * Get all sectors from storage
 * @returns {Promise<Array>} Array of sector objects
 */
async function getAllSectors() {
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
 * Get a sector by ID
 * @param {string} id - Sector ID
 * @returns {Promise<Object|null>} Sector object or null if not found
 */
async function getSectorById(id) {
  try {
    const sectors = await getAllSectors();
    return sectors.find(s => s.id === id) || null;
  } catch (error) {
    console.error('Error in getSectorById:', error);
    return null;
  }
}

/**
 * Create a new sector
 * @param {Object} data - Sector data
 * @returns {Promise<Object>} Created sector object
 */
async function createSector(data) {
  const sectors = await atomicUpdate(SECTORS_FILE, (currentSectors) => {
    const newSector = {
      id: data.id || uuidv4(),
      name: data.name || data.sectorName || '',
      sectorName: data.sectorName || data.name || '',
      sectorSymbol: (data.sectorSymbol || data.symbol || '').trim(),
      description: data.description || '',
      agents: data.agents || [],
      performance: data.performance || {}
    };
    
    currentSectors.push(newSector);
    return currentSectors;
  });

  // Return the newly created sector
  return sectors[sectors.length - 1];
}

/**
 * Update a sector in storage
 * @param {string} id - Sector ID
 * @param {Object} updates - Updates to apply to the sector
 * @returns {Promise<Object|null>} Updated sector object or null if not found
 */
async function updateSector(id, updates) {
  const sectors = await atomicUpdate(SECTORS_FILE, (currentSectors) => {
    const sectorIndex = currentSectors.findIndex(s => s.id === id);
    
    if (sectorIndex === -1) {
      return currentSectors; // Return unchanged if not found
    }

    // Merge updates with existing sector data
    currentSectors[sectorIndex] = {
      ...currentSectors[sectorIndex],
      ...updates
    };

    return currentSectors;
  });

  // Find and return the updated sector
  return sectors.find(s => s.id === id) || null;
}

/**
 * Delete a sector from storage (atomic read-modify-write operation)
 * @param {string} sectorId - Sector ID to delete
 * @returns {Promise<boolean>} True if sector was deleted, false if not found
 */
async function deleteSector(sectorId) {
  try {
    let deleted = false;
    await atomicUpdate(SECTORS_FILE, (sectors) => {
      const sectorIndex = sectors.findIndex(s => s.id === sectorId);
      
      if (sectorIndex === -1) {
        return sectors; // Return unchanged if not found
      }

      // Remove the sector
      sectors.splice(sectorIndex, 1);
      deleted = true;
      return sectors;
    });

    return deleted;
  } catch (error) {
    console.error('Error in deleteSector:', error);
    throw error;
  }
}

module.exports = {
  getAllSectors,
  getSectorById,
  createSector,
  updateSector,
  deleteSector
};

