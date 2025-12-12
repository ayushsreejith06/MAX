function clampConfidence(value, fallback = 50) {
  const rawValue = typeof value === 'number' ? value : fallback;
  return Math.max(0, Math.min(100, rawValue));
}

/**
 * Prefer LLM-provided confidence, otherwise fall back to stored confidence or a default of 50.
 * This helper centralizes confidence selection for discussion thresholds.
 *
 * @param {Object} agent - Agent object that may include llmAction or confidence.
 * @param {number} [fallback=50] - Default confidence to use when none is provided.
 * @returns {number} Confidence clamped to 0–100.
 */
function extractConfidence(agent, fallback = 50) {
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

  return clampConfidence(storedConfidence, fallback);
}

module.exports = {
  clampConfidence,
  extractConfidence
};

