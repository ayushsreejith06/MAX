const { v4: uuidv4 } = require('uuid');
const { generateCandles } = require('../utils/priceSimulation');

const DEFAULT_PRICE = 100;

function hasValidCandleShape(candles) {
  if (!Array.isArray(candles) || candles.length === 0) {
    return false;
  }

  return candles.every((candle) => (
    candle
    && typeof candle.open === 'number'
    && typeof candle.close === 'number'
    && typeof candle.high === 'number'
    && typeof candle.low === 'number'
  ));
}

class Sector {
  constructor({
    id = uuidv4(),
    sectorName,
    sectorSymbol,
    currentPrice = DEFAULT_PRICE,
    change = 0,
    changePercent = 0,
    volume = 0,
    statusPercent = 0,
    activeAgents = 0,
    candleData = [],
    discussions = [],
    agents = [],
    volatility = 0.02,
    riskScore = 50,
    lastSimulatedPrice = null,
    balance = 0
  } = {}) {
    if (!sectorName || typeof sectorName !== 'string') {
      throw new Error('sectorName is required');
    }

    if (!sectorSymbol || typeof sectorSymbol !== 'string') {
      throw new Error('sectorSymbol is required');
    }

    this.id = id;
    this.sectorName = sectorName.trim();
    this.sectorSymbol = sectorSymbol.trim().toUpperCase();

    this.currentPrice = typeof currentPrice === 'number' ? currentPrice : DEFAULT_PRICE;
    this.change = typeof change === 'number' ? change : 0;
    this.changePercent = typeof changePercent === 'number' ? changePercent : 0;
    this.volume = typeof volume === 'number' ? volume : 0;

    this.statusPercent = typeof statusPercent === 'number' ? statusPercent : 0;
    this.activeAgents = typeof activeAgents === 'number' ? activeAgents : 0;

    this.candleData = hasValidCandleShape(candleData)
      ? candleData
      : []; // No mock data - return empty array
    this.discussions = Array.isArray(discussions) ? discussions : [];
    this.agents = Array.isArray(agents) ? agents : [];

    this.volatility = typeof volatility === 'number' ? volatility : 0.02;
    this.riskScore = typeof riskScore === 'number' ? riskScore : 50;
    this.lastSimulatedPrice = typeof lastSimulatedPrice === 'number' ? lastSimulatedPrice : null;
    this.balance = typeof balance === 'number' ? balance : 0;
  }

  static fromData(data = {}) {
    const fallbackName = data.name || 'Unknown Sector';
    const fallbackSymbol = data.symbol || fallbackName.slice(0, 3).toUpperCase();

    return new Sector({
      ...data,
      sectorName: data.sectorName || fallbackName,
      sectorSymbol: data.sectorSymbol || fallbackSymbol,
      currentPrice: typeof data.currentPrice === 'number' ? data.currentPrice : DEFAULT_PRICE,
      change: typeof data.change === 'number' ? data.change : 0,
      changePercent: typeof data.changePercent === 'number' ? data.changePercent : 0,
      volume: typeof data.volume === 'number' ? data.volume : 0,
      statusPercent: typeof data.statusPercent === 'number' ? data.statusPercent : 0,
      activeAgents: typeof data.activeAgents === 'number' ? data.activeAgents : 0,
      candleData: Array.isArray(data.candleData) ? data.candleData : [],
      discussions: Array.isArray(data.discussions) ? data.discussions : [],
      agents: Array.isArray(data.agents) ? data.agents : [],
      volatility: typeof data.volatility === 'number' ? data.volatility : 0.02,
      riskScore: typeof data.riskScore === 'number' ? data.riskScore : 50,
      lastSimulatedPrice: typeof data.lastSimulatedPrice === 'number' ? data.lastSimulatedPrice : null,
      balance: typeof data.balance === 'number' ? data.balance : 0
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
      volume: this.volume,
      statusPercent: this.statusPercent,
      activeAgents: this.activeAgents,
      candleData: this.candleData,
      discussions: this.discussions,
      agents: this.agents,
      volatility: this.volatility,
      riskScore: this.riskScore,
      lastSimulatedPrice: this.lastSimulatedPrice,
      balance: this.balance
    };
  }
}

module.exports = Sector;

