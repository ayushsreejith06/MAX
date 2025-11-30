/**
 * rules.js - Configurable rules per sector
 * Rule schema stored in backend/storage/
 */

const { readDataFile, writeDataFile } = require('../utils/persistence');

const RULES_FILE = 'simulation_rules.json';

const DEFAULT_RULES = {
  maxTradeSize: 10000, // Maximum trade size in units
  riskAppetite: 0.5, // Risk appetite (0-1, where 1 is highest risk)
  assetWhitelist: [], // Empty array means all assets allowed
  safetyGuards: {
    maxPositionSize: 50000, // Maximum position size
    maxDailyLoss: 0.1, // Maximum daily loss (10%)
    maxLeverage: 1.0, // Maximum leverage (1.0 = no leverage)
    minLiquidity: 1000 // Minimum liquidity required
  }
};

/**
 * Load rules for a sector
 */
async function loadRules(sectorId) {
  try {
    const allRules = await readDataFile(RULES_FILE);
    if (!allRules || typeof allRules !== 'object') {
      return { ...DEFAULT_RULES };
    }
    return allRules[sectorId] || { ...DEFAULT_RULES };
  } catch (error) {
    if (error.code === 'ENOENT') {
      // File doesn't exist, return defaults
      return { ...DEFAULT_RULES };
    }
    throw error;
  }
}

/**
 * Save rules for a sector
 */
async function saveRules(sectorId, rules) {
  try {
    let allRules = {};
    try {
      allRules = await readDataFile(RULES_FILE);
      if (!allRules || typeof allRules !== 'object') {
        allRules = {};
      }
    } catch (error) {
      if (error.code !== 'ENOENT') {
        throw error;
      }
    }

    allRules[sectorId] = { ...DEFAULT_RULES, ...rules };
    await writeDataFile(RULES_FILE, allRules);
    return allRules[sectorId];
  } catch (error) {
    throw new Error(`Failed to save rules for sector ${sectorId}: ${error.message}`);
  }
}

/**
 * Validate a trade against rules
 */
async function validateTrade(sectorId, tradeDecision) {
  const rules = await loadRules(sectorId);
  const errors = [];

  // Check max trade size
  if (tradeDecision.quantity > rules.maxTradeSize) {
    errors.push(`Trade size ${tradeDecision.quantity} exceeds maximum ${rules.maxTradeSize}`);
  }

  // Check asset whitelist
  if (rules.assetWhitelist.length > 0) {
    const assetId = tradeDecision.assetId || tradeDecision.sectorId;
    if (!rules.assetWhitelist.includes(assetId)) {
      errors.push(`Asset ${assetId} not in whitelist`);
    }
  }

  // Check safety guards
  const safety = rules.safetyGuards;
  
  // Check position size (would need current position tracking)
  // This is a placeholder - in real implementation, you'd check against current positions
  if (tradeDecision.quantity > safety.maxPositionSize) {
    errors.push(`Trade size ${tradeDecision.quantity} exceeds max position size ${safety.maxPositionSize}`);
  }

  // Check leverage (if applicable)
  if (tradeDecision.leverage && tradeDecision.leverage > safety.maxLeverage) {
    errors.push(`Leverage ${tradeDecision.leverage} exceeds maximum ${safety.maxLeverage}`);
  }

  return {
    valid: errors.length === 0,
    errors
  };
}

/**
 * Check risk appetite
 */
async function checkRiskAppetite(sectorId, riskScore) {
  const rules = await loadRules(sectorId);
  const riskAppetite = rules.riskAppetite || 0.5;
  
  // Convert risk score (0-100) to normalized value (0-1)
  const normalizedRisk = riskScore / 100;
  
  // If risk score exceeds risk appetite threshold, reject
  // Higher risk appetite means can tolerate higher risk scores
  const threshold = 1 - riskAppetite; // Invert: high appetite = low threshold
  
  return normalizedRisk <= threshold;
}

/**
 * Get all rules for a sector
 */
async function getRules(sectorId) {
  return await loadRules(sectorId);
}

/**
 * Update rules for a sector
 */
async function updateRules(sectorId, updates) {
  const currentRules = await loadRules(sectorId);
  const updatedRules = { ...currentRules, ...updates };
  return await saveRules(sectorId, updatedRules);
}

module.exports = {
  loadRules,
  saveRules,
  validateTrade,
  checkRiskAppetite,
  getRules,
  updateRules,
  DEFAULT_RULES
};

