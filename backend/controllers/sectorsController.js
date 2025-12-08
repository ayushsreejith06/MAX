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
    
    // Return normalized sector with consistent field names
    // Primary fields: name, symbol (standardized for API consistency)
    // Keep sectorName, sectorSymbol for backward compatibility
    return {
      id: finalId || normalized.id, // Ensure ID is always present
      // Primary standardized fields
      name: normalized.name || normalized.sectorName || 'Unknown Sector',
      symbol: normalized.symbol || normalized.sectorSymbol || 'UNK',
      // Backward compatibility fields
      sectorName: normalized.sectorName || normalized.name || 'Unknown Sector',
      sectorSymbol: normalized.sectorSymbol || normalized.symbol || 'UNK',
      // Core market data fields
      currentPrice: normalized.currentPrice,
      change: normalized.change,
      changePercent: normalized.changePercent,
      volume: normalized.volume || 0,
      // Risk and volatility
      volatility: normalized.volatility,
      riskScore: normalized.riskScore,
      // Agent and activity fields
      agents: normalized.agents || [],
      activeAgents: typeof normalized.activeAgents === 'number' ? normalized.activeAgents : (normalized.agents || []).filter(a => a && a.status === 'active').length,
      buyAgents: normalized.buyAgents || 0,
      sellAgents: normalized.sellAgents || 0,
      statusPercent: normalized.statusPercent || 0,
      // Performance and balance
      performance: normalized.performance || {},
      balance: normalized.balance || 0,
      // Additional fields
      lastSimulatedPrice: normalized.lastSimulatedPrice !== undefined ? normalized.lastSimulatedPrice : null,
      discussions: normalized.discussions || [],
      candleData: normalized.candleData || [],
      description: normalized.description || '',
      createdAt: normalized.createdAt || new Date().toISOString()
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
