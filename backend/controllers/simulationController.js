const { getSectorById } = require('./sectorsController');
const { updateSector } = require('../utils/sectorStorage');
const { loadAgents, updateAgent } = require('../utils/agentStorage');
const { applyVolatility, calculatePrice, computeRiskScore } = require('../simulation/performance');
const { getSimulationEngine } = require('../simulation/SimulationEngine');
const { extractConfidence } = require('../utils/confidenceUtils');

function log(message) {
  const timestamp = new Date().toISOString();
  console.log(`[${timestamp}] ${message}`);
}

/**
 * Execute a simulation tick for a sector
 * @param {string} sectorId - Sector ID
 * @returns {Promise<{sector: Object, agents: Array}>} Updated sector and agents
 */
async function executeSimulationTick(sectorId) {
  try {
    log(`Executing simulation tick for sector ${sectorId}`);

    // 1. Load sector + associated agents
    const sector = await getSectorById(sectorId);
    if (!sector) {
      throw new Error(`Sector ${sectorId} not found`);
    }

    // Load all agents and filter by sectorId
    const allAgents = await loadAgents();
    const sectorAgents = allAgents.filter(agent => agent.sectorId === sectorId);
    
    // Count active agents (agents with status 'active')
    const activeAgents = sectorAgents.filter(agent => agent && agent.status === 'active');
    const activeAgentsCount = activeAgents.length;

    log(`Loaded sector ${sectorId} with ${sectorAgents.length} agents (${activeAgentsCount} active)`);

    // Store previous price for change calculation
    const previousPrice = sector.currentPrice || 100;
    const previousLastSimulatedPrice = sector.lastSimulatedPrice || previousPrice;

    // CRITICAL: Price should ONLY update when checklist items are executed after discussions
    // Simulation ticks should NOT update the price if there are no active agents
    // Price updates happen only in ExecutionEngine.executeChecklist()
    let shouldUpdatePrice = false;
    if (activeAgentsCount > 0) {
      // Only update price if there are active agents AND there are executed decisions
      // For now, we skip price updates in simulation ticks entirely
      // Price will be updated only when checklist items are executed
      shouldUpdatePrice = false;
    }

    // 2. Apply volatility (still calculate for risk score, but don't use for price updates)
    const updatedVolatility = applyVolatility(sector);
    sector.volatility = updatedVolatility;

    // 3. Calculate new price (for risk score calculation only, not for actual price update)
    const newPrice = calculatePrice(sector);

    // 4. Compute risk score
    const riskScore = computeRiskScore(sector);

    // 5. Update sector price fields ONLY if price should be updated
    // Since price should only update when checklist items are executed, we skip price updates here
    if (!shouldUpdatePrice) {
      log(`Skipping price update - price only updates when checklist items are executed after discussions`);
      // Keep existing price values unchanged
      // Only update risk score and volatility (which don't affect the displayed price)
    } else {
      sector.currentPrice = newPrice;
      sector.change = newPrice - previousPrice;
      sector.changePercent = previousPrice > 0 ? ((newPrice - previousPrice) / previousPrice) * 100 : 0;
      sector.lastSimulatedPrice = newPrice;
      log(`Price updated: ${previousPrice} -> ${newPrice} (${sector.changePercent.toFixed(2)}%)`);
    }
    
    // Always update risk score (it's calculated from volatility and other factors, not price changes)
    sector.riskScore = riskScore;

    // 6. Normalize confidence for every agent (no random generation)
    const updatedAgents = [];
    for (const agent of sectorAgents) {
      const newConfidence = extractConfidence(agent);
      agent.confidence = newConfidence;
      updatedAgents.push(agent);
    }

    log(`Recalculated confidence for ${updatedAgents.length} agents`);

    // 7. Update performance object: totalPL, recentTrades (even if zero)
    // Get recent trades from simulation engine if available
    const simulationEngine = getSimulationEngine();
    const sectorState = simulationEngine.getSectorState(sectorId);
    
    let recentTrades = [];
    let incrementalPL = 0;

    // Calculate incremental P/L from this tick's price change
    // Since we're not updating price in simulation ticks, P/L should also not change
    // P/L will be updated when checklist items are executed
    if (shouldUpdatePrice) {
      const priceChange = newPrice - previousPrice;
      const priceChangePercent = previousPrice > 0 ? (priceChange / previousPrice) * 100 : 0;
      const startingCapital = sector.balance || 0;
      incrementalPL = startingCapital > 0 
        ? (startingCapital * priceChangePercent) / 100 
        : 0;
    }

    if (sectorState && sectorState.orderbook) {
      // Get recent trades from orderbook
      recentTrades = sectorState.orderbook.getTradeHistory(10) || [];
    }

    // Ensure performance object exists
    if (!sector.performance) {
      sector.performance = {};
    }

    // Update performance metrics - accumulate totalPL
    const currentTotalPL = typeof sector.performance.totalPL === 'number' 
      ? sector.performance.totalPL 
      : 0;
    sector.performance.totalPL = currentTotalPL + incrementalPL;
    sector.performance.recentTrades = recentTrades.map(trade => ({
      id: trade.id,
      price: trade.price,
      quantity: trade.quantity,
      timestamp: trade.timestamp
    }));

    // 8. Save updated sector
    // Only update price-related fields if price was actually updated
    // Balance is ONLY updated via:
    //   - Deposit endpoint (manual deposits)
    //   - ExecutionEngine.executeChecklist() (when manager finalizes checklist items)
    // Balance should NEVER be updated by simulation ticks, price changes, or confidence updates
    // Price should ONLY be updated when checklist items are executed (in ExecutionEngine.executeChecklist())
    const sectorUpdates = {
      riskScore: sector.riskScore,
      volatility: sector.volatility,
      performance: sector.performance
    };
    
    // Only include price fields if price was actually updated
    if (shouldUpdatePrice) {
      sectorUpdates.currentPrice = sector.currentPrice;
      sectorUpdates.change = sector.change;
      sectorUpdates.changePercent = sector.changePercent;
      sectorUpdates.lastSimulatedPrice = sector.lastSimulatedPrice;
    }
    
    await updateSector(sectorId, sectorUpdates);

    // 9. Save updated agents using updateAgent for each
    for (const updatedAgent of updatedAgents) {
      await updateAgent(updatedAgent.id, updatedAgent);
    }

    log(`Simulation tick completed for sector ${sectorId}`);

    // 10. Return updated sector and agents
    return {
      sector: sector,
      agents: updatedAgents
    };
  } catch (error) {
    log(`Error executing simulation tick: ${error.message}`);
    throw error;
  }
}

module.exports = {
  executeSimulationTick
};

