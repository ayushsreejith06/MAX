/**
 * priceSimulator.js - Generates stochastic price movement using Geometric Brownian Motion
 * Includes volatility parameter per sector and riskScore calculation (0-100)
 */

const { calculateCurrentDrift } = require('./executionDrift');

class PriceSimulator {
  constructor(sectorId, initialPrice = 100, volatility = 0.02) {
    this.sectorId = sectorId;
    this.currentPrice = initialPrice;
    this.volatility = volatility; // Annual volatility (e.g., 0.02 = 2%)
    this.drift = 0.0; // Base drift parameter (expected return)
    this.timeStep = 1 / 252; // Daily time step (assuming 252 trading days per year)
  }

  /**
   * Generate next price using Geometric Brownian Motion
   * S(t+1) = S(t) * exp((mu - 0.5*sigma^2)*dt + sigma*sqrt(dt)*Z)
   * where:
   *   mu = drift (expected return) + execution drift
   *   sigma = volatility
   *   dt = time step
   *   Z = standard normal random variable
   */
  generateNextPrice() {
    const dt = this.timeStep;
    const sigma = this.volatility;
    
    // Get execution drift from BUY executions
    const executionDrift = calculateCurrentDrift(this.sectorId);
    
    // Combine base drift with execution drift
    const mu = this.drift + executionDrift;

    // Generate random shock (standard normal)
    const Z = this.generateRandomShock();

    // GBM formula
    const exponent = (mu - 0.5 * sigma * sigma) * dt + sigma * Math.sqrt(dt) * Z;
    const newPrice = this.currentPrice * Math.exp(exponent);

    // Ensure price doesn't go negative or too extreme
    const minPrice = 0.01;
    const maxPrice = this.currentPrice * 10;
    const clampedPrice = Math.max(minPrice, Math.min(maxPrice, newPrice));

    this.currentPrice = clampedPrice;
    return clampedPrice;
  }

  /**
   * Generate random shock using Box-Muller transform for normal distribution
   */
  generateRandomShock() {
    // Box-Muller transform
    const u1 = Math.random();
    const u2 = Math.random();
    const Z = Math.sqrt(-2 * Math.log(u1)) * Math.cos(2 * Math.PI * u2);
    return Z;
  }

  /**
   * Calculate risk score (0-100) based on recent price volatility
   * Higher volatility = higher risk score
   */
  calculateRiskScore(priceHistory = []) {
    if (priceHistory.length < 2) {
      return 50; // Default moderate risk
    }

    // Calculate returns
    const returns = [];
    for (let i = 1; i < priceHistory.length; i++) {
      const ret = (priceHistory[i] - priceHistory[i - 1]) / priceHistory[i - 1];
      returns.push(ret);
    }

    // Calculate standard deviation of returns
    const mean = returns.reduce((a, b) => a + b, 0) / returns.length;
    const variance = returns.reduce((sum, ret) => sum + Math.pow(ret - mean, 2), 0) / returns.length;
    const stdDev = Math.sqrt(variance);

    // Annualize volatility (assuming daily data)
    const annualizedVol = stdDev * Math.sqrt(252);

    // Convert to risk score (0-100)
    // Normalize: 0% vol = 0 risk, 50% vol = 100 risk
    const riskScore = Math.min(100, Math.max(0, (annualizedVol / 0.5) * 100));

    return Math.round(riskScore);
  }

  /**
   * Update volatility parameter
   */
  setVolatility(volatility) {
    this.volatility = Math.max(0, Math.min(1, volatility)); // Clamp between 0 and 1
  }

  /**
   * Update drift parameter
   */
  setDrift(drift) {
    this.drift = drift;
  }

  /**
   * Set current price
   */
  setPrice(price) {
    this.currentPrice = Math.max(0.01, price);
  }

  /**
   * Get current price
   */
  getPrice() {
    return this.currentPrice;
  }

  /**
   * Simulate multiple steps and return price history
   */
  simulateSteps(steps = 1) {
    const history = [this.currentPrice];
    for (let i = 0; i < steps; i++) {
      history.push(this.generateNextPrice());
    }
    return history;
  }

  /**
   * Get simulator state
   */
  getState() {
    return {
      sectorId: this.sectorId,
      currentPrice: this.currentPrice,
      volatility: this.volatility,
      drift: this.drift,
      riskScore: this.calculateRiskScore([this.currentPrice])
    };
  }
}

module.exports = PriceSimulator;

