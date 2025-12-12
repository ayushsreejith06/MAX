const { randomUUID } = require('crypto');
const { readDataFile, atomicUpdate } = require('../utils/persistence');

const PRICE_HISTORY_FILE = 'priceHistory.json';

/**
 * PriceHistory - Model for storing sector price history
 */
class PriceHistory {
  constructor({
    id = randomUUID(),
    sectorId,
    price,
    timestamp = Date.now()
  }) {
    if (!sectorId || typeof sectorId !== 'string') {
      throw new Error('sectorId is required and must be a string');
    }

    if (typeof price !== 'number' || price < 0) {
      throw new Error('price is required and must be a non-negative number');
    }

    this.id = id;
    this.sectorId = sectorId;
    this.price = price;
    this.timestamp = typeof timestamp === 'number' ? timestamp : Date.now();
  }

  toJSON() {
    return {
      id: this.id,
      sectorId: this.sectorId,
      price: this.price,
      timestamp: this.timestamp
    };
  }

  /**
   * Save this price history entry to storage
   * @returns {Promise<void>}
   */
  async save() {
    await atomicUpdate(PRICE_HISTORY_FILE, (history) => {
      const allHistory = Array.isArray(history) ? history : [];
      
      // Add new entry
      allHistory.push(this.toJSON());
      
      // Keep only last 100000 entries to prevent file from growing too large
      // This is approximately 11.5 days of data at 10-second intervals
      if (allHistory.length > 100000) {
        return allHistory.slice(-100000);
      }
      
      return allHistory;
    });
  }

  /**
   * Get price history for a specific sector, sorted by timestamp DESC
   * @param {string} sectorId - Sector ID to filter by
   * @param {number} limit - Maximum number of entries to return (default: 1000)
   * @returns {Promise<Array<PriceHistory>>}
   */
  static async getBySectorId(sectorId, limit = 1000) {
    try {
      const history = await readDataFile(PRICE_HISTORY_FILE);
      const allHistory = Array.isArray(history) ? history : [];
      
      // Filter by sector and sort by timestamp DESC
      const sectorHistory = allHistory
        .filter(entry => entry.sectorId === sectorId)
        .sort((a, b) => (b.timestamp || 0) - (a.timestamp || 0))
        .slice(0, limit);
      
      return sectorHistory.map(entry => PriceHistory.fromData(entry));
    } catch (error) {
      if (error.code === 'ENOENT') {
        return [];
      }
      throw error;
    }
  }

  /**
   * Get price history for a specific sector within a time range
   * @param {string} sectorId - Sector ID to filter by
   * @param {number} startTime - Start timestamp (inclusive)
   * @param {number} endTime - End timestamp (inclusive)
   * @returns {Promise<Array<PriceHistory>>}
   */
  static async getBySectorIdAndTimeRange(sectorId, startTime, endTime) {
    try {
      const history = await readDataFile(PRICE_HISTORY_FILE);
      const allHistory = Array.isArray(history) ? history : [];
      
      // Filter by sector and time range, sort by timestamp DESC
      const sectorHistory = allHistory
        .filter(entry => 
          entry.sectorId === sectorId &&
          entry.timestamp >= startTime &&
          entry.timestamp <= endTime
        )
        .sort((a, b) => (b.timestamp || 0) - (a.timestamp || 0));
      
      return sectorHistory.map(entry => PriceHistory.fromData(entry));
    } catch (error) {
      if (error.code === 'ENOENT') {
        return [];
      }
      throw error;
    }
  }

  /**
   * Create PriceHistory from data object
   * @param {Object} data - History data
   * @returns {PriceHistory}
   */
  static fromData(data = {}) {
    return new PriceHistory({
      id: data.id,
      sectorId: data.sectorId,
      price: data.price,
      timestamp: data.timestamp
    });
  }

  /**
   * Get all price history with optional filters
   * @param {Object} filters - Filter options
   * @param {string} filters.sectorId - Filter by sector ID
   * @param {number} filters.startTime - Start timestamp (inclusive)
   * @param {number} filters.endTime - End timestamp (inclusive)
   * @param {number} filters.limit - Maximum number of entries to return
   * @returns {Promise<Array<PriceHistory>>}
   */
  static async getAll(filters = {}) {
    try {
      const history = await readDataFile(PRICE_HISTORY_FILE);
      let allHistory = Array.isArray(history) ? history : [];
      
      // Apply filters
      if (filters.sectorId) {
        allHistory = allHistory.filter(entry => entry.sectorId === filters.sectorId);
      }
      
      if (filters.startTime) {
        allHistory = allHistory.filter(entry => (entry.timestamp || 0) >= filters.startTime);
      }
      
      if (filters.endTime) {
        allHistory = allHistory.filter(entry => (entry.timestamp || 0) <= filters.endTime);
      }
      
      // Sort by timestamp DESC (newest first)
      allHistory.sort((a, b) => (b.timestamp || 0) - (a.timestamp || 0));
      
      // Apply limit
      if (filters.limit) {
        allHistory = allHistory.slice(0, filters.limit);
      }
      
      return allHistory.map(entry => PriceHistory.fromData(entry));
    } catch (error) {
      if (error.code === 'ENOENT') {
        return [];
      }
      throw error;
    }
  }
}

module.exports = PriceHistory;

