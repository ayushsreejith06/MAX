const { v4: uuidv4 } = require('uuid');

class Sector {
  constructor(data = {}) {
    this.id = data.id || uuidv4();
    this.sectorName = data.sectorName || 'Unknown Sector';
    this.sectorSymbol = data.sectorSymbol || 'UNK';
    this.currentPrice = typeof data.currentPrice === 'number' ? data.currentPrice : 100;
    this.change = typeof data.change === 'number' ? data.change : 0;
    this.changePercent = typeof data.changePercent === 'number' ? data.changePercent : 0;
    this.volatility = typeof data.volatility === 'number' ? data.volatility : 0.02;
    this.riskScore = typeof data.riskScore === 'number' ? data.riskScore : 50;
    this.agents = Array.isArray(data.agents) ? data.agents : [];
    this.performance = data.performance && typeof data.performance === 'object' ? data.performance : {};
    this.balance = typeof data.balance === 'number' ? data.balance : 0;
    
    // Additional fields that may exist
    this.volume = typeof data.volume === 'number' ? data.volume : 0;
    this.statusPercent = typeof data.statusPercent === 'number' ? data.statusPercent : 0;
    this.lastSimulatedPrice = data.lastSimulatedPrice !== undefined ? data.lastSimulatedPrice : null;
    this.discussions = Array.isArray(data.discussions) ? data.discussions : [];
    this.candleData = Array.isArray(data.candleData) ? data.candleData : [];
    this.description = data.description || '';
    this.name = data.name || data.sectorName || 'Unknown Sector';
    this.symbol = data.symbol || data.sectorSymbol || 'UNK';
  }

  static fromData(data = {}) {
    // Sanitize and apply defaults
    return new Sector({
      id: data.id,
      sectorName: data.sectorName || data.name || 'Unknown Sector',
      sectorSymbol: (data.sectorSymbol || data.symbol || 'UNK').trim(),
      currentPrice: typeof data.currentPrice === 'number' ? data.currentPrice : 100,
      change: typeof data.change === 'number' ? data.change : 0,
      changePercent: typeof data.changePercent === 'number' ? data.changePercent : 0,
      volatility: typeof data.volatility === 'number' ? data.volatility : 0.02,
      riskScore: typeof data.riskScore === 'number' ? data.riskScore : 50,
      agents: Array.isArray(data.agents) ? data.agents : [],
      performance: data.performance && typeof data.performance === 'object' ? data.performance : {},
      balance: typeof data.balance === 'number' ? data.balance : 0,
      // Preserve additional fields if they exist
      volume: data.volume,
      statusPercent: data.statusPercent,
      lastSimulatedPrice: data.lastSimulatedPrice,
      discussions: data.discussions,
      candleData: data.candleData,
      description: data.description,
      name: data.name,
      symbol: data.symbol
    });
  }

  toJSON() {
    return {
      id: this.id,
      sectorName: this.sectorName,
      sectorSymbol: this.sectorSymbol,
      currentPrice: this.currentPrice,
      change: this.change,
      changePercent: this.changePercent,
      volatility: this.volatility,
      riskScore: this.riskScore,
      agents: this.agents,
      performance: this.performance,
      balance: this.balance,
      // Include additional fields
      volume: this.volume,
      statusPercent: this.statusPercent,
      lastSimulatedPrice: this.lastSimulatedPrice,
      discussions: this.discussions,
      candleData: this.candleData,
      description: this.description,
      name: this.name,
      symbol: this.symbol
    };
  }
}

module.exports = Sector;
