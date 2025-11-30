const Sector = require('../models/Sector');
const { loadSectors, saveSectors } = require('../utils/storage');
const { loadAgents } = require('../utils/agentStorage');
const { createAgent } = require('../agents/pipeline/createAgent');
const { calculatePrice, applyVolatility, computeRiskScore } = require('../simulation/performance');

function validateSectorPayload(payload = {}) {
  if (!payload.sectorName || typeof payload.sectorName !== 'string' || payload.sectorName.trim().length === 0) {
    return { valid: false, error: 'sectorName is required' };
  }

  if (!payload.sectorSymbol || typeof payload.sectorSymbol !== 'string' || payload.sectorSymbol.trim().length === 0) {
    return { valid: false, error: 'sectorSymbol is required' };
  }

  return { valid: true };
}

function normalizeSectorRecord(data) {
  try {
    return Sector.fromData(data).toJSON();
  } catch (error) {
    console.error('Error normalizing sector record:', error, 'Data:', data);
    // Return a minimal valid sector structure if normalization fails
    return {
      id: data?.id || 'unknown',
      sectorName: data?.sectorName || data?.name || 'Unknown Sector',
      sectorSymbol: data?.sectorSymbol || data?.symbol || 'UNK',
      currentPrice: typeof data?.currentPrice === 'number' ? data.currentPrice : 100,
      change: typeof data?.change === 'number' ? data.change : 0,
      changePercent: typeof data?.changePercent === 'number' ? data.changePercent : 0,
      volume: typeof data?.volume === 'number' ? data.volume : 0,
      statusPercent: typeof data?.statusPercent === 'number' ? data.statusPercent : 0,
      activeAgents: typeof data?.activeAgents === 'number' ? data.activeAgents : 0,
      candleData: Array.isArray(data?.candleData) ? data.candleData : [],
      discussions: Array.isArray(data?.discussions) ? data.discussions : [],
      agents: Array.isArray(data?.agents) ? data.agents : [],
      volatility: typeof data?.volatility === 'number' ? data.volatility : 0.02,
      riskScore: typeof data?.riskScore === 'number' ? data.riskScore : 50,
      lastSimulatedPrice: typeof data?.lastSimulatedPrice === 'number' ? data.lastSimulatedPrice : null,
      balance: typeof data?.balance === 'number' ? data.balance : 0
    };
  }
}

async function createSector(payload = {}) {
  const validation = validateSectorPayload(payload);
  if (!validation.valid) {
    throw new Error(validation.error);
  }

  const sector = new Sector({
    ...payload,
    sectorName: payload.sectorName.trim(),
    sectorSymbol: payload.sectorSymbol.trim()
  });

  const sectors = await loadSectors();
  sectors.push(sector.toJSON());
  await saveSectors(sectors);

  // Automatically create a manager agent for this sector
  try {
    const managerAgent = await createAgent('manage coordinate oversee supervise lead', sector.id);
    console.log(`Created manager agent ${managerAgent.id} for sector ${sector.id}`);
  } catch (error) {
    console.error(`Failed to create manager agent for sector ${sector.id}:`, error);
    // Don't fail sector creation if manager agent creation fails
  }

  // Load agents and associate with this sector before returning
  const agents = await loadAgents();
  const sectorAgents = agents.filter(agent => agent.sectorId === sector.id);
  const sectorWithAgents = {
    ...sector.toJSON(),
    agents: sectorAgents
  };

  return normalizeSectorRecord(sectorWithAgents);
}

async function getSectors() {
  try {
    const sectors = await loadSectors();
    let agents = [];
    
    try {
      agents = await loadAgents();
    } catch (agentError) {
      console.error('Error loading agents in getSectors:', agentError);
      // Continue without agents if loading fails
    }
    
    // Associate agents with their sectors
    const sectorsWithAgents = sectors.map(sector => {
      const sectorAgents = agents.filter(agent => agent.sectorId === sector.id);
      return {
        ...sector,
        agents: sectorAgents
      };
    });
    
    return sectorsWithAgents.map(normalizeSectorRecord);
  } catch (error) {
    console.error('Error in getSectors:', error);
    throw error;
  }
}

async function getSectorById(id) {
  try {
    const sectors = await loadSectors();
    let agents = [];
    
    try {
      agents = await loadAgents();
    } catch (agentError) {
      console.error('Error loading agents in getSectorById:', agentError);
      // Continue without agents if loading fails
    }
    
    const sector = sectors.find(entry => entry.id === id);
    
    if (!sector) {
      return null;
    }
    
    // Associate agents with this sector
    const sectorAgents = agents.filter(agent => agent.sectorId === sector.id);
    const sectorWithAgents = {
      ...sector,
      agents: sectorAgents
    };
    
    return normalizeSectorRecord(sectorWithAgents);
  } catch (error) {
    console.error('Error in getSectorById:', error);
    throw error;
  }
}

async function updateSectorPerformance(id) {
  try {
    const sectors = await loadSectors();
    const sectorIndex = sectors.findIndex(entry => entry.id === id);
    
    if (sectorIndex === -1) {
      throw new Error('Sector not found');
    }

    let agents = [];
    try {
      agents = await loadAgents();
    } catch (agentError) {
      console.error('Error loading agents in updateSectorPerformance:', agentError);
    }

    const sector = sectors[sectorIndex];
    const sectorAgents = agents.filter(agent => agent.sectorId === sector.id);
    
    // Create sector object with agents for calculations
    const sectorWithAgents = {
      ...sector,
      agents: sectorAgents
    };

    // Apply volatility calculation
    const volatility = applyVolatility(sectorWithAgents);
    
    // Update sector with new volatility
    sectorWithAgents.volatility = volatility;
    
    // Calculate new price
    const newPrice = calculatePrice(sectorWithAgents);
    
    // Calculate price change
    const oldPrice = sector.currentPrice || 100;
    const priceChange = newPrice - oldPrice;
    const priceChangePercent = oldPrice > 0 ? (priceChange / oldPrice) * 100 : 0;
    
    // Compute risk score
    const riskScore = computeRiskScore({
      ...sectorWithAgents,
      currentPrice: newPrice,
      changePercent: priceChangePercent
    });
    
    // Update sector with new values
    sectors[sectorIndex] = {
      ...sector,
      volatility: volatility,
      riskScore: riskScore,
      lastSimulatedPrice: newPrice,
      currentPrice: newPrice,
      change: priceChange,
      changePercent: priceChangePercent
    };
    
    await saveSectors(sectors);
    
    // Return updated sector with agents
    const updatedSector = {
      ...sectors[sectorIndex],
      agents: sectorAgents
    };
    
    return normalizeSectorRecord(updatedSector);
  } catch (error) {
    console.error('Error in updateSectorPerformance:', error);
    throw error;
  }
}

module.exports = {
  createSector,
  getSectors,
  getSectorById,
  updateSectorPerformance
};

