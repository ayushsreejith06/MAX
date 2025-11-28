const Sector = require('../models/Sector');
const { loadSectors, saveSectors } = require('../utils/storage');
const { loadAgents } = require('../utils/agentStorage');
const { createAgent } = require('../agents/pipeline/createAgent');

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
      agents: Array.isArray(data?.agents) ? data.agents : []
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

module.exports = {
  createSector,
  getSectors,
  getSectorById
};

