/**
 * Confidence Multiplier Utility
 * 
 * Future-facing scaffolding for confidence-based execution impact.
 * Currently disabled by default - logic will be implemented when ML models are ready.
 * 
 * This module provides hooks for:
 * - Calculating confidence-based multipliers for execution impact
 * - Storing confidence snapshots for future ML training
 */

const { isConfidenceBasedExecutionImpactEnabled } = require('../config/featureFlags');

/**
 * Calculate confidence snapshot from agents involved in execution
 * 
 * @param {Array<Object>} agents - Array of agent objects with confidence values
 * @param {string} managerId - Optional manager ID
 * @returns {Object|null} Confidence snapshot object or null if no agents
 */
function captureConfidenceSnapshot(agents = [], managerId = null) {
  if (!Array.isArray(agents) || agents.length === 0) {
    return null;
  }

  const snapshot = {
    timestamp: Date.now(),
    agentConfidences: {}
  };

  // Capture confidence for each agent
  for (const agent of agents) {
    if (agent && agent.id) {
      const confidence = typeof agent.confidence === 'number' ? agent.confidence : null;
      if (confidence !== null) {
        snapshot.agentConfidences[agent.id] = confidence;
      }
    }
  }

  // If manager ID provided, include it separately
  if (managerId) {
    const manager = agents.find(a => a && a.id === managerId);
    if (manager && typeof manager.confidence === 'number') {
      snapshot.managerId = managerId;
      snapshot.managerConfidence = manager.confidence;
    }
  }

  // Return null if no confidence values captured
  if (Object.keys(snapshot.agentConfidences).length === 0 && !snapshot.managerConfidence) {
    return null;
  }

  return snapshot;
}

/**
 * Calculate confidence-based multiplier for execution impact
 * 
 * This is a placeholder function that will be replaced with ML logic in the future.
 * Currently returns 1.0 (no multiplier) when feature is disabled.
 * 
 * When enabled, this will:
 * - Analyze agent confidence levels
 * - Calculate appropriate multiplier based on confidence
 * - Return multiplier to be applied to priceImpact
 * 
 * @param {Object} confidenceSnapshot - Confidence snapshot from captureConfidenceSnapshot()
 * @param {string} action - Action type (BUY, SELL, HOLD)
 * @returns {number} Multiplier to apply to priceImpact (default: 1.0)
 */
function calculateConfidenceMultiplier(confidenceSnapshot, action = 'HOLD') {
  // Feature is disabled by default - return no-op multiplier
  if (!isConfidenceBasedExecutionImpactEnabled()) {
    return null; // null indicates no multiplier applied (feature disabled)
  }

  // Future ML logic will go here
  // For now, return 1.0 as a placeholder when feature is enabled
  // This ensures the hook is in place but doesn't change behavior yet
  
  if (!confidenceSnapshot || !confidenceSnapshot.agentConfidences) {
    return 1.0; // Default multiplier if no confidence data
  }

  // Placeholder logic: simple average confidence normalization
  // This will be replaced with ML model in the future
  const confidences = Object.values(confidenceSnapshot.agentConfidences);
  if (confidences.length === 0) {
    return 1.0;
  }

  const avgConfidence = confidences.reduce((sum, c) => sum + c, 0) / confidences.length;
  
  // Normalize confidence (1-100) to multiplier range (0.5 - 1.5)
  // Higher confidence = higher multiplier (up to 1.5x)
  // Lower confidence = lower multiplier (down to 0.5x)
  // This is placeholder logic - will be replaced with ML model
  const normalizedConfidence = (avgConfidence - 1) / 99; // 0-1 range
  const multiplier = 0.5 + (normalizedConfidence * 1.0); // 0.5-1.5 range

  return Math.max(0.5, Math.min(1.5, multiplier));
}

/**
 * Apply confidence multiplier to price impact
 * 
 * @param {number} basePriceImpact - Base price impact before multiplier
 * @param {number|null} multiplier - Confidence multiplier (null if feature disabled)
 * @returns {number} Adjusted price impact
 */
function applyConfidenceMultiplier(basePriceImpact, multiplier) {
  if (multiplier === null || multiplier === undefined) {
    // Feature disabled - return base impact unchanged
    return basePriceImpact;
  }

  if (typeof basePriceImpact !== 'number' || !isFinite(basePriceImpact)) {
    return basePriceImpact;
  }

  if (typeof multiplier !== 'number' || !isFinite(multiplier)) {
    return basePriceImpact;
  }

  return basePriceImpact * multiplier;
}

module.exports = {
  captureConfidenceSnapshot,
  calculateConfidenceMultiplier,
  applyConfidenceMultiplier
};

