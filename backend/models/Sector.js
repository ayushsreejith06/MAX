const { v4: uuidv4 } = require('uuid');
const SectorState = require('./SectorState');

/**
 * Infer stock symbols from sector name
 * @param {string} sectorName - The name of the sector
 * @returns {string[]} Array of stock symbols
 */
function inferSymbolsFromSectorName(sectorName) {
  const name = (sectorName || '').toUpperCase().trim();
  
  // Map common sector names to representative stock symbols
  const sectorSymbolMap = {
    'TECH': ['NVDA', 'AAPL', 'MSFT'],
    'TECHNOLOGY': ['NVDA', 'AAPL', 'MSFT'],
    'FINANCE': ['JPM', 'BAC', 'GS'],
    'FINANCIAL': ['JPM', 'BAC', 'GS'],
    'HEALTHCARE': ['JNJ', 'UNH', 'PFE'],
    'HEALTH': ['JNJ', 'UNH', 'PFE'],
    'ENERGY': ['XOM', 'CVX', 'COP'],
    'CONSUMER': ['AMZN', 'WMT', 'HD'],
    'CONSUMER DISCRETIONARY': ['AMZN', 'WMT', 'HD'],
    'INDUSTRIAL': ['BA', 'CAT', 'GE'],
    'REAL ESTATE': ['AMT', 'PLD', 'EQIX'],
    'REIT': ['AMT', 'PLD', 'EQIX'],
    'UTILITIES': ['NEE', 'DUK', 'SO'],
    'MATERIALS': ['LIN', 'APD', 'ECL'],
    'COMMUNICATION': ['GOOGL', 'META', 'NFLX'],
    'TELECOM': ['GOOGL', 'META', 'NFLX']
  };
  
  // Check for exact match
  if (sectorSymbolMap[name]) {
    return sectorSymbolMap[name];
  }
  
  // Check for partial matches
  for (const [key, symbols] of Object.entries(sectorSymbolMap)) {
    if (name.includes(key) || key.includes(name)) {
      return symbols;
    }
  }
  
  // Default fallback symbols
  return ['SPY', 'QQQ', 'DIA'];
}

/**
 * Initialize marketContext with simulated defaults
 * @param {string[]} symbols - Array of stock symbols
 * @returns {Object} Initialized marketContext object
 */
function initializeMarketContext(symbols = []) {
  const defaultSymbols = symbols.length > 0 ? symbols : ['SPY', 'QQQ', 'DIA'];
  const baselinePrices = {};
  const volatility = {};
  const trendPercent = {};
  
  // Generate simulated defaults for each symbol
  defaultSymbols.forEach(symbol => {
    // Baseline prices between $50 and $500
    baselinePrices[symbol] = Math.round((Math.random() * 450 + 50) * 100) / 100;
    
    // Volatility between 0.01 (1%) and 0.05 (5%)
    volatility[symbol] = Math.round((Math.random() * 0.04 + 0.01) * 1000) / 1000;
    
    // Trend percent between -5% and +5%
    trendPercent[symbol] = Math.round((Math.random() * 10 - 5) * 100) / 100;
  });
  
  return {
    symbols: defaultSymbols,
    baselinePrices,
    volatility,
    trendPercent,
    lastUpdated: new Date().toISOString()
  };
}

class Sector {
  constructor(data = {}) {
    this.id = data.id || uuidv4();
    
    // Standardize on name/symbol as primary fields (for API consistency)
    // Support both name/symbol and sectorName/sectorSymbol for backward compatibility
    this.name = data.name || data.sectorName || 'Unknown Sector';
    this.symbol = data.symbol || data.sectorSymbol || 'UNK';
    
    // Keep sectorName/sectorSymbol as aliases for backward compatibility
    this.sectorName = this.name;
    this.sectorSymbol = this.symbol;
    
    this.currentPrice = typeof data.currentPrice === 'number' ? data.currentPrice : 0;
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
    this.createdAt = data.createdAt || new Date().toISOString();
    
    // Discussion tracking state
    // Initialize as null for new sectors or inactive discussions
    if (data.discussion === null || data.discussion === undefined) {
      this.discussion = null;
    } else if (typeof data.discussion === 'object' && data.discussion.status === 'inactive') {
      this.discussion = null;
    } else {
      // Create SectorState instance for active discussions
      const discussionState = new SectorState(data.discussion);
      this.discussion = discussionState.status === 'inactive' ? null : discussionState;
    }
    
    // Initialize marketContext
    if (data.marketContext && typeof data.marketContext === 'object') {
      // Use provided marketContext if it exists
      this.marketContext = {
        symbols: Array.isArray(data.marketContext.symbols) ? data.marketContext.symbols : [],
        baselinePrices: data.marketContext.baselinePrices && typeof data.marketContext.baselinePrices === 'object' 
          ? data.marketContext.baselinePrices 
          : {},
        volatility: data.marketContext.volatility && typeof data.marketContext.volatility === 'object'
          ? data.marketContext.volatility
          : {},
        trendPercent: data.marketContext.trendPercent && typeof data.marketContext.trendPercent === 'object'
          ? data.marketContext.trendPercent
          : {},
        lastUpdated: data.marketContext.lastUpdated || new Date().toISOString()
      };
    } else {
      // Initialize with inferred symbols from sector name
      const inferredSymbols = data.symbols || inferSymbolsFromSectorName(this.name);
      this.marketContext = initializeMarketContext(inferredSymbols);
    }
  }

  static fromData(data = {}) {
    // Sanitize and apply defaults
    // Support both name/symbol and sectorName/sectorSymbol for backward compatibility
    const name = data.name || data.sectorName || 'Unknown Sector';
    const symbol = (data.symbol || data.sectorSymbol || 'UNK').trim();
    
    return new Sector({
      id: data.id,
      name: name,
      symbol: symbol,
      sectorName: name, // Keep for backward compatibility
      sectorSymbol: symbol, // Keep for backward compatibility
      currentPrice: typeof data.currentPrice === 'number' ? data.currentPrice : 0,
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
      createdAt: data.createdAt,
      // Handle discussion field - normalize old sectors without discussion
      discussion: data.discussion !== undefined ? data.discussion : null,
      // Handle marketContext - will be initialized if not present
      marketContext: data.marketContext,
      symbols: data.symbols // Allow symbols to be passed for inference
    });
  }

  toJSON() {
    return {
      id: this.id,
      // Primary fields (standardized for API consistency)
      name: this.name,
      symbol: this.symbol,
      // Keep sectorName/sectorSymbol for backward compatibility
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
      // Additional fields
      volume: this.volume,
      statusPercent: this.statusPercent,
      lastSimulatedPrice: this.lastSimulatedPrice,
      discussions: this.discussions,
      candleData: this.candleData,
      description: this.description,
      createdAt: this.createdAt,
      // Discussion tracking state (null if inactive or not set)
      discussion: this.discussion === null ? null : (this.discussion instanceof SectorState ? this.discussion.toJSON() : this.discussion),
      // Market context
      marketContext: this.marketContext || initializeMarketContext(inferSymbolsFromSectorName(this.name))
    };
  }
}

module.exports = Sector;
