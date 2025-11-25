const fs = require('fs').promises;
const path = require('path');

const STORAGE_DIR = path.join(__dirname, '..', 'storage');
const SECTORS_FILE = path.join(STORAGE_DIR, 'sectors.json');

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

async function loadSectors() {
  try {
    await ensureStorageDir();
    const data = await fs.readFile(SECTORS_FILE, 'utf8');
    return JSON.parse(data);
  } catch (error) {
    if (error.code === 'ENOENT') {
      // File doesn't exist, return empty array
      await ensureStorageDir();
      await fs.writeFile(SECTORS_FILE, JSON.stringify([], null, 2));
      return [];
    }
    throw error;
  }
}

async function saveSectors(sectors) {
  await ensureStorageDir();
  await fs.writeFile(SECTORS_FILE, JSON.stringify(sectors, null, 2), 'utf8');
}

module.exports = {
  loadSectors,
  saveSectors
};

