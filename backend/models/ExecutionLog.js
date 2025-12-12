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

  /**
   * Get all execution logs with optional filters
   * @param {Object} filters - Filter options
   * @param {string} filters.sectorId - Filter by sector ID
   * @param {string} filters.managerId - Filter by manager ID (from checklistId/discussionId)
   * @param {string} filters.discussionId - Filter by discussion ID
   * @param {number} filters.startTime - Start timestamp (inclusive)
   * @param {number} filters.endTime - End timestamp (inclusive)
   * @param {number} filters.page - Page number (1-based)
   * @param {number} filters.pageSize - Items per page
   * @returns {Promise<Object>} Object with logs array and pagination info
   */
  static async getAll(filters = {}) {
    try {
      const logs = await readDataFile(EXECUTION_LOGS_FILE);
      let allLogs = Array.isArray(logs) ? logs : [];
      
      // Apply filters
      if (filters.sectorId) {
        allLogs = allLogs.filter(log => log.sectorId === filters.sectorId);
      }
      
      if (filters.managerId) {
        // Manager ID can be in managerId field, checklistId, or discussionId field
        allLogs = allLogs.filter(log => 
          log.managerId === filters.managerId ||
          (log.checklistId && log.checklistId.includes(filters.managerId)) ||
          (log.discussionId && log.discussionId.includes(filters.managerId))
        );
      }
      
      if (filters.discussionId) {
        allLogs = allLogs.filter(log => 
          log.checklistId === filters.discussionId || 
          log.discussionId === filters.discussionId
        );
      }
      
      if (filters.startTime) {
        allLogs = allLogs.filter(log => (log.timestamp || 0) >= filters.startTime);
      }
      
      if (filters.endTime) {
        allLogs = allLogs.filter(log => (log.timestamp || 0) <= filters.endTime);
      }
      
      // Sort by timestamp DESC (newest first)
      allLogs.sort((a, b) => (b.timestamp || 0) - (a.timestamp || 0));
      
      // Pagination
      const page = filters.page || 1;
      const pageSize = filters.pageSize || 20;
      const total = allLogs.length;
      const totalPages = Math.ceil(total / pageSize);
      const startIndex = (page - 1) * pageSize;
      const endIndex = startIndex + pageSize;
      const paginatedLogs = allLogs.slice(startIndex, endIndex);
      
      return {
        logs: paginatedLogs,
        pagination: {
          page,
          pageSize,
          total,
          totalPages
        }
      };
    } catch (error) {
      if (error.code === 'ENOENT') {
        return {
          logs: [],
          pagination: {
            page: filters.page || 1,
            pageSize: filters.pageSize || 20,
            total: 0,
            totalPages: 0
          }
        };
      }
      throw error;
    }
  }
}

module.exports = ExecutionLog;



