/**
 * SystemMode - Manages system-wide mode configuration
 * Stores mode in memory (no database yet)
 * 
 * Modes:
 * - "simulation": All engines operate normally (price simulation enabled)
 * - "realtime": ConfidenceEngine runs, but SectorEngine & ExecutionEngine stop modifying prices
 */

class SystemMode {
  constructor() {
    // Default to simulation mode
    this.mode = 'simulation';
  }

  /**
   * Get current system mode
   * @returns {string} Current mode: "simulation" or "realtime"
   */
  getMode() {
    return this.mode;
  }

  /**
   * Set system mode
   * @param {string} mode - Mode to set: "simulation" or "realtime"
   * @throws {Error} If mode is invalid
   */
  setMode(mode) {
    if (mode !== 'simulation' && mode !== 'realtime') {
      throw new Error(`Invalid mode: ${mode}. Must be "simulation" or "realtime"`);
    }
    this.mode = mode;
    console.log(`[SystemMode] Mode changed to: ${mode}`);
  }

  /**
   * Check if simulation mode is enabled
   * @returns {boolean} True if mode is "simulation"
   */
  isSimulationMode() {
    return this.mode === 'simulation';
  }

  /**
   * Check if realtime mode is enabled
   * @returns {boolean} True if mode is "realtime"
   */
  isRealtimeMode() {
    return this.mode === 'realtime';
  }
}

// Singleton instance
let systemModeInstance = null;

function getSystemMode() {
  if (!systemModeInstance) {
    systemModeInstance = new SystemMode();
  }
  return systemModeInstance;
}

module.exports = { SystemMode, getSystemMode };


