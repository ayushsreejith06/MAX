const { randomUUID } = require('crypto');
const { readDataFile, writeDataFile, atomicUpdate } = require('../utils/persistence');

const EXECUTION_LOGS_FILE = 'executionLogs.json';

class ExecutionLog {
  constructor({
    id = randomUUID(),
    sectorId,
    action,
    impact,
    timestamp = Date.now()
  }) {
    if (!sectorId || typeof sectorId !== 'string') {
      throw new Error('sectorId is required and must be a string');
    }

    if (!action || typeof action !== 'string') {
      throw new Error('action is required and must be a string');
    }

    if (typeof impact !== 'number') {
      throw new Error('impact is required and must be a number');
    }

    this.id = id;
    this.sectorId = sectorId;
    this.action = action;
    this.impact = impact;
    this.timestamp = typeof timestamp === 'number' ? timestamp : Date.now();
  }

  toJSON() {
    return {
      id: this.id,
      sectorId: this.sectorId,
      action: this.action,
      impact: this.impact,
      timestamp: this.timestamp
    };
  }

  /**
   * Save this execution log to storage
   * @returns {Promise<void>}
   */
  async save() {
    await atomicUpdate(EXECUTION_LOGS_FILE, (logs) => {
      const allLogs = Array.isArray(logs) ? logs : [];
      
      // Add new log
      allLogs.push(this.toJSON());
      
      // Keep only last 10000 logs to prevent file from growing too large
      if (allLogs.length > 10000) {
        return allLogs.slice(-10000);
      }
      
      return allLogs;
    });
  }

  /**
   * Get all execution logs for a specific sector, sorted by timestamp DESC
   * @param {string} sectorId - Sector ID to filter by
   * @returns {Promise<Array<ExecutionLog>>}
   */
  static async getBySectorId(sectorId) {
    try {
      const logs = await readDataFile(EXECUTION_LOGS_FILE);
      const allLogs = Array.isArray(logs) ? logs : [];
      
      // Filter by sector and sort by timestamp DESC
      const sectorLogs = allLogs
        .filter(log => log.sectorId === sectorId)
        .sort((a, b) => (b.timestamp || 0) - (a.timestamp || 0));
      
      return sectorLogs.map(log => ExecutionLog.fromData(log));
    } catch (error) {
      if (error.code === 'ENOENT') {
        return [];
      }
      throw error;
    }
  }

  /**
   * Create ExecutionLog from data object
   * @param {Object} data - Log data
   * @returns {ExecutionLog}
   */
  static fromData(data = {}) {
    return new ExecutionLog({
      id: data.id,
      sectorId: data.sectorId,
      action: data.action,
      impact: data.impact,
      timestamp: data.timestamp
    });
  }
}

module.exports = ExecutionLog;

