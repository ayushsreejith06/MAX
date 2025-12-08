const { getSectorById: getSectorByIdStorage } = require('../utils/sectorStorage');

function normalizeSectorRecord(data = {}) {
  try {
    // Direct JSON structure normalization (no Sector.fromData)
    // Preserve sectorSymbol if it exists, don't overwrite with "UNK"
    const sectorSymbol = (data.sectorSymbol || data.symbol || '').trim();
    return {
      id: data.id,
      sectorName: data.sectorName || data.name || "Unknown Sector",
      sectorSymbol: sectorSymbol || "UNK",

      currentPrice: typeof data.currentPrice === "number" ? data.currentPrice : 100,
      change: typeof data.change === "number" ? data.change : 0,
      changePercent: typeof data.changePercent === "number" ? data.changePercent : 0,
      volume: typeof data.volume === "number" ? data.volume : 0,

      statusPercent: typeof data.statusPercent === "number" ? data.statusPercent : 0,
      volatility: typeof data.volatility === "number" ? data.volatility : 0.02,
      riskScore: typeof data.riskScore === "number" ? data.riskScore : 50,

      lastSimulatedPrice: typeof data.lastSimulatedPrice === "number" ? data.lastSimulatedPrice : null,
      balance: typeof data.balance === "number" ? data.balance : 0,

      agents: Array.isArray(data.agents) ? data.agents : [],
      discussions: Array.isArray(data.discussions) ? data.discussions : [],
      candleData: Array.isArray(data.candleData) ? data.candleData : []
    };
  } catch (error) {
    console.error("Error normalizing sector record:", error, "Data:", data);

    // Preserve sectorSymbol if it exists in error case too
    const sectorSymbol = (data?.sectorSymbol || data?.symbol || '').trim();
    return {
      id: data?.id || "unknown",
      sectorName: data?.sectorName || "Unknown Sector",
      sectorSymbol: sectorSymbol || "UNK",
      currentPrice: 100,
      change: 0,
      changePercent: 0,
      volume: 0,
      statusPercent: 0,
      activeAgents: 0,
      candleData: [],
      discussions: [],
      agents: [],
      volatility: 0.02,
      riskScore: 50,
      lastSimulatedPrice: null,
      balance: 0
    };
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
