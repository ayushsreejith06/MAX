/**
 * crossSignals.js - Cross-sector signal propagation
 * When one sector triggers a strong BUY/SELL with high confidence,
 * propagate weighted signal to related sectors
 */

class CrossSignals {
  constructor() {
    this.sectorRelations = new Map(); // Map of sectorId -> related sectors with weights
    this.signalHistory = []; // History of signals for analysis
  }

  /**
   * Define relationship between sectors
   * @param {string} sectorId - Source sector ID
   * @param {Array} relatedSectors - Array of {sectorId, weight} objects
   */
  setSectorRelations(sectorId, relatedSectors) {
    this.sectorRelations.set(sectorId, relatedSectors);
  }

  /**
   * Get related sectors for a given sector
   */
  getRelatedSectors(sectorId) {
    return this.sectorRelations.get(sectorId) || [];
  }

  /**
   * Process a signal from a sector and propagate to related sectors
   * @param {Object} signal - Signal object
   * @param {string} signal.sectorId - Source sector ID
   * @param {string} signal.action - 'BUY' or 'SELL'
   * @param {number} signal.confidence - Confidence level (0-1)
   * @param {number} signal.strength - Signal strength (0-1)
   * @param {string} signal.agentId - Agent that generated the signal
   */
  processSignal(signal) {
    // Store signal in history
    this.signalHistory.push({
      ...signal,
      timestamp: Date.now()
    });

    // Keep only last 1000 signals
    if (this.signalHistory.length > 1000) {
      this.signalHistory.shift();
    }

    // Check if signal is strong enough to propagate
    const minConfidence = 0.7; // Minimum confidence to propagate
    const minStrength = 0.6; // Minimum strength to propagate

    if (signal.confidence < minConfidence || signal.strength < minStrength) {
      return []; // Signal not strong enough
    }

    // Get related sectors
    const relatedSectors = this.getRelatedSectors(signal.sectorId);

    // Generate propagated signals
    const propagatedSignals = relatedSectors.map(relation => {
      // Weight the signal by relationship strength
      const weightedConfidence = signal.confidence * relation.weight;
      const weightedStrength = signal.strength * relation.weight;

      return {
        sourceSectorId: signal.sectorId,
        targetSectorId: relation.sectorId,
        action: signal.action,
        confidence: weightedConfidence,
        strength: weightedStrength,
        originalSignal: signal,
        timestamp: Date.now()
      };
    });

    return propagatedSignals;
  }

  /**
   * Get recent signals for a sector
   */
  getRecentSignals(sectorId, limit = 10) {
    return this.signalHistory
      .filter(s => s.sectorId === sectorId)
      .slice(-limit)
      .reverse();
  }

  /**
   * Get propagated signals for a sector
   */
  getPropagatedSignals(targetSectorId, limit = 10) {
    return this.signalHistory
      .filter(s => {
        const related = this.getRelatedSectors(s.sectorId);
        return related.some(r => r.sectorId === targetSectorId);
      })
      .slice(-limit)
      .reverse();
  }

  /**
   * Calculate signal strength based on multiple factors
   */
  calculateSignalStrength(action, confidence, riskScore, volume) {
    // Base strength from confidence
    let strength = confidence;

    // Adjust based on risk score (lower risk = stronger signal)
    const riskAdjustment = 1 - (riskScore / 100) * 0.3; // Max 30% reduction
    strength *= riskAdjustment;

    // Adjust based on volume (higher volume = stronger signal)
    const volumeAdjustment = Math.min(1.0, volume / 10000); // Normalize to 10k volume
    strength *= (0.7 + 0.3 * volumeAdjustment);

    return Math.min(1.0, Math.max(0.0, strength));
  }

  /**
   * Get cross-signal summary for a sector
   */
  getSummary(sectorId) {
    const recentSignals = this.getRecentSignals(sectorId, 20);
    const propagatedSignals = this.getPropagatedSignals(sectorId, 20);
    const relatedSectors = this.getRelatedSectors(sectorId);

    // Calculate aggregate signal
    let buySignals = 0;
    let sellSignals = 0;
    let totalConfidence = 0;

    recentSignals.forEach(signal => {
      if (signal.action === 'BUY') {
        buySignals += signal.confidence;
      } else {
        sellSignals += signal.confidence;
      }
      totalConfidence += signal.confidence;
    });

    const netSignal = buySignals - sellSignals;
    const aggregateAction = netSignal > 0 ? 'BUY' : netSignal < 0 ? 'SELL' : 'HOLD';
    const aggregateStrength = Math.abs(netSignal) / Math.max(1, totalConfidence);

    return {
      sectorId,
      relatedSectors,
      recentSignals: recentSignals.length,
      propagatedSignals: propagatedSignals.length,
      aggregateAction,
      aggregateStrength,
      buySignals,
      sellSignals
    };
  }
}

module.exports = CrossSignals;

