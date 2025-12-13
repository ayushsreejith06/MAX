/**
 * Feature Flags Configuration
 * 
 * Controls experimental features and future-facing functionality.
 * All flags default to false (disabled) for safety.
 */

const FEATURE_FLAGS = {
  /**
   * Enable confidence-based execution impact multiplier.
   * When enabled, agent confidence will influence price impact calculations.
   * 
   * Default: false (disabled)
   * Future: Will enable ML-driven confidence impact on simulation outcomes
   */
  CONFIDENCE_BASED_EXECUTION_IMPACT: false
};

/**
 * Get a feature flag value
 * @param {string} flagName - Name of the feature flag
 * @returns {boolean} Flag value (defaults to false if flag doesn't exist)
 */
function getFeatureFlag(flagName) {
  return FEATURE_FLAGS[flagName] || false;
}

/**
 * Set a feature flag value (for runtime configuration)
 * @param {string} flagName - Name of the feature flag
 * @param {boolean} value - New flag value
 */
function setFeatureFlag(flagName, value) {
  if (flagName in FEATURE_FLAGS) {
    FEATURE_FLAGS[flagName] = Boolean(value);
    console.log(`[FeatureFlags] ${flagName} set to ${FEATURE_FLAGS[flagName]}`);
  } else {
    console.warn(`[FeatureFlags] Unknown feature flag: ${flagName}`);
  }
}

/**
 * Check if confidence-based execution impact is enabled
 * @returns {boolean}
 */
function isConfidenceBasedExecutionImpactEnabled() {
  return getFeatureFlag('CONFIDENCE_BASED_EXECUTION_IMPACT');
}

module.exports = {
  FEATURE_FLAGS,
  getFeatureFlag,
  setFeatureFlag,
  isConfidenceBasedExecutionImpactEnabled
};

