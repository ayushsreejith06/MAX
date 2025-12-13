const { readDataFile, writeDataFile, atomicUpdate } = require('./persistence');
const PriceTick = require('../models/PriceTick');

const PRICE_HISTORY_FILE = 'priceHistory.json';

/**
 * Initialize price history storage file if it doesn't exist
 */
async function ensurePriceHistoryFile() {
  try {
    await readDataFile(PRICE_HISTORY_FILE);
  } catch (error) {
    if (error.code === 'ENOENT') {
      await writeDataFile(PRICE_HISTORY_FILE, {});
    } else {
      throw error;
    }
  }
}

/**
 * Store a price tick for a sector
 * Only stores if the valuation has actually changed from the last stored tick
 * This ensures the chart only shows actual valuation changes, not synthetic points
 * @param {string} sectorId - Sector ID
 * @param {Object} tickData - Price tick data (price, timestamp, volume, change, changePercent)
 * @returns {Promise<Object|null>} Stored price tick, or null if price hasn't changed
 */
async function storePriceTick(sectorId, tickData) {
  if (!sectorId || typeof sectorId !== 'string') {
    throw new Error('sectorId is required and must be a string');
  }

  await ensurePriceHistoryFile();

  const normalizedSectorId = sectorId.trim().toLowerCase();
  const newPrice = typeof tickData.price === 'number' ? tickData.price : 0;
  const newTimestamp = tickData.timestamp || Date.now();

  // Check if price has changed before storing
  let shouldStore = false;
  let storedTick = null;

  await atomicUpdate(PRICE_HISTORY_FILE, (history) => {
    if (!history || typeof history !== 'object') {
      history = {};
    }

    if (!history[normalizedSectorId]) {
      history[normalizedSectorId] = [];
    }

    const sectorHistory = history[normalizedSectorId];
    
    // Get the last stored tick to compare prices
    const lastTick = sectorHistory.length > 0 
      ? sectorHistory[sectorHistory.length - 1] 
      : null;
    
    // Only store if:
    // 1. This is the first tick (no history), OR
    // 2. The price has actually changed (with a small tolerance for floating point precision)
    const priceTolerance = 0.0001; // Allow for floating point precision issues
    const priceChanged = !lastTick || 
      Math.abs(Number(lastTick.price) - newPrice) > priceTolerance;

    if (priceChanged) {
      const tick = new PriceTick({
        sectorId: normalizedSectorId,
        price: newPrice,
        timestamp: newTimestamp,
        volume: tickData.volume || 0,
        change: tickData.change || 0,
        changePercent: tickData.changePercent || 0
      });

      // Add new tick
      sectorHistory.push(tick.toJSON());
      storedTick = tick.toJSON();
      shouldStore = true;

      // Keep only last 10000 ticks per sector to prevent unbounded growth
      // In production, you might want to archive old data or use a time-based cleanup
      if (sectorHistory.length > 10000) {
        history[normalizedSectorId] = sectorHistory.slice(-10000);
      }
    }

    return history;
  });

  return shouldStore ? storedTick : null;
}

/**
 * Get price history for a sector within a time window
 * @param {string} sectorId - Sector ID
 * @param {Object} options - Query options
 * @param {number} options.startTime - Start timestamp (milliseconds)
 * @param {number} options.endTime - End timestamp (milliseconds)
 * @param {number} options.limit - Maximum number of ticks to return (optional)
 * @returns {Promise<Array>} Array of price ticks, ordered by timestamp (ascending)
 */
async function getPriceHistory(sectorId, options = {}) {
  if (!sectorId || typeof sectorId !== 'string') {
    throw new Error('sectorId is required and must be a string');
  }

  await ensurePriceHistoryFile();

  const history = await readDataFile(PRICE_HISTORY_FILE);
  const normalizedSectorId = sectorId.trim().toLowerCase();

  if (!history || !history[normalizedSectorId] || !Array.isArray(history[normalizedSectorId])) {
    return [];
  }

  let ticks = history[normalizedSectorId];

  // Filter by time window if provided
  if (options.startTime !== undefined || options.endTime !== undefined) {
    const startTime = options.startTime !== undefined ? Number(options.startTime) : 0;
    const endTime = options.endTime !== undefined ? Number(options.endTime) : Date.now();

    ticks = ticks.filter(tick => {
      const tickTime = Number(tick.timestamp);
      return tickTime >= startTime && tickTime <= endTime;
    });
  }

  // Sort by timestamp (ascending - oldest first)
  ticks.sort((a, b) => Number(a.timestamp) - Number(b.timestamp));

  // Apply limit if provided
  if (options.limit !== undefined && options.limit > 0) {
    ticks = ticks.slice(-options.limit); // Get last N ticks
  }

  return ticks;
}

/**
 * Get price history for a sector using a time window in hours/minutes
 * @param {string} sectorId - Sector ID
 * @param {Object} options - Query options
 * @param {number} options.windowHours - Time window in hours (e.g., 6, 12, 24)
 * @param {number} options.windowMinutes - Time window in minutes (alternative to hours)
 * @param {number} options.limit - Maximum number of ticks to return (optional)
 * @returns {Promise<Array>} Array of price ticks
 */
async function getPriceHistoryByWindow(sectorId, options = {}) {
  const now = Date.now();
  let windowMs = 6 * 60 * 60 * 1000; // Default: 6 hours

  if (options.windowHours !== undefined) {
    windowMs = options.windowHours * 60 * 60 * 1000;
  } else if (options.windowMinutes !== undefined) {
    windowMs = options.windowMinutes * 60 * 1000;
  }

  const startTime = now - windowMs;

  return getPriceHistory(sectorId, {
    startTime: startTime,
    endTime: now,
    limit: options.limit
  });
}

/**
 * Get all price history for a sector (no time limit)
 * @param {string} sectorId - Sector ID
 * @param {number} limit - Maximum number of ticks to return (optional)
 * @returns {Promise<Array>} Array of price ticks
 */
async function getAllPriceHistory(sectorId, limit) {
  return getPriceHistory(sectorId, { limit });
}

/**
 * Clean up old price history (keep only last N days)
 * @param {number} daysToKeep - Number of days of history to keep
 * @returns {Promise<number>} Number of ticks removed
 */
async function cleanupOldHistory(daysToKeep = 30) {
  await ensurePriceHistoryFile();

  const cutoffTime = Date.now() - (daysToKeep * 24 * 60 * 60 * 1000);
  let totalRemoved = 0;

  await atomicUpdate(PRICE_HISTORY_FILE, (history) => {
    if (!history || typeof history !== 'object') {
      return history || {};
    }

    for (const sectorId in history) {
      if (Array.isArray(history[sectorId])) {
        const beforeLength = history[sectorId].length;
        history[sectorId] = history[sectorId].filter(tick => {
          return Number(tick.timestamp) >= cutoffTime;
        });
        totalRemoved += beforeLength - history[sectorId].length;
      }
    }

    return history;
  });

  return totalRemoved;
}

module.exports = {
  storePriceTick,
  getPriceHistory,
  getPriceHistoryByWindow,
  getAllPriceHistory,
  cleanupOldHistory
};

