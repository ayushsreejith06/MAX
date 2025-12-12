/**
 * SimulationEngine - Handles simulation ticks for sectors
 * Only runs when sector.simulationMode === true
 */

const { updateSector } = require('../utils/sectorStorage');
const { calculateCurrentDrift } = require('../simulation/executionDrift');
const { storePriceTick } = require('../utils/priceHistoryStorage');

interface Sector {
  id: string;
  sectorType?: string;
  simulationMode?: boolean;
  currentPrice?: number;
  lastSimulatedPrice?: number;
  simulatedPrice?: number;
  volatility?: number;
  trendCurve?: number;
  trendDescriptor?: string;
  baselinePrice?: number;
  initialPrice?: number;
  sectorName?: string;
  symbol?: string;
  sectorSymbol?: string;
  description?: string;
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

interface DomainSimulationProfile {
  baseVolatility: number; // percentage value (e.g., 5 === 5%)
  randomNoiseRange: number;
  managerImpactMultiplier: number;
  trendSmoothing: number;
  meanReversionStrength: number;
  momentumBurstChance: number;
  momentumBurstMagnitude: number;
  cycleAmplitude: number;
  cyclePeriodMs: number;
  slowFactor: number;
}

const DEFAULT_PROFILE: DomainSimulationProfile = {
  baseVolatility: 1,
  randomNoiseRange: 0.003,
  managerImpactMultiplier: 1,
  trendSmoothing: 1,
  meanReversionStrength: 0.05,
  momentumBurstChance: 0,
  momentumBurstMagnitude: 0,
  cycleAmplitude: 0,
  cyclePeriodMs: 0,
  slowFactor: 1
};

const FIVE_MINUTES_MS = 5 * 60 * 1000;

function getDomainProfile(sectorTypeRaw?: string): DomainSimulationProfile {
  const sectorType = (sectorTypeRaw || '').toString().toLowerCase();

  switch (sectorType) {
    case 'crypto':
      return {
        baseVolatility: 5.5,
        randomNoiseRange: 0.01,
        managerImpactMultiplier: 2.5,
        trendSmoothing: 0.6,
        meanReversionStrength: 0.08,
        momentumBurstChance: 0.15,
        momentumBurstMagnitude: 0.06,
        cycleAmplitude: 0,
        cyclePeriodMs: 0,
        slowFactor: 1
      };
    case 'equities':
      return {
        baseVolatility: 1.2,
        randomNoiseRange: 0.003,
        managerImpactMultiplier: 0.7,
        trendSmoothing: 0.85,
        meanReversionStrength: 0.1,
        momentumBurstChance: 0.02,
        momentumBurstMagnitude: 0.01,
        cycleAmplitude: 0,
        cyclePeriodMs: 0,
        slowFactor: 1
      };
    case 'forex':
      return {
        baseVolatility: 0.6,
        randomNoiseRange: 0.0012,
        managerImpactMultiplier: 0.4,
        trendSmoothing: 0.7,
        meanReversionStrength: 0.35,
        momentumBurstChance: 0,
        momentumBurstMagnitude: 0,
        cycleAmplitude: 0,
        cyclePeriodMs: 0,
        slowFactor: 0.9
      };
    case 'commodities':
      return {
        baseVolatility: 1.8,
        randomNoiseRange: 0.004,
        managerImpactMultiplier: 0.9,
        trendSmoothing: 0.75,
        meanReversionStrength: 0.12,
        momentumBurstChance: 0.05,
        momentumBurstMagnitude: 0.02,
        cycleAmplitude: 0.012,
        cyclePeriodMs: FIVE_MINUTES_MS,
        slowFactor: 1
      };
    case 'macro':
      return {
        baseVolatility: 0.25,
        randomNoiseRange: 0.0008,
        managerImpactMultiplier: 0.25,
        trendSmoothing: 0.9,
        meanReversionStrength: 0.2,
        momentumBurstChance: 0,
        momentumBurstMagnitude: 0,
        cycleAmplitude: 0,
        cyclePeriodMs: 0,
        slowFactor: 0.35
      };
    default:
      return DEFAULT_PROFILE;
  }
}

function describeTrend(changePercent: number, sectorTypeRaw?: string): string {
  const sectorLabel = sectorTypeRaw ? sectorTypeRaw.toLowerCase() : 'market';

  if (!isFinite(changePercent)) {
    return `${sectorLabel} flat`;
  }

  if (changePercent > 2.5) return `${sectorLabel} surge`;
  if (changePercent > 0.75) return `${sectorLabel} uptrend`;
  if (changePercent > 0.15) return `${sectorLabel} mild rise`;
  if (changePercent < -2.5) return `${sectorLabel} slump`;
  if (changePercent < -0.75) return `${sectorLabel} downtrend`;
  if (changePercent < -0.15) return `${sectorLabel} soft pullback`;
  return `${sectorLabel} flat`;
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
      const baselinePrice = typeof sector.baselinePrice === 'number'
        ? sector.baselinePrice
        : (typeof sector.initialPrice === 'number' ? sector.initialPrice : oldPrice);
      const domainProfile = getDomainProfile(sector.sectorType);

      // Step 2: Apply volatility noise (same method used in ExecutionEngine)
      // Calculate volatility: vol = sector.volatility / 100
      const baseVolatility = typeof sector.volatility === 'number'
        ? sector.volatility
        : domainProfile.baseVolatility;
      const vol = Math.max(0, baseVolatility) / 100;
      // Generate volatility noise: random in [-vol, +vol]
      const volatilityNoise = (Math.random() * 2 - 1) * vol;

      // Step 3: Apply random noise
      // Generate random noise: random in [-range, +range]
      const randomNoise = (Math.random() * 2 - 1) * domainProfile.randomNoiseRange;

      // Step 4: Get execution drift from BUY executions
      // This provides temporary positive drift when BUY executes, decaying over 10-30 minutes
      const executionDrift = calculateCurrentDrift(sector.id, now);
      
      // Convert annualized drift to per-tick impact
      // The drift is annualized (e.g., 0.5 = 50% annual return)
      // For simulation ticks that happen roughly every second, we need to convert to per-second
      // Scale the annual drift appropriately for per-second ticks
      const secondsPerYear = 365.25 * 24 * 60 * 60;
      const executionDriftPerSecond = executionDrift / secondsPerYear;
      // Scale by domain profile and apply as a small percentage change
      const executionImpact = executionDriftPerSecond * domainProfile.managerImpactMultiplier * 100; // Scale up for visibility
      
      // Step 4b: If a checklist was recently executed, apply execution-based managerImpact
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
          // Multiply by 1.5 to match ExecutionEngine.updateSimulatedPrice behavior
          const baseManagerImpact = 0.001 * 1.5; // Small positive impact, multiplied for visibility
          managerImpact = baseManagerImpact * domainProfile.managerImpactMultiplier;
        }
      }

      // Domain-specific adjustments
      const appliedTrend = trendComponent * domainProfile.trendSmoothing;
      const meanReversion = domainProfile.meanReversionStrength > 0 && baselinePrice > 0
        ? ((baselinePrice - oldPrice) / baselinePrice) * domainProfile.meanReversionStrength
        : 0;
      const momentumDirection = appliedTrend !== 0 ? Math.sign(appliedTrend) : (Math.random() < 0.5 ? -1 : 1);
      const momentumBurst = domainProfile.momentumBurstChance > 0 && Math.random() < domainProfile.momentumBurstChance
        ? (Math.random() * domainProfile.momentumBurstMagnitude) * momentumDirection
        : 0;
      const cycleComponent = domainProfile.cycleAmplitude > 0 && domainProfile.cyclePeriodMs > 0
        ? domainProfile.cycleAmplitude * Math.sin((2 * Math.PI * now) / domainProfile.cyclePeriodMs)
        : 0;

      const combinedChange =
        volatilityNoise +
        randomNoise +
        appliedTrend +
        managerImpact +
        executionImpact + // Add execution drift effect
        meanReversion +
        momentumBurst +
        cycleComponent;

      // Macro and forex domains dampen overall movement through slowFactor
      const domainScaledChange = combinedChange * (domainProfile.slowFactor || 1);

      // Calculate new price using the formula (same as ExecutionEngine.updateSimulatedPrice) with domain scaling
      const newSimulatedPrice = Math.max(0.01, oldPrice * (1 + domainScaledChange));

      // Clamp newPrice to minimum 0.01
      const newPrice = newSimulatedPrice;

      // Step 5: Update simulated price
      const priceChange = newPrice - oldPrice;
      const priceChangePercent = oldPrice > 0 ? ((newPrice - oldPrice) / oldPrice) * 100 : 0;
      const newVolatility = Math.max(0, parseFloat((baseVolatility * (1 + Math.min(Math.abs(domainScaledChange) * 10, 1))).toFixed(4)));
      const updatedTrendDescriptor = describeTrend(priceChangePercent, sector.sectorType);

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
        simulatedPrice: newSimulatedPrice,
        currentPrice: newSimulatedPrice,
        lastSimulatedPrice: newSimulatedPrice,
        lastPriceUpdate: now,
        change: priceChange,
        changePercent: priceChangePercent,
        volatility: newVolatility,
        trendDescriptor: updatedTrendDescriptor,
        performance: updatedPerformance
      };

      await updateSector(sector.id, updates);

      // Store price tick for history
      try {
        await storePriceTick(sector.id, {
          price: newSimulatedPrice,
          timestamp: now,
          volume: sector.volume || 0,
          change: priceChange,
          changePercent: priceChangePercent
        });
      } catch (tickError) {
        console.warn(`[SimulationEngine] Failed to store price tick for sector ${sector.id}:`, tickError.message);
      }
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

