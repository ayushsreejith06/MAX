const { getSectorById } = require('./sectorsController');
const { updateSector } = require('../utils/sectorStorage');
const { loadAgents, updateAgent } = require('../utils/agentStorage');
const { applyVolatility, calculatePrice, computeRiskScore } = require('../simulation/performance');
const ConfidenceEngine = require('../core/ConfidenceEngine');
const { getSimulationEngine } = require('../simulation/SimulationEngine');

const confidenceEngine = new ConfidenceEngine();

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

    log(`Loaded sector ${sectorId} with ${sectorAgents.length} agents`);

    // Store previous price for change calculation
    const previousPrice = sector.currentPrice || 100;
    const previousLastSimulatedPrice = sector.lastSimulatedPrice || previousPrice;

    // 2. Apply volatility
    const updatedVolatility = applyVolatility(sector);
    sector.volatility = updatedVolatility;

    // 3. Calculate new price
    const newPrice = calculatePrice(sector);

    // 4. Compute risk score
    const riskScore = computeRiskScore(sector);

    // 5. Update sector price fields
    sector.currentPrice = newPrice;
    sector.change = newPrice - previousPrice;
    sector.changePercent = previousPrice > 0 ? ((newPrice - previousPrice) / previousPrice) * 100 : 0;
    sector.lastSimulatedPrice = newPrice;
    sector.riskScore = riskScore;

    log(`Price updated: ${previousPrice} -> ${newPrice} (${sector.changePercent.toFixed(2)}%)`);

    // 6. Recalculate confidence for every agent
    const updatedAgents = [];
    for (const agent of sectorAgents) {
      const newConfidence = confidenceEngine.updateAgentConfidence(agent, sector);
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
    // This is a simplified calculation - in production, you'd track positions
    const priceChange = newPrice - previousPrice;
    const priceChangePercent = previousPrice > 0 ? (priceChange / previousPrice) * 100 : 0;
    const startingCapital = sector.balance || 0;
    incrementalPL = startingCapital > 0 
      ? (startingCapital * priceChangePercent) / 100 
      : 0;

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
    // Only update price-related fields, NOT balance (balance is only updated via deposit endpoint)
    await updateSector(sectorId, {
      currentPrice: sector.currentPrice,
      change: sector.change,
      changePercent: sector.changePercent,
      lastSimulatedPrice: sector.lastSimulatedPrice,
      riskScore: sector.riskScore,
      volatility: sector.volatility,
      performance: sector.performance
    });

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

