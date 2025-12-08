const { readDataFile, writeDataFile, atomicUpdate } = require('./persistence');

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
 * Validates JSON structure, removes duplicate IDs, and ensures atomic write
 * @param {Array} sectors - Array of sector objects
 * @returns {Promise<void>}
 */
async function saveSectors(sectors) {
  // Validate input is an array
  if (!Array.isArray(sectors)) {
    throw new Error('saveSectors: sectors must be an array');
  }

  // Remove duplicates by ID (keep last occurrence)
  const seenIds = new Set();
  const deduplicatedSectors = [];
  
  // Iterate in reverse to keep the last occurrence of each ID
  for (let i = sectors.length - 1; i >= 0; i--) {
    const sector = sectors[i];
    
    // Validate sector has required structure
    if (!sector || typeof sector !== 'object') {
      console.warn('saveSectors: Skipping invalid sector at index', i);
      continue;
    }
    
    if (!sector.id || typeof sector.id !== 'string') {
      console.warn('saveSectors: Skipping sector without valid ID at index', i);
      continue;
    }
    
    // Only add if we haven't seen this ID yet (since we're iterating backwards)
    if (!seenIds.has(sector.id)) {
      seenIds.add(sector.id);
      deduplicatedSectors.unshift(sector); // Add to front to maintain order
    } else {
      console.warn(`saveSectors: Removed duplicate sector with ID ${sector.id}`);
    }
  }

  // Use atomicUpdate to ensure concurrency safety
  await atomicUpdate(SECTORS_FILE, () => deduplicatedSectors);
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
 * Update a sector in storage (atomic read-modify-write operation)
 * @param {string} id - Sector ID
 * @param {Object} updates - Updates to apply to the sector
 * @returns {Promise<Object|null>} Updated sector object or null if not found
 */
async function updateSector(id, updates) {
  try {
    const updatedSectors = await atomicUpdate(SECTORS_FILE, (sectors) => {
      const sectorIndex = sectors.findIndex(s => s.id === id);
      
      if (sectorIndex === -1) {
        return sectors; // Return unchanged if not found
      }

      // Merge updates with existing sector data
      sectors[sectorIndex] = {
        ...sectors[sectorIndex],
        ...updates
      };

      return sectors;
    });

    // Find and return the updated sector
    const updatedSector = updatedSectors.find(s => s.id === id);
    return updatedSector || null;
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
