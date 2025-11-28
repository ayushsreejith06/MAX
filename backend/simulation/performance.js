/**
 * performance.js - Sector Performance Simulator
 * Calculates price, applies volatility, and computes risk scores for sectors
 */

/**
 * Calculate a new price for a sector based on current price and market factors
 * @param {Object} sector - Sector object with currentPrice and other properties
 * @returns {number} - Calculated price
 */
function calculatePrice(sector) {
  if (!sector || typeof sector.currentPrice !== 'number') {
    throw new Error('Sector must have a valid currentPrice');
  }

  const basePrice = sector.currentPrice || 100;
  const volatility = sector.volatility || 0.02; // Default 2% volatility
  
  // Use Geometric Brownian Motion for price calculation
  // S(t+1) = S(t) * exp((mu - 0.5*sigma^2)*dt + sigma*sqrt(dt)*Z)
  const drift = 0.0; // Expected return (can be adjusted based on sector performance)
  const timeStep = 1 / 252; // Daily time step (252 trading days per year)
  const sigma = volatility;
  
  // Generate random shock using Box-Muller transform
  const u1 = Math.random();
  const u2 = Math.random();
  const Z = Math.sqrt(-2 * Math.log(u1)) * Math.cos(2 * Math.PI * u2);
  
  // Calculate new price
  const exponent = (drift - 0.5 * sigma * sigma) * timeStep + sigma * Math.sqrt(timeStep) * Z;
  let newPrice = basePrice * Math.exp(exponent);
  
  // Ensure price doesn't go negative or too extreme
  const minPrice = 0.01;
  const maxPrice = basePrice * 10;
  newPrice = Math.max(minPrice, Math.min(maxPrice, newPrice));
  
  return Number(newPrice.toFixed(2));
}

/**
 * Apply volatility to a sector's price
 * Updates the sector's volatility based on recent price movements
 * @param {Object} sector - Sector object
 * @returns {number} - Updated volatility value (0-1)
 */
function applyVolatility(sector) {
  if (!sector) {
    throw new Error('Sector is required');
  }

  // If sector has candleData, calculate historical volatility
  if (sector.candleData && Array.isArray(sector.candleData) && sector.candleData.length >= 2) {
    const prices = sector.candleData.map(candle => {
      if (typeof candle === 'object' && candle !== null) {
        return candle.value || candle.close || candle.currentPrice || sector.currentPrice;
      }
      return typeof candle === 'number' ? candle : sector.currentPrice;
    }).filter(price => typeof price === 'number' && price > 0);

    if (prices.length >= 2) {
      // Calculate returns
      const returns = [];
      for (let i = 1; i < prices.length; i++) {
        const ret = (prices[i] - prices[i - 1]) / prices[i - 1];
        returns.push(ret);
      }

      // Calculate standard deviation of returns
      const mean = returns.reduce((a, b) => a + b, 0) / returns.length;
      const variance = returns.reduce((sum, ret) => sum + Math.pow(ret - mean, 2), 0) / returns.length;
      const stdDev = Math.sqrt(variance);

      // Annualize volatility (assuming daily data)
      const annualizedVol = stdDev * Math.sqrt(252);
      
      // Clamp between 0 and 1 (0% to 100%)
      return Math.max(0, Math.min(1, annualizedVol));
    }
  }

  // Default volatility based on sector characteristics
  // Higher volatility for sectors with more active agents or discussions
  let baseVolatility = 0.02; // 2% default
  
  if (sector.activeAgents > 0 && sector.agents && sector.agents.length > 0) {
    const activityRatio = sector.activeAgents / sector.agents.length;
    // More activity = slightly higher volatility
    baseVolatility = 0.02 + (activityRatio * 0.03); // 2% to 5%
  }

  // Clamp between 0.01 (1%) and 0.5 (50%)
  return Math.max(0.01, Math.min(0.5, baseVolatility));
}

/**
 * Compute risk score for a sector (0-100)
 * Higher score = higher risk
 * @param {Object} sector - Sector object
 * @returns {number} - Risk score from 0 to 100
 */
function computeRiskScore(sector) {
  if (!sector) {
    throw new Error('Sector is required');
  }

  let riskScore = 50; // Default moderate risk

  // Factor 1: Volatility (0-40 points)
  const volatility = sector.volatility || 0.02;
  const volatilityScore = Math.min(40, (volatility / 0.5) * 40); // 0% vol = 0, 50% vol = 40

  // Factor 2: Price change magnitude (0-30 points)
  const changePercent = Math.abs(sector.changePercent || 0);
  const changeScore = Math.min(30, (changePercent / 10) * 30); // 0% change = 0, 10% change = 30

  // Factor 3: Volume activity (0-20 points)
  // Higher volume relative to price = higher risk
  const basePrice = sector.currentPrice || 100;
  const volumeRatio = basePrice > 0 ? (sector.volume || 0) / basePrice : 0;
  const volumeScore = Math.min(20, (volumeRatio / 1000) * 20); // Normalized volume impact

  // Factor 4: Agent activity (0-10 points)
  // More active agents = slightly higher risk (more trading activity)
  let activityScore = 0;
  if (sector.activeAgents > 0 && sector.agents && sector.agents.length > 0) {
    const activityRatio = sector.activeAgents / sector.agents.length;
    activityScore = activityRatio * 10; // 0-10 points
  }

  // Combine all factors
  riskScore = volatilityScore + changeScore + volumeScore + activityScore;

  // Clamp between 0 and 100
  return Math.round(Math.max(0, Math.min(100, riskScore)));
}

module.exports = {
  calculatePrice,
  applyVolatility,
  computeRiskScore
};

