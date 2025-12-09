/**
 * SimulationEngine - Handles simulation ticks for sectors
 * Only runs when sector.simulationMode === true
 */

const { updateSector } = require('../utils/sectorStorage');

interface Sector {
  id: string;
  simulationMode?: boolean;
  currentPrice?: number;
  lastSimulatedPrice?: number;
  simulatedPrice?: number;
  volatility?: number;
  trendCurve?: number;
  performance?: {
    totalPL?: number;
    pnl?: number;
    pnlPercent?: number;
    position?: number;
    capital?: number;
    totalValue?: number;
    lastUpdated?: string;
    lastExecutionAt?: string;
  };
  lastExecutionAt?: string;
  lastPriceUpdate?: number;
  [key: string]: any;
}

interface ExecutionImpact {
  managerImpact?: number;
}

class SimulationEngine {
  /**
   * Run a simulation tick for a sector
   * Only runs if sector.simulationMode === true
   * 
   * Steps performed each tick:
   * 1. Apply long-term trend curve to sector price
   * 2. Apply volatility noise (same method used in ExecutionEngine)
   * 3. Apply random noise
   * 4. If a checklist was recently executed, apply execution-based managerImpact
   * 5. Update simulated price
   * 6. Update performance
   * 7. Save updates to sector state
   * 
   * @param {Sector} sector - Sector object to tick
   * @returns {Promise<void>}
   */
  async tick(sector: Sector): Promise<void> {
    // Only run if sector.simulationMode === true
    if (!sector || sector.simulationMode !== true) {
      return;
    }

    // Prevent infinite loops and rapid state writes
    const now = Date.now();
    const lastUpdate = sector.lastPriceUpdate || 0;
    const MIN_TICK_INTERVAL = 1000; // Minimum 1 second between ticks

    if (now - lastUpdate < MIN_TICK_INTERVAL) {
      // Skip if called too frequently
      return;
    }

    try {
      // Step 1: Apply long-term trend curve to sector price
      const oldPrice = sector.simulatedPrice || sector.currentPrice || sector.lastSimulatedPrice || 100;
      const trendComponent = typeof sector.trendCurve === 'number' ? sector.trendCurve : 0;

      // Step 2: Apply volatility noise (same method used in ExecutionEngine)
      // Calculate volatility: vol = sector.volatility / 100
      const vol = typeof sector.volatility === 'number' ? sector.volatility / 100 : 0.02 / 100;
      // Generate volatility noise: random in [-vol, +vol]
      const volatilityNoise = (Math.random() * 2 - 1) * vol;

      // Step 3: Apply random noise
      // Generate random noise: random in [-0.005, +0.005]
      const randomNoise = (Math.random() * 2 - 1) * 0.005;

      // Step 4: If a checklist was recently executed, apply execution-based managerImpact
      let managerImpact = 0;
      const RECENT_EXECUTION_WINDOW = 5000; // 5 seconds
      
      const lastExecutionAt = sector.performance?.lastExecutionAt || sector.lastExecutionAt;
      if (lastExecutionAt) {
        const executionTime = new Date(lastExecutionAt).getTime();
        const timeSinceExecution = now - executionTime;
        
        if (timeSinceExecution < RECENT_EXECUTION_WINDOW) {
          // Checklist was recently executed, calculate managerImpact
          // This mimics the logic from ExecutionEngine.interpretChecklistItem
          // For simplicity, we'll use a small impact based on recent execution
          // In a full implementation, this would come from the actual execution result
          const currentExposure = typeof sector.exposure === 'number' 
            ? sector.exposure 
            : (typeof sector.position === 'number' ? sector.position : 0);
          
          // Apply a small positive impact for recent execution (simplified)
          // In production, this would come from the actual execution result's managerImpact
          managerImpact = 0.001; // Small positive impact
        }
      }

      // Calculate new price using the formula (same as ExecutionEngine.updateSimulatedPrice)
      let newPrice = oldPrice * (1 + volatilityNoise + randomNoise + trendComponent + managerImpact);

      // Clamp newPrice to minimum 0.01
      newPrice = Math.max(0.01, newPrice);

      // Step 5: Update simulated price
      const priceChange = newPrice - oldPrice;
      const priceChangePercent = oldPrice > 0 ? ((newPrice - oldPrice) / oldPrice) * 100 : 0;

      // Step 6: Update performance
      const previousCapital = typeof sector.balance === 'number' ? sector.balance : 0;
      const previousPosition = typeof sector.position === 'number' 
        ? sector.position 
        : (sector.performance?.position || 0);
      const previousTotalValue = previousCapital + previousPosition;

      // Calculate current total value (simplified - in production would use actual position/capital)
      const currentTotalValue = previousTotalValue; // Keep same for now, or calculate based on price change
      const pnl = currentTotalValue - previousTotalValue;
      const pnlPercent = previousTotalValue > 0 ? (pnl / previousTotalValue) * 100 : 0;

      const updatedPerformance = {
        ...sector.performance,
        totalPL: (sector.performance?.totalPL || 0) + pnl,
        pnl: pnl,
        pnlPercent: pnlPercent,
        position: previousPosition,
        capital: previousCapital,
        totalValue: currentTotalValue,
        lastUpdated: new Date().toISOString()
      };

      // Step 7: Save updates to sector state
      const updates = {
        simulatedPrice: newPrice,
        currentPrice: newPrice,
        lastSimulatedPrice: newPrice,
        lastPriceUpdate: now,
        change: priceChange,
        changePercent: priceChangePercent,
        performance: updatedPerformance
      };

      await updateSector(sector.id, updates);
    } catch (error) {
      console.error(`[SimulationEngine] Error in tick for sector ${sector.id}:`, error);
      // Don't throw - allow other sectors to continue ticking
    }
  }
}

// Singleton instance
let simulationEngineInstance: SimulationEngine | null = null;

function getSimulationEngine(): SimulationEngine {
  if (!simulationEngineInstance) {
    simulationEngineInstance = new SimulationEngine();
  }
  return simulationEngineInstance;
}

module.exports = { SimulationEngine, getSimulationEngine };

