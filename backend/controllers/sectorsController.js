const Sector = require('../models/Sector');
const { loadSectors, saveSectors } = require('../utils/storage');

function validateSectorName(name) {
  if (!name) {
    return { valid: false, error: 'Name is required' };
  }
  if (typeof name !== 'string' || name.trim().length === 0) {
    return { valid: false, error: 'Name must be a non-empty string' };
  }
  return { valid: true };
}

async function createSector(name) {
  // Validate input
  const validation = validateSectorName(name);
  if (!validation.valid) {
    throw new Error(validation.error);
  }

  // Create new sector
  const sector = new Sector(name.trim());

  // Load existing sectors
  const sectors = await loadSectors();

  // Add new sector
  sectors.push(sector.toJSON());

  // Save to file
  await saveSectors(sectors);

  return sector;
}

async function getSectors() {
  const sectors = await loadSectors();
  return sectors;
}

async function getSectorById(id) {
  const sectors = await loadSectors();
  return sectors.find(sector => sector.id === id) || null;
}

module.exports = {
  createSector,
  getSectors,
  getSectorById
};

