const { getSectorById: getSectorByIdStorage } = require('../utils/sectorStorage');
const Sector = require('../models/Sector');

function normalizeSectorRecord(data = {}) {
  try {
    // Use Sector.fromData() to ensure all required fields are present with defaults
    const sector = Sector.fromData(data);
    const normalized = sector.toJSON();
    
    // Ensure all required fields exist (fromData already handles this, but double-check)
    return {
      id: normalized.id,
      sectorName: normalized.sectorName,
      sectorSymbol: normalized.sectorSymbol,
      currentPrice: normalized.currentPrice,
      change: normalized.change,
      changePercent: normalized.changePercent,
      volatility: normalized.volatility,
      riskScore: normalized.riskScore,
      agents: normalized.agents,
      performance: normalized.performance,
      balance: normalized.balance,
      // Additional fields
      volume: normalized.volume || 0,
      statusPercent: normalized.statusPercent || 0,
      lastSimulatedPrice: normalized.lastSimulatedPrice !== undefined ? normalized.lastSimulatedPrice : null,
      discussions: normalized.discussions || [],
      candleData: normalized.candleData || [],
      description: normalized.description || '',
      name: normalized.name || normalized.sectorName,
      symbol: normalized.symbol || normalized.sectorSymbol
    };
  } catch (error) {
    console.error("Error normalizing sector record:", error, "Data:", data);
    
    // Fallback: create a fully valid sector with all defaults
    const fallbackSector = Sector.fromData({});
    return fallbackSector.toJSON();
  }
}

async function getSectorById(id) {
  const sector = await getSectorByIdStorage(id);
  if (!sector) {
    return null;
  }
  return normalizeSectorRecord(sector);
}

module.exports = {
  normalizeSectorRecord,
  getSectorById
};
