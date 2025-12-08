/**
 * ConfidenceEngine - Pure logic engine for updating agent confidence
 * 
 * Updates agent confidence based on:
 * - Agent type (researcher, analyst, manager, etc.)
 * - Simulated market data (price, volume, volatility, risk)
 * - Custom user rules
 * 
 * Confidence range: -100 to +100
 * Discussion trigger: All agents must have confidence >= 65
 */

class ConfidenceEngine {
  constructor(customRules = {}) {
    /**
     * Custom user rules for confidence calculation
     * Format: {
     *   agentTypeModifiers: { [role]: (baseConfidence, marketData) => number },
     *   marketDataModifiers: { [indicator]: (value, agent) => number },
     *   globalModifiers: (confidence, agent, sector) => number
     * }
     */
    this.customRules = customRules;
  }

  /**
   * Update agent confidence based on agent type, market data, and custom rules
   * @param {Object} agent - Agent object with id, role, performance, personality, morale, etc.
   * @param {Object} sector - Sector object with currentPrice, change, changePercent, volume, volatility, riskScore, etc.
   * @returns {number} Updated confidence value (-100 to +100)
   */
  updateAgentConfidence(agent, sector) {
    if (!agent || !sector) {
      return 0; // Default neutral confidence
    }

    // Get current confidence from agent (default to 0 if not set)
    const currentConfidence = typeof agent.confidence === 'number' 
      ? Math.max(-100, Math.min(100, agent.confidence))
      : 0;

    // Base confidence calculation based on agent type
    const baseConfidence = this._calculateBaseConfidenceByType(agent, sector);

    // Market data influence
    const marketInfluence = this._calculateMarketInfluence(agent, sector);

    // Performance influence
    const performanceInfluence = this._calculatePerformanceInfluence(agent);

    // Personality influence
    const personalityInfluence = this._calculatePersonalityInfluence(agent, sector);

    // Morale influence (if available)
    const moraleInfluence = this._calculateMoraleInfluence(agent);

    // Combine all influences
    let newConfidence = baseConfidence + marketInfluence + performanceInfluence + 
                       personalityInfluence + moraleInfluence;

    // Apply custom rules if provided
    if (this.customRules.agentTypeModifiers && 
        this.customRules.agentTypeModifiers[agent.role]) {
      newConfidence = this.customRules.agentTypeModifiers[agent.role](
        newConfidence, 
        this._extractMarketData(sector)
      );
    }

    if (this.customRules.marketDataModifiers) {
      Object.entries(this.customRules.marketDataModifiers).forEach(([indicator, modifier]) => {
        const value = sector[indicator];
        if (value !== undefined) {
          newConfidence += modifier(value, agent);
        }
      });
    }

    if (this.customRules.globalModifiers) {
      newConfidence = this.customRules.globalModifiers(newConfidence, agent, sector);
    }

    // Smooth transition from current confidence (prevents sudden jumps)
    const smoothingFactor = 0.3; // 30% of new value, 70% of current
    const smoothedConfidence = (currentConfidence * (1 - smoothingFactor)) + 
                               (newConfidence * smoothingFactor);

    // Clamp to valid range
    return Math.max(-100, Math.min(100, smoothedConfidence));
  }

  /**
   * Check if discussion should be triggered for a sector
   * Returns true ONLY if ALL agents have confidence >= 65
   * @param {Object} sector - Sector object with agents array
   * @returns {boolean} True if all agents have confidence >= 65
   */
  shouldTriggerDiscussion(sector) {
    if (!sector || !Array.isArray(sector.agents) || sector.agents.length === 0) {
      return false;
    }

    // Check if all agents have confidence >= 65
    return sector.agents.every(agent => {
      const confidence = typeof agent.confidence === 'number' 
        ? agent.confidence 
        : 0;
      return confidence >= 65;
    });
  }

  /**
   * Calculate base confidence based on agent type
   * @private
   */
  _calculateBaseConfidenceByType(agent, sector) {
    const role = (agent.role || '').toLowerCase();
    let baseConfidence = 0;

    // Different agent types have different base confidence levels
    if (role.includes('manager')) {
      // Managers tend to have moderate confidence
      baseConfidence = 20;
    } else if (role.includes('research') || role.includes('analyst')) {
      // Researchers and analysts have higher base confidence
      baseConfidence = 30;
    } else if (role.includes('trader')) {
      // Traders have moderate confidence
      baseConfidence = 15;
    } else if (role.includes('execution')) {
      // Execution agents have lower base confidence (they follow orders)
      baseConfidence = 10;
    } else if (role.includes('riskmanager') || role.includes('risk')) {
      // Risk managers are more cautious
      baseConfidence = 5;
    } else if (role.includes('advisor')) {
      // Advisors have moderate-high confidence
      baseConfidence = 25;
    } else {
      // General/default agents
      baseConfidence = 10;
    }

    return baseConfidence;
  }

  /**
   * Calculate market data influence on confidence
   * @private
   */
  _calculateMarketInfluence(agent, sector) {
    let influence = 0;

    // Price change influence
    if (typeof sector.changePercent === 'number') {
      // Positive price change increases confidence, negative decreases it
      // Scale: 1% change = 2 confidence points
      influence += sector.changePercent * 2;
    }

    // Volume influence
    if (typeof sector.volume === 'number' && sector.volume > 0) {
      // Higher volume suggests more market activity and confidence
      // Normalize: volume > 1000 adds confidence, very low volume reduces it
      const volumeFactor = Math.min(10, Math.log10(sector.volume + 1) * 2);
      influence += volumeFactor;
    }

    // Volatility influence
    if (typeof sector.volatility === 'number') {
      // High volatility reduces confidence (uncertainty)
      // Scale: 0.01 (1%) volatility = -5 confidence points
      influence -= sector.volatility * 500;
    }

    // Risk score influence
    if (typeof sector.riskScore === 'number') {
      // Higher risk score reduces confidence
      // Scale: risk score 0-100 maps to -20 to +20 confidence
      influence += (50 - sector.riskScore) * 0.4;
    }

    // Price trend from candle data
    if (Array.isArray(sector.candleData) && sector.candleData.length >= 2) {
      const recentCandles = sector.candleData.slice(-5);
      const priceTrend = this._calculatePriceTrend(recentCandles);
      // Positive trend adds confidence, negative trend reduces it
      influence += priceTrend * 5;
    }

    return influence;
  }

  /**
   * Calculate performance influence on confidence
   * @private
   */
  _calculatePerformanceInfluence(agent) {
    let influence = 0;

    if (!agent.performance) {
      return influence;
    }

    // Win rate influence
    if (typeof agent.performance.winRate === 'number') {
      // Win rate 0-1 maps to -30 to +30 confidence
      influence += (agent.performance.winRate - 0.5) * 60;
    }

    // PnL influence
    if (typeof agent.performance.pnl === 'number') {
      // Positive PnL increases confidence, negative decreases it
      // Scale: $1000 PnL = 1 confidence point (capped at ±20)
      const pnlFactor = Math.min(20, Math.max(-20, agent.performance.pnl / 1000));
      influence += pnlFactor;
    }

    // Trade count influence (more experience = slightly higher confidence)
    if (typeof agent.performance.totalTrades === 'number' && agent.performance.totalTrades > 0) {
      const experienceFactor = Math.min(5, Math.log10(agent.performance.totalTrades + 1));
      influence += experienceFactor;
    }

    return influence;
  }

  /**
   * Calculate personality influence on confidence
   * @private
   */
  _calculatePersonalityInfluence(agent, sector) {
    let influence = 0;

    if (!agent.personality) {
      return influence;
    }

    const riskTolerance = agent.personality.riskTolerance;
    const decisionStyle = agent.personality.decisionStyle;

    // Risk tolerance influence
    if (typeof riskTolerance === 'number') {
      // Higher risk tolerance = slightly higher base confidence
      influence += (riskTolerance - 0.5) * 10;
    } else if (typeof riskTolerance === 'string') {
      const riskLower = riskTolerance.toLowerCase();
      if (riskLower.includes('high') || riskLower.includes('aggressive')) {
        influence += 10;
      } else if (riskLower.includes('low') || riskLower.includes('conservative')) {
        influence -= 5;
      }
    }

    // Decision style influence
    if (typeof decisionStyle === 'string') {
      const styleLower = decisionStyle.toLowerCase();
      if (styleLower.includes('aggressive') || styleLower.includes('bold')) {
        influence += 5;
      } else if (styleLower.includes('cautious') || styleLower.includes('conservative')) {
        influence -= 5;
      }
    }

    // Risk tolerance interaction with market volatility
    if (typeof sector.volatility === 'number') {
      const isHighRiskTolerance = 
        (typeof riskTolerance === 'number' && riskTolerance > 0.6) ||
        (typeof riskTolerance === 'string' && 
         (riskTolerance.toLowerCase().includes('high') || 
          riskTolerance.toLowerCase().includes('aggressive')));
      
      if (isHighRiskTolerance && sector.volatility > 0.03) {
        // High risk tolerance agents are less affected by volatility
        influence += 5;
      } else if (!isHighRiskTolerance && sector.volatility > 0.03) {
        // Low risk tolerance agents are more affected by volatility
        influence -= 10;
      }
    }

    return influence;
  }

  /**
   * Calculate morale influence on confidence
   * @private
   */
  _calculateMoraleInfluence(agent) {
    if (typeof agent.morale !== 'number') {
      return 0;
    }

    // Morale 0-100 maps to -20 to +20 confidence
    // High morale (80+) increases confidence, low morale (20-) decreases it
    return (agent.morale - 50) * 0.4;
  }

  /**
   * Calculate price trend from candle data
   * @private
   */
  _calculatePriceTrend(candles) {
    if (!Array.isArray(candles) || candles.length < 2) {
      return 0;
    }

    // Calculate average price change
    let totalChange = 0;
    let validPairs = 0;

    for (let i = 1; i < candles.length; i++) {
      const prevClose = candles[i - 1].close || candles[i - 1].open;
      const currClose = candles[i].close || candles[i].open;
      
      if (typeof prevClose === 'number' && typeof currClose === 'number' && prevClose > 0) {
        const change = (currClose - prevClose) / prevClose;
        totalChange += change;
        validPairs++;
      }
    }

    if (validPairs === 0) {
      return 0;
    }

    // Return average percentage change (positive = uptrend, negative = downtrend)
    return totalChange / validPairs;
  }

  /**
   * Extract market data object for custom rules
   * @private
   */
  _extractMarketData(sector) {
    return {
      currentPrice: sector.currentPrice,
      change: sector.change,
      changePercent: sector.changePercent,
      volume: sector.volume,
      volatility: sector.volatility,
      riskScore: sector.riskScore,
      candleData: sector.candleData
    };
  }
}

module.exports = ConfidenceEngine;
