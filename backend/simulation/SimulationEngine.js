/**
 * SimulationEngine.js - Main simulation engine coordinating all modules
 * Manages orderbook, price simulation, execution, rules, and cross-signals per sector
 */

const { Orderbook } = require('./orderbook');
const PriceSimulator = require('./priceSimulator');
const ExecutionEngine = require('./execution');
const CrossSignals = require('./crossSignals');
const { loadSectors, saveSectors } = require('../utils/storage');

class SimulationEngine {
  constructor() {
    this.sectors = new Map(); // Map of sectorId -> sector simulation state
    this.crossSignals = new CrossSignals();
    this.eventListeners = new Map(); // Map of sectorId -> event listeners
  }

  /**
   * Initialize simulation for a sector
   */
  async initializeSector(sectorId, initialPrice = 100, volatility = 0.02) {
    if (this.sectors.has(sectorId)) {
      return this.sectors.get(sectorId);
    }

    const orderbook = new Orderbook(sectorId);
    const priceSimulator = new PriceSimulator(sectorId, initialPrice, volatility);
    const executionEngine = new ExecutionEngine(sectorId, orderbook);

    // Set up event listeners
    executionEngine.on('simulated_trade', (data) => {
      this.handleSimulatedTrade(sectorId, data);
    });

    const sectorState = {
      sectorId,
      orderbook,
      priceSimulator,
      executionEngine,
      lastSimulationTick: null
    };

    this.sectors.set(sectorId, sectorState);
    return sectorState;
  }

  /**
   * Run a simulation tick for a sector
   * This simulates one time step: price movement, agent decisions, trade execution
   */
  async simulateTick(sectorId, managerDecisions = null) {
    const sectorState = this.sectors.get(sectorId);
    if (!sectorState) {
      throw new Error(`Sector ${sectorId} not initialized`);
    }

    // If managerDecisions not provided, try to get from agent runtime
    if (managerDecisions === null) {
      try {
        const { getAgentRuntime } = require('../agents/runtime/agentRuntime');
        const agentRuntime = getAgentRuntime();
        const manager = agentRuntime.getManagerBySector(sectorId);
        
        if (manager) {
          const decision = await manager.tick();
          if (decision && decision.action) {
            managerDecisions = [{
              action: decision.action,
              confidence: decision.confidence,
              agentId: manager.id,
              reason: decision.reason
            }];
          } else {
            managerDecisions = [];
          }
        } else {
          managerDecisions = [];
        }
      } catch (error) {
        console.warn(`[SimulationEngine] Error getting manager decisions for sector ${sectorId}:`, error.message);
        managerDecisions = [];
      }
    }

    // Ensure managerDecisions is an array
    if (!Array.isArray(managerDecisions)) {
      managerDecisions = [];
    }

    const { orderbook, priceSimulator, executionEngine } = sectorState;

    // Step 1: Generate new price
    const newPrice = priceSimulator.generateNextPrice();
    priceSimulator.setPrice(newPrice);

    // Step 2: Calculate risk score from recent price history
    const recentTrades = orderbook.getTradeHistory(30);
    const priceHistory = recentTrades.map(t => t.price);
    if (priceHistory.length === 0) {
      priceHistory.push(newPrice);
    }
    const riskScore = priceSimulator.calculateRiskScore(priceHistory);

    // Step 3: Process manager decisions and execute trades
    const executedTrades = [];
    const rejectedTrades = [];

    for (const decision of managerDecisions) {
      try {
        // Add risk score to decision if not provided
        if (decision.riskScore === undefined) {
          decision.riskScore = riskScore;
        }

        const result = await executionEngine.executeDecision(decision);
        executedTrades.push(...result.trades);
      } catch (error) {
        rejectedTrades.push({
          decision,
          error: error.message
        });
      }
    }

    // Step 4: Process cross-signals if there are strong signals
    const strongSignals = managerDecisions.filter(d => 
      d.confidence >= 0.7 && d.action
    );

    for (const signal of strongSignals) {
      const propagated = this.crossSignals.processSignal({
        sectorId,
        action: signal.action,
        confidence: signal.confidence || 0.5,
        strength: signal.strength || 0.5,
        agentId: signal.agentId
      });

      // Store propagated signals (could be used by other sectors in future ticks)
      for (const propSignal of propagated) {
        // Could trigger trades in related sectors here
        // For now, just log them
        console.log(`Cross-signal: ${propSignal.sourceSectorId} -> ${propSignal.targetSectorId}: ${propSignal.action}`);
      }
    }

    // Step 5: Update sector data
    const orderbookSummary = orderbook.getSummary();
    const lastTrade = executedTrades.length > 0 ? executedTrades[executedTrades.length - 1] : null;

    const tickResult = {
      sectorId,
      timestamp: Date.now(),
      newPrice,
      riskScore,
      executedTrades,
      rejectedTrades,
      orderbook: orderbookSummary,
      lastTrade,
      priceChange: orderbook.lastPrice ? newPrice - orderbook.lastPrice : 0,
      priceChangePercent: orderbook.lastPrice ? ((newPrice - orderbook.lastPrice) / orderbook.lastPrice) * 100 : 0
    };

    sectorState.lastSimulationTick = tickResult;

    // Update sector in storage
    await this.updateSectorData(sectorId, tickResult);

    return tickResult;
  }

  /**
   * Handle simulated trade event
   */
  handleSimulatedTrade(sectorId, data) {
    // Could emit events to frontend or other systems here
    console.log(`Simulated trade in sector ${sectorId}:`, data.trade);
  }

  /**
   * Update sector data in storage
   */
  async updateSectorData(sectorId, tickResult) {
    try {
      const sectors = await loadSectors();
      const sectorIndex = sectors.findIndex(s => s.id === sectorId);
      
      if (sectorIndex !== -1) {
        const sector = sectors[sectorIndex];
        
        // Update price and related fields
        sector.currentPrice = tickResult.newPrice;
        sector.change = tickResult.priceChange;
        sector.changePercent = tickResult.priceChangePercent;
        
        // Update volume (sum of all trade quantities)
        const totalVolume = tickResult.executedTrades.reduce((sum, trade) => sum + trade.quantity, 0);
        sector.volume = (sector.volume || 0) + totalVolume;

        // Update candle data (simplified - in production, would aggregate by time window)
        if (!sector.candleData) {
          sector.candleData = [];
        }
        
        // Add new candle entry
        const lastCandle = sector.candleData.length > 0 
          ? sector.candleData[sector.candleData.length - 1]
          : { open: tickResult.newPrice, close: tickResult.newPrice, high: tickResult.newPrice, low: tickResult.newPrice };
        
        const newCandle = {
          open: lastCandle.close,
          close: tickResult.newPrice,
          high: Math.max(lastCandle.close, tickResult.newPrice),
          low: Math.min(lastCandle.close, tickResult.newPrice)
        };
        
        sector.candleData.push(newCandle);
        
        // Keep only last 100 candles
        if (sector.candleData.length > 100) {
          sector.candleData = sector.candleData.slice(-100);
        }

        sectors[sectorIndex] = sector;
        await saveSectors(sectors);
      }
    } catch (error) {
      console.error(`Failed to update sector data for ${sectorId}:`, error);
    }
  }

  /**
   * Get simulation state for a sector
   */
  getSectorState(sectorId) {
    return this.sectors.get(sectorId);
  }

  /**
   * Get all initialized sectors
   */
  getInitializedSectors() {
    return Array.from(this.sectors.keys());
  }

  /**
   * Initialize all sectors from storage
   */
  async initializeAllSectors() {
    try {
      const sectors = await loadSectors();
      for (const sector of sectors) {
        await this.initializeSector(
          sector.id,
          sector.currentPrice || 100,
          0.02 // Default volatility
        );
      }
      console.log(`Initialized simulation for ${sectors.length} sectors`);
    } catch (error) {
      console.error('Failed to initialize sectors:', error);
    }
  }

  /**
   * Set sector relationships for cross-signals
   */
  setSectorRelations(sectorId, relatedSectors) {
    this.crossSignals.setSectorRelations(sectorId, relatedSectors);
  }

  /**
   * Get cross-signal summary for a sector
   */
  getCrossSignalSummary(sectorId) {
    return this.crossSignals.getSummary(sectorId);
  }
}

// Singleton instance
let simulationEngineInstance = null;

function getSimulationEngine() {
  if (!simulationEngineInstance) {
    simulationEngineInstance = new SimulationEngine();
  }
  return simulationEngineInstance;
}

module.exports = { SimulationEngine, getSimulationEngine };

