/**
 * Clamp confidence value to 0-100 range.
 * 
 * Phase 4: Confidence is monotonically increasing.
 * Phase 5: Confidence will be data-driven and bidirectional.
 * 
 * @param {number} value - Confidence value to clamp
 * @param {number} fallback - Fallback value if value is invalid (default: 0)
 * @returns {number} Confidence clamped to 0–100
 */
function clampConfidence(value, fallback = 0) {
  const rawValue = typeof value === 'number' && Number.isFinite(value) ? value : fallback;
  return Math.max(0, Math.min(100, rawValue));
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
  extractConfidence
};

