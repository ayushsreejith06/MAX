const path = require('path');
const fs = require('fs').promises;

/**
 * Get the data directory for storing application data.
 * In desktop mode, uses MAX_APP_DATA_DIR environment variable.
 * Otherwise, uses the default backend/storage directory.
 */
function getDataDir() {
  const MAX_ENV = process.env.MAX_ENV || 'web';
  const MAX_APP_DATA_DIR = process.env.MAX_APP_DATA_DIR;

  if (MAX_ENV === 'desktop' && MAX_APP_DATA_DIR) {
    // Desktop mode: use the provided app data directory
    return MAX_APP_DATA_DIR;
  }

  // Default: use backend/storage directory
  return path.join(__dirname, '..', 'storage');
}

/**
 * Ensure the data directory exists, creating it if necessary.
 */
async function ensureDataDir() {
  const dataDir = getDataDir();
  try {
    await fs.mkdir(dataDir, { recursive: true });
  } catch (error) {
    if (error.code !== 'EEXIST') {
      throw error;
    }
  }
  return dataDir;
}

/**
 * Get the full path to a data file within the data directory.
 * @param {string} filename - The name of the file (e.g., 'sectors.json')
 * @returns {string} Full path to the file
 */
function getDataFilePath(filename) {
  return path.join(getDataDir(), filename);
}

/**
 * Read a JSON file from the data directory.
 * @param {string} filename - The name of the file to read
 * @returns {Promise<any>} Parsed JSON data
 */
async function readDataFile(filename) {
  await ensureDataDir();
  const filePath = getDataFilePath(filename);
  try {
    const data = await fs.readFile(filePath, 'utf8');
    return JSON.parse(data);
  } catch (error) {
    if (error.code === 'ENOENT') {
      // File doesn't exist, return empty array for list files, null for single items
      return filename.endsWith('.json') && (filename.includes('sectors') || filename.includes('agents') || filename.includes('discussions')) ? [] : null;
    }
    throw error;
  }
}

/**
 * Write a JSON file to the data directory.
 * @param {string} filename - The name of the file to write
 * @param {any} data - The data to write (will be JSON stringified)
 */
async function writeDataFile(filename, data) {
  await ensureDataDir();
  const filePath = getDataFilePath(filename);
  await fs.writeFile(filePath, JSON.stringify(data, null, 2), 'utf8');
}

module.exports = {
  getDataDir,
  ensureDataDir,
  getDataFilePath,
  readDataFile,
  writeDataFile
};

