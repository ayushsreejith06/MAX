const { getSectorById: getSectorByIdStorage } = require('../utils/sectorStorage');
const Sector = require('../models/Sector');

function normalizeSectorRecord(data = {}) {
  try {
    // Ensure ID is preserved - it's critical for lookups
    if (!data.id) {
      console.error("normalizeSectorRecord: Missing ID in data:", data);
    }
    
    // Use Sector.fromData() to ensure all required fields are present with defaults
    const sector = Sector.fromData(data);
    const normalized = sector.toJSON();
    
    // Ensure ID is always present (use original data.id if sector model didn't preserve it)
    const finalId = normalized.id || data.id;
    if (!finalId) {
      console.error("normalizeSectorRecord: No ID found after normalization. Original data:", data);
    }
    
    // Ensure all required fields exist (fromData already handles this, but double-check)
    return {
      id: finalId || normalized.id, // Ensure ID is always present
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
    
    // Fallback: create a fully valid sector with all defaults, but preserve original ID if available
    const fallbackSector = Sector.fromData({});
    const fallbackJson = fallbackSector.toJSON();
    if (data.id) {
      fallbackJson.id = data.id; // Preserve original ID
    }
    return fallbackJson;
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
