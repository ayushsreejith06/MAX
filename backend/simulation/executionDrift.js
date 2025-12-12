/**
 * executionDrift.js - Tracks execution effects on price drift
 * 
 * When BUY executes:
 * - Increases positive drift temporarily
 * - Drift decays back to neutral over 10-30 minutes
 * - Multiple BUYs stack with diminishing returns
 */

// Store execution timestamps per sector
// Format: { sectorId: [{ timestamp, strength }, ...] }
const executionHistory = new Map();

// Configuration
const DRIFT_DURATION_MIN = 10; // Minimum drift duration in minutes
const DRIFT_DURATION_MAX = 30; // Maximum drift duration in minutes
const BASE_DRIFT_STRENGTH = 0.5; // Base drift strength per BUY (annualized)
const DIMINISHING_FACTOR = 0.7; // Each additional BUY contributes 70% of previous

/**
 * Register a BUY execution
 * @param {string} sectorId - Sector ID
 * @param {number} timestamp - Execution timestamp (default: now)
 * @param {number} confidence - Confidence level (0-1) to scale drift strength
 */
function registerBuyExecution(sectorId, timestamp = Date.now(), confidence = 0.5) {
  if (!sectorId) {
    return;
  }

  // Get or create execution history for this sector
  if (!executionHistory.has(sectorId)) {
    executionHistory.set(sectorId, []);
  }

  const history = executionHistory.get(sectorId);
  
  // Calculate drift strength based on confidence (0.3 to 1.0 range)
  const strength = BASE_DRIFT_STRENGTH * (0.3 + 0.7 * confidence);
  
  // Add execution with timestamp and strength
  history.push({
    timestamp,
    strength,
    duration: DRIFT_DURATION_MIN + Math.random() * (DRIFT_DURATION_MAX - DRIFT_DURATION_MIN)
  });

  // Clean up old executions (older than max duration + 5 minutes buffer)
  const maxAge = (DRIFT_DURATION_MAX + 5) * 60 * 1000;
  const cutoff = timestamp - maxAge;
  const filtered = history.filter(exec => exec.timestamp > cutoff);
  executionHistory.set(sectorId, filtered);

  console.log(`[ExecutionDrift] Registered BUY execution for sector ${sectorId} at ${new Date(timestamp).toISOString()}, strength: ${strength.toFixed(3)}`);
}

/**
 * Calculate current drift from active executions
 * @param {string} sectorId - Sector ID
 * @param {number} currentTime - Current timestamp (default: now)
 * @returns {number} Current drift value (annualized)
 */
function calculateCurrentDrift(sectorId, currentTime = Date.now()) {
  if (!sectorId || !executionHistory.has(sectorId)) {
    return 0;
  }

  const history = executionHistory.get(sectorId);
  if (history.length === 0) {
    return 0;
  }

  let totalDrift = 0;
  let diminishingMultiplier = 1.0;

  // Sort by timestamp (oldest first) to apply diminishing returns correctly
  const sortedHistory = [...history].sort((a, b) => a.timestamp - b.timestamp);

  for (const exec of sortedHistory) {
    const age = (currentTime - exec.timestamp) / (1000 * 60); // Age in minutes
    const duration = exec.duration;

    // Skip if execution is too old
    if (age > duration) {
      continue;
    }

    // Calculate decay factor (linear decay from 1.0 to 0.0 over duration)
    const decayFactor = 1.0 - (age / duration);

    // Apply diminishing returns for multiple executions
    const effectiveStrength = exec.strength * diminishingMultiplier * decayFactor;
    totalDrift += effectiveStrength;

    // Apply diminishing factor for next execution
    diminishingMultiplier *= DIMINISHING_FACTOR;
  }

  return totalDrift;
}

/**
 * Get execution history for a sector (for debugging/monitoring)
 * @param {string} sectorId - Sector ID
 * @returns {Array} Array of execution records
 */
function getExecutionHistory(sectorId) {
  if (!sectorId || !executionHistory.has(sectorId)) {
    return [];
  }
  return [...executionHistory.get(sectorId)];
}

/**
 * Clear execution history for a sector
 * @param {string} sectorId - Sector ID
 */
function clearExecutionHistory(sectorId) {
  if (sectorId) {
    executionHistory.delete(sectorId);
  } else {
    executionHistory.clear();
  }
}

/**
 * Get summary of active executions for a sector
 * @param {string} sectorId - Sector ID
 * @param {number} currentTime - Current timestamp (default: now)
 * @returns {Object} Summary with active count and current drift
 */
function getExecutionSummary(sectorId, currentTime = Date.now()) {
  if (!sectorId || !executionHistory.has(sectorId)) {
    return {
      activeExecutions: 0,
      currentDrift: 0,
      totalExecutions: 0
    };
  }

  const history = executionHistory.get(sectorId);
  const active = history.filter(exec => {
    const age = (currentTime - exec.timestamp) / (1000 * 60);
    return age <= exec.duration;
  });

  return {
    activeExecutions: active.length,
    currentDrift: calculateCurrentDrift(sectorId, currentTime),
    totalExecutions: history.length
  };
}

module.exports = {
  registerBuyExecution,
  calculateCurrentDrift,
  getExecutionHistory,
  clearExecutionHistory,
  getExecutionSummary
};

