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
 * This function analyzes the reasoning text to determine confidence based on:
 * - Action type (BUY/SELL vs HOLD)
 * - Reasoning quality and conviction indicators
 * - Market data references in reasoning
 * 
 * Rules:
 * - BUY/SELL with strong reasoning → 60–85 (stronger reasoning = higher confidence)
 * - BUY/SELL with weak reasoning → 40–60
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
    'wait', 'monitor', 'observe', 'watch', 'see', 'insufficient',
    'limited', 'weak', 'unclear signals', 'mixed signals'
  ];
  
  // Strong conviction indicators
  const strongKeywords = [
    'strong', 'clear', 'definite', 'confident', 'certain',
    'convinced', 'evidence', 'indicates', 'suggests', 'shows',
    'trend', 'momentum', 'pattern', 'signal', 'opportunity',
    'significant', 'substantial', 'robust', 'solid', 'compelling'
  ];
  
  // Market data reference indicators (shows agent is using actual data)
  const dataReferenceKeywords = [
    'trend', 'price', 'volatility', 'change', 'percent', '%',
    'indicator', 'signal', 'pattern', 'movement', 'direction',
    'above', 'below', 'increased', 'decreased', 'rising', 'falling'
  ];
  
  const hasUncertainty = uncertaintyKeywords.some(keyword => reasoningLower.includes(keyword));
  const hasStrongConviction = strongKeywords.some(keyword => reasoningLower.includes(keyword));
  const hasDataReferences = dataReferenceKeywords.some(keyword => reasoningLower.includes(keyword));
  
  // Calculate reasoning quality score (0-1)
  let reasoningQuality = 0.5; // Base quality
  if (hasStrongConviction) reasoningQuality += 0.3;
  if (hasDataReferences) reasoningQuality += 0.2;
  if (hasUncertainty) reasoningQuality -= 0.3;
  reasoningQuality = Math.max(0, Math.min(1, reasoningQuality)); // Clamp to 0-1
  
  if (normalizedAction === 'BUY' || normalizedAction === 'SELL') {
    // BUY/SELL with reasoning → 60–85
    if (hasUncertainty) {
      // Even with BUY/SELL, uncertainty lowers confidence
      return Math.round(50 + (reasoningQuality * 15)); // 50-65
    } else if (hasStrongConviction && hasDataReferences) {
      // Strong conviction with data references = highest confidence
      return Math.round(70 + (reasoningQuality * 15)); // 70-85
    } else if (hasStrongConviction || hasDataReferences) {
      // Moderate confidence
      return Math.round(60 + (reasoningQuality * 10)); // 60-70
    } else {
      // Default BUY/SELL confidence (weak reasoning)
      return Math.round(50 + (reasoningQuality * 10)); // 50-60
    }
  } else {
    // HOLD / uncertainty language → 5–30
    if (hasUncertainty) {
      return Math.round(5 + (reasoningQuality * 10)); // 5-15
    } else if (hasStrongConviction) {
      // Even HOLD with strong reasoning is still low confidence
      return Math.round(20 + (reasoningQuality * 10)); // 20-30
    } else {
      // Default HOLD confidence
      return Math.round(10 + (reasoningQuality * 15)); // 10-25
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

