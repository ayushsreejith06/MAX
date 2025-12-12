/**
 * Clamp confidence value to 1-100 range (minimum 1 to ensure it's actionable).
 * 
 * @param {number} value - Confidence value to clamp
 * @param {number} fallback - Fallback value if value is invalid (default: 1)
 * @returns {number} Confidence clamped to 1–100
 */
function clampConfidence(value, fallback = 1) {
  const rawValue = typeof value === 'number' && Number.isFinite(value) ? value : fallback;
  return Math.max(1, Math.min(100, rawValue));
}

/**
 * Infer confidence from action type and reasoning when LLM doesn't provide it.
 * 
 * Rules:
 * - BUY/SELL with reasoning → 60–85 (stronger reasoning = higher confidence)
 * - HOLD / uncertainty language → 5–30 (uncertainty language = lower confidence)
 * 
 * @param {string} action - Action type: 'BUY' | 'SELL' | 'HOLD'
 * @param {string} reasoning - Reasoning text from LLM
 * @returns {number} Inferred confidence value (1-100)
 */
function inferConfidenceFromAction(action, reasoning = '') {
  const normalizedAction = typeof action === 'string' ? action.trim().toUpperCase() : 'HOLD';
  const reasoningLower = typeof reasoning === 'string' ? reasoning.toLowerCase() : '';
  
  // Uncertainty indicators in reasoning
  const uncertaintyKeywords = [
    'uncertain', 'unclear', 'unpredictable', 'volatile', 'risky',
    'maybe', 'perhaps', 'possibly', 'might', 'could', 'may',
    'not sure', 'unsure', 'doubt', 'hesitant', 'cautious',
    'wait', 'monitor', 'observe', 'watch', 'see'
  ];
  
  // Strong conviction indicators
  const strongKeywords = [
    'strong', 'clear', 'definite', 'confident', 'certain',
    'convinced', 'evidence', 'indicates', 'suggests', 'shows',
    'trend', 'momentum', 'pattern', 'signal', 'opportunity'
  ];
  
  const hasUncertainty = uncertaintyKeywords.some(keyword => reasoningLower.includes(keyword));
  const hasStrongConviction = strongKeywords.some(keyword => reasoningLower.includes(keyword));
  
  if (normalizedAction === 'BUY' || normalizedAction === 'SELL') {
    // BUY/SELL with reasoning → 60–85
    if (hasUncertainty) {
      // Even with BUY/SELL, uncertainty lowers confidence
      return 50 + Math.floor(Math.random() * 15); // 50-65
    } else if (hasStrongConviction) {
      // Strong conviction increases confidence
      return 70 + Math.floor(Math.random() * 16); // 70-85
    } else {
      // Default BUY/SELL confidence
      return 60 + Math.floor(Math.random() * 16); // 60-75
    }
  } else {
    // HOLD / uncertainty language → 5–30
    if (hasUncertainty) {
      return 5 + Math.floor(Math.random() * 11); // 5-15
    } else if (hasStrongConviction) {
      // Even HOLD with strong reasoning is still low confidence
      return 20 + Math.floor(Math.random() * 11); // 20-30
    } else {
      // Default HOLD confidence
      return 10 + Math.floor(Math.random() * 16); // 10-25
    }
  }
}

/**
 * Prefer LLM-provided confidence, otherwise fall back to stored confidence or a default.
 * This helper centralizes confidence selection for discussion thresholds.
 * 
 * Phase 4: Confidence is monotonically increasing.
 * Phase 5: Confidence will be data-driven and bidirectional.
 *
 * @param {Object} agent - Agent object that may include llmAction or confidence.
 * @param {number} [fallback=0] - Default confidence to use when none is provided.
 * @returns {number} Confidence clamped to 0–100.
 */
function extractConfidence(agent, fallback = 0) {
  if (!agent) {
    return clampConfidence(undefined, fallback);
  }

  const llmConfidence =
    agent.llmAction && typeof agent.llmAction.confidence === 'number'
      ? agent.llmAction.confidence
      : null;

  const storedConfidence =
    llmConfidence !== null
      ? llmConfidence
      : typeof agent.confidence === 'number'
      ? agent.confidence
      : null;

  // Use stored confidence if available, otherwise use fallback
  const confidence = storedConfidence !== null 
    ? storedConfidence 
    : fallback;
  
  return clampConfidence(confidence, fallback);
}

module.exports = {
  clampConfidence,
  extractConfidence,
  inferConfidenceFromAction
};

