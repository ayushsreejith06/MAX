const { getSectorById, updateSector } = require('../utils/sectorStorage');
const { ExecutionLog } = require('../models/ExecutionLog');
const PriceHistory = require('../models/PriceHistory');

/**
 * SectorPriceSimulator - Continuously updates sector prices in the background
 * 
 * Features:
 * - One simulation loop per sector
 * - Tick interval: 10 seconds
 * - Drift calculation based on BUY executions
 * - Random noise within ±0.15%
 * - Price never goes below 0
 * - Persists price history
 */
class SectorPriceSimulator {
  constructor() {
    // Map of sectorId -> intervalId
    this.activeSimulations = new Map();
    // Map of sectorId -> last price update timestamp
    this.lastUpdateTime = new Map();
    // Tick interval in milliseconds (10 seconds)
    this.tickInterval = 10000;
  }

  /**
   * Start price simulation for a sector
   * @param {string} sectorId - Sector ID
   */
  start(sectorId) {
    // Stop existing simulation if any
    this.stop(sectorId);

    // Start new simulation loop
    const intervalId = setInterval(async () => {
      try {
        await this.tick(sectorId);
      } catch (error) {
        console.error(`[SectorPriceSimulator] Error in tick for sector ${sectorId}:`, error);
      }
    }, this.tickInterval);

    this.activeSimulations.set(sectorId, intervalId);
    console.log(`[SectorPriceSimulator] Started price simulation for sector ${sectorId}`);
  }

  /**
   * Stop price simulation for a sector
   * @param {string} sectorId - Sector ID
   */
  stop(sectorId) {
    const intervalId = this.activeSimulations.get(sectorId);
    if (intervalId) {
      clearInterval(intervalId);
      this.activeSimulations.delete(sectorId);
      this.lastUpdateTime.delete(sectorId);
      console.log(`[SectorPriceSimulator] Stopped price simulation for sector ${sectorId}`);
    }
  }

  /**
   * Stop all simulations
   */
  stopAll() {
    for (const [sectorId] of this.activeSimulations) {
      this.stop(sectorId);
    }
  }

  /**
   * Execute a single price update tick for a sector
   * @param {string} sectorId - Sector ID
   */
  async tick(sectorId) {
    const sector = await getSectorById(sectorId);
    if (!sector) {
      console.warn(`[SectorPriceSimulator] Sector ${sectorId} not found, stopping simulation`);
      this.stop(sectorId);
      return;
    }

    // Get current price (default to 100 if not set)
    const lastPrice = typeof sector.currentPrice === 'number' && sector.currentPrice > 0
      ? sector.currentPrice
      : 100;

    // Calculate drift based on recent BUY executions
    const drift = await this.calculateDrift(sectorId);

    // Generate random noise within ±0.15%
    const noise = (Math.random() * 0.003 - 0.0015); // -0.15% to +0.15%

    // Calculate new price: newPrice = lastPrice * (1 + drift + noise)
    let newPrice = lastPrice * (1 + drift + noise);

    // Ensure price never goes below 0
    newPrice = Math.max(0, newPrice);

    // Update sector price
    const previousPrice = lastPrice;
    const change = newPrice - previousPrice;
    const changePercent = previousPrice > 0 ? ((newPrice - previousPrice) / previousPrice) * 100 : 0;

    await updateSector(sectorId, {
      currentPrice: newPrice,
      change: change,
      changePercent: changePercent,
      lastSimulatedPrice: newPrice
    });

    // Persist price history
    const priceHistory = new PriceHistory({
      sectorId: sectorId,
      price: newPrice,
      timestamp: Date.now()
    });
    await priceHistory.save();

    // Update last update time
    this.lastUpdateTime.set(sectorId, Date.now());

    console.log(`[SectorPriceSimulator] Sector ${sectorId}: ${previousPrice.toFixed(2)} -> ${newPrice.toFixed(2)} (drift: ${(drift * 100).toFixed(3)}%, noise: ${(noise * 100).toFixed(3)}%)`);
  }

  /**
   * Calculate drift based on recent BUY executions
   * - BUY executions → positive bias
   * - HOLD → neutral
   * @param {string} sectorId - Sector ID
   * @returns {Promise<number>} Drift value (e.g., 0.001 for 0.1% positive drift)
   */
  async calculateDrift(sectorId) {
    try {
      // Get execution logs from the last 60 seconds (6 ticks worth)
      const now = Date.now();
      const lookbackWindow = 60000; // 60 seconds
      const startTime = now - lookbackWindow;

      const { logs } = await ExecutionLog.getAll({
        sectorId: sectorId,
        startTime: startTime,
        endTime: now
      });

      // Count BUY vs HOLD executions
      let buyCount = 0;
      let holdCount = 0;
      let totalExecutions = 0;

      for (const log of logs) {
        const action = (log.action || '').toUpperCase();
        if (action === 'BUY') {
          buyCount++;
          totalExecutions++;
        } else if (action === 'HOLD') {
          holdCount++;
          totalExecutions++;
        }
      }

      // Calculate drift:
      // - If only BUY: positive drift (e.g., +0.1%)
      // - If only HOLD: neutral (0%)
      // - Mixed: proportional to BUY ratio
      if (totalExecutions === 0) {
        return 0; // No executions, neutral drift
      }

      const buyRatio = buyCount / totalExecutions;
      // Positive drift proportional to BUY ratio (max +0.1% per tick)
      const drift = buyRatio * 0.001; // 0.1% max positive drift

      return drift;
    } catch (error) {
      console.error(`[SectorPriceSimulator] Error calculating drift for sector ${sectorId}:`, error);
      return 0; // Default to neutral drift on error
    }
  }

  /**
   * Check if simulation is running for a sector
   * @param {string} sectorId - Sector ID
   * @returns {boolean} True if simulation is active
   */
  isRunning(sectorId) {
    return this.activeSimulations.has(sectorId);
  }

  /**
   * Get all active sector IDs
   * @returns {Array<string>} Array of sector IDs with active simulations
   */
  getActiveSectors() {
    return Array.from(this.activeSimulations.keys());
  }
}

// Singleton instance
let simulatorInstance = null;

/**
 * Get the singleton SectorPriceSimulator instance
 * @returns {SectorPriceSimulator}
 */
function getSectorPriceSimulator() {
  if (!simulatorInstance) {
    simulatorInstance = new SectorPriceSimulator();
  }
  return simulatorInstance;
}

module.exports = {
  SectorPriceSimulator,
  getSectorPriceSimulator
};

