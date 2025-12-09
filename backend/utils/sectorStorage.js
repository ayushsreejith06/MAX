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
    if (!id || typeof id !== 'string') {
      console.warn('[getSectorById] Invalid ID provided:', id, typeof id);
      return null;
    }
    
    const sectors = await getAllSectors();
    const trimmedId = id.trim();
    
    // Try exact match first
    let sector = sectors.find(s => s && s.id === trimmedId);
    
    // If not found, try with trimmed comparison (in case of whitespace issues)
    if (!sector) {
      sector = sectors.find(s => s && s.id && String(s.id).trim() === trimmedId);
    }
    
    // If still not found, try case-insensitive match (shouldn't be needed for UUIDs, but just in case)
    if (!sector) {
      sector = sectors.find(s => s && s.id && String(s.id).toLowerCase() === trimmedId.toLowerCase());
    }
    
    if (!sector) {
      console.warn(`[getSectorById] Sector with ID "${trimmedId}" not found. Total sectors: ${sectors.length}`);
    }
    
    return sector || null;
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
  // Ensure we have a valid ID
  const sectorId = data.id || uuidv4();
  console.log(`[createSector] Creating sector with ID: ${sectorId}`);
  
  const sectors = await atomicUpdate(SECTORS_FILE, (currentSectors) => {
    // Ensure currentSectors is an array
    if (!Array.isArray(currentSectors)) {
      console.warn('[createSector] currentSectors is not an array, initializing:', typeof currentSectors);
      currentSectors = [];
    }
    
    // Standardize on name/symbol as primary fields, keep sectorName/sectorSymbol for backward compatibility
    const sectorName = data.name || data.sectorName || '';
    const sectorSymbol = (data.sectorSymbol || data.symbol || '').trim();
    
    const newSector = {
      id: sectorId,
      // Primary standardized fields
      name: sectorName,
      symbol: sectorSymbol,
      // Backward compatibility fields
      sectorName: sectorName,
      sectorSymbol: sectorSymbol,
      description: data.description || '',
      agents: data.agents || [],
      performance: data.performance || {},
      balance: typeof data.balance === 'number' ? data.balance : 0, // Default balance to 0 for new sectors
      currentPrice: typeof data.currentPrice === 'number' ? data.currentPrice : 0, // Default currentPrice to 0 for new sectors
      change: typeof data.change === 'number' ? data.change : 0,
      changePercent: typeof data.changePercent === 'number' ? data.changePercent : 0,
      volatility: typeof data.volatility === 'number' ? data.volatility : 0.02,
      riskScore: typeof data.riskScore === 'number' ? data.riskScore : 50,
      createdAt: data.createdAt || new Date().toISOString(),
      // Discussion tracking state (null for new sectors)
      discussion: data.discussion !== undefined ? data.discussion : null
    };
    
    console.log(`[createSector] Adding sector to array. Current length: ${currentSectors.length}, New sector ID: ${newSector.id}`);
    currentSectors.push(newSector);
    console.log(`[createSector] Array length after push: ${currentSectors.length}`);
    return currentSectors;
  });

  // Verify the sector was added
  if (!Array.isArray(sectors) || sectors.length === 0) {
    console.error('[createSector] ERROR: sectors array is empty or invalid after creation!', sectors);
    throw new Error('Failed to create sector: sectors array is invalid');
  }

  const createdSector = sectors[sectors.length - 1];
  if (!createdSector || createdSector.id !== sectorId) {
    console.error('[createSector] ERROR: Created sector ID mismatch!', {
      expected: sectorId,
      actual: createdSector?.id,
      allIds: sectors.map(s => s.id)
    });
    throw new Error(`Failed to create sector: ID mismatch. Expected ${sectorId}, got ${createdSector?.id}`);
  }

  console.log(`[createSector] Successfully created sector with ID: ${createdSector.id}`);
  return createdSector;
}

/**
 * Update a sector in storage
 * @param {string} id - Sector ID
 * @param {Object} updates - Updates to apply to the sector
 * @returns {Promise<Object|null>} Updated sector object or null if not found
 */
async function updateSector(id, updates) {
  console.log(`[updateSector] Updating sector with ID: ${id}`);
  
  const sectors = await atomicUpdate(SECTORS_FILE, (currentSectors) => {
    // Ensure currentSectors is an array
    if (!Array.isArray(currentSectors)) {
      console.warn('[updateSector] currentSectors is not an array:', typeof currentSectors);
      return currentSectors;
    }
    
    const sectorIndex = currentSectors.findIndex(s => s && s.id === id);
    
    if (sectorIndex === -1) {
      console.warn(`[updateSector] Sector with ID ${id} not found in array. Available IDs:`, currentSectors.map(s => s?.id));
      return currentSectors; // Return unchanged if not found
    }

    // Merge updates with existing sector data, but NEVER overwrite the ID
    const updatedSector = {
      ...currentSectors[sectorIndex],
      ...updates,
      id: currentSectors[sectorIndex].id // Always preserve the original ID
    };

    console.log(`[updateSector] Updated sector at index ${sectorIndex}, ID: ${updatedSector.id}`);
    currentSectors[sectorIndex] = updatedSector;

    return currentSectors;
  });

  // Find and return the updated sector
  const updatedSector = sectors.find(s => s && s.id === id) || null;
  if (!updatedSector) {
    console.error(`[updateSector] ERROR: Sector with ID ${id} not found after update! Available IDs:`, sectors.map(s => s?.id));
  } else {
    console.log(`[updateSector] Successfully updated sector with ID: ${updatedSector.id}`);
  }
  return updatedSector;
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

