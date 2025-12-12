/**
 * Normalization layer for LLM responses before checklist creation.
 * 
 * Every agent LLM response must be transformed into this shape:
 * {
 *   actionType: "BUY" | "SELL" | "HOLD",
 *   symbol: string,
 *   allocationPercent: number | null,
 *   confidence: number,
 *   reasoning: string
 * }
 * 
 * If the LLM omits a field:
 * - allocationPercent defaults to sector risk profile
 * - confidence defaults to lastConfidence + delta (clamped 0–100)
 * 
 * Rejects malformed responses instead of silently failing.
 */

/**
 * Converts sector risk profile (0-100) to allocation percent (0-100).
 * Maps risk score to allocation:
 * - Low risk (0-33): 10-15%
 * - Medium risk (34-66): 15-25%
 * - High risk (67-100): 20-30%
 */
function riskProfileToAllocationPercent(riskProfile) {
  const clampedRisk = Math.max(0, Math.min(100, riskProfile));
  
  if (clampedRisk <= 33) {
    // Low risk: 10-15%
    return 10 + (clampedRisk / 33) * 5;
  } else if (clampedRisk <= 66) {
    // Medium risk: 15-25%
    return 15 + ((clampedRisk - 33) / 33) * 10;
  } else {
    // High risk: 20-30%
    return 20 + ((clampedRisk - 66) / 34) * 10;
  }
}

/**
 * Normalizes an LLM trade action response into the required shape.
 * 
 * @param {Object} llmResponse - The normalized LLM trade action from validateLLMTradeAction
 * @param {Object} options - Normalization options including defaults
 * @param {number} [options.sectorRiskProfile=50] - Sector risk profile (0-100) used to default allocationPercent if missing
 * @param {number} [options.lastConfidence=50] - Agent's last confidence value (0-100) used to default confidence if missing
 * @param {number} [options.confidenceDelta=2] - Delta to add to lastConfidence when defaulting confidence
 * @param {string[]} [options.allowedSymbols=[]] - Allowed symbols for validation
 * @returns {Object} Normalized agent response in the required shape
 * @throws {Error} If the response is malformed and cannot be normalized
 */
function normalizeLLMResponse(llmResponse, options = {}) {
  const {
    sectorRiskProfile = 50, // Default to medium risk
    lastConfidence = 50, // Default to medium confidence
    confidenceDelta = 2,
    allowedSymbols = [],
  } = options;

  // Validate required fields
  if (!llmResponse || typeof llmResponse !== 'object') {
    throw new Error('LLM response must be a valid object');
  }

  // Normalize actionType
  const side = llmResponse.side?.toUpperCase();
  if (!side || !['BUY', 'SELL', 'HOLD'].includes(side)) {
    throw new Error(
      `Invalid actionType: expected "BUY", "SELL", or "HOLD", got "${side}"`
    );
  }
  const actionType = side;

  // Normalize symbol
  if (!llmResponse.symbol || typeof llmResponse.symbol !== 'string') {
    throw new Error('LLM response is missing required symbol field');
  }
  const symbol = llmResponse.symbol.trim().toUpperCase();
  
  // Validate symbol is in allowed symbols if provided
  if (allowedSymbols.length > 0) {
    const normalizedAllowed = allowedSymbols.map(s => s.trim().toUpperCase());
    if (!normalizedAllowed.includes(symbol)) {
      throw new Error(
        `Symbol "${symbol}" is not in allowed symbols: ${allowedSymbols.join(', ')}`
      );
    }
  }

  // Normalize allocationPercent
  let allocationPercent;
  if (llmResponse.allocationPercent !== undefined && llmResponse.allocationPercent !== null) {
    const rawAllocation = llmResponse.allocationPercent;
    if (typeof rawAllocation !== 'number' || !Number.isFinite(rawAllocation)) {
      throw new Error(
        `Invalid allocationPercent: expected a number, got ${typeof rawAllocation}`
      );
    }
    // Clamp to 0-100
    allocationPercent = Math.max(0, Math.min(100, rawAllocation));
  } else {
    // Default to sector risk profile
    allocationPercent = riskProfileToAllocationPercent(sectorRiskProfile);
  }

  // Normalize confidence
  let confidence;
  if (llmResponse.confidence !== undefined && llmResponse.confidence !== null) {
    const rawConfidence = llmResponse.confidence;
    if (typeof rawConfidence !== 'number' || !Number.isFinite(rawConfidence)) {
      throw new Error(
        `Invalid confidence: expected a number, got ${typeof rawConfidence}`
      );
    }
    // Clamp to 0-100
    confidence = Math.max(0, Math.min(100, rawConfidence));
  } else {
    // Default to lastConfidence + delta (clamped 0-100)
    const defaultConfidence = lastConfidence + confidenceDelta;
    confidence = Math.max(0, Math.min(100, defaultConfidence));
  }

  // Normalize reasoning
  if (!llmResponse.reasoning || typeof llmResponse.reasoning !== 'string') {
    throw new Error('LLM response is missing required reasoning field');
  }
  const reasoning = llmResponse.reasoning.trim();
  if (reasoning.length === 0) {
    throw new Error('LLM response reasoning field cannot be empty');
  }

  return {
    actionType,
    symbol,
    allocationPercent,
    confidence,
    reasoning,
  };
}

/**
 * Validates that a normalized response matches the required shape.
 * This is a type guard and runtime validation.
 */
function validateNormalizedResponse(response) {
  if (!response || typeof response !== 'object') {
    return false;
  }

  const r = response;

  // Check actionType
  if (!['BUY', 'SELL', 'HOLD'].includes(r.actionType)) {
    return false;
  }

  // Check symbol
  if (typeof r.symbol !== 'string' || r.symbol.trim().length === 0) {
    return false;
  }

  // Check allocationPercent
  if (r.allocationPercent !== null && (typeof r.allocationPercent !== 'number' || !Number.isFinite(r.allocationPercent))) {
    return false;
  }
  if (typeof r.allocationPercent === 'number' && (r.allocationPercent < 0 || r.allocationPercent > 100)) {
    return false;
  }

  // Check confidence
  if (typeof r.confidence !== 'number' || !Number.isFinite(r.confidence)) {
    return false;
  }
  if (r.confidence < 0 || r.confidence > 100) {
    return false;
  }

  // Check reasoning
  if (typeof r.reasoning !== 'string' || r.reasoning.trim().length === 0) {
    return false;
  }

  return true;
}

module.exports = {
  normalizeLLMResponse,
  validateNormalizedResponse,
};

