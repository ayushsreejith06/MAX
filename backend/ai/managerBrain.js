const { callLLM, isLlmEnabled } = require('./llmClient');
const { validateManagerChecklistDecision } = require('./agentSchemas');
const { validateLLMTradeAction, normalizeActionToUpper } = require('../types/llmAction');
const { buildDecisionPrompt } = require('./prompts/buildDecisionPrompt');
const { parseLLMTradeAction } = require('./parseLLMTradeAction');
const { normalizeLLMResponse } = require('./normalizeLLMResponse');
const { normalizeLLMDecision } = require('./normalizeLLMDecision');

function parseTrendPercent(trendDescriptor) {
  if (typeof trendDescriptor === 'number' && Number.isFinite(trendDescriptor)) {
    return trendDescriptor;
  }
  if (typeof trendDescriptor === 'string') {
    const match = trendDescriptor.match(/-?\d+(\.\d+)?/);
    if (match) {
      const parsed = Number(match[0]);
      if (Number.isFinite(parsed)) {
        return parsed;
      }
    }
  }
  return undefined;
}

function buildPrompts(params) {
  const { sectorState, managerProfile, workerProposal } = params;
  const trendPercent = typeof sectorState.trendPercent === 'number'
    ? sectorState.trendPercent
    : parseTrendPercent(sectorState.trendDescriptor);

  return buildDecisionPrompt({
    sectorName: sectorState.sectorName,
    agentSpecialization: managerProfile.sectorGoal,
    agentBrief: managerProfile.sectorGoal,
    allowedSymbols: Array.isArray(sectorState.allowedSymbols) ? sectorState.allowedSymbols : [],
    remainingCapital: sectorState.balance,
    realTimeData: {
      recentPrice: sectorState.simulatedPrice,
      baselinePrice: sectorState.baselinePrice,
      trendPercent,
      volatility: sectorState.volatility,
      indicators: {
        ...(sectorState.indicators ?? {}),
        workerProposal,
      },
    },
  });
}

function mapTradeToDecision(trade, sectorState) {
  const editedAllocationPercent =
    sectorState.balance && sectorState.balance > 0 ? Math.min(100, (trade.amount / sectorState.balance) * 100) : 0;

  const approve = trade.action !== 'HOLD' && trade.amount > 0;

  return validateManagerChecklistDecision({
    approve,
    editedAllocationPercent,
    confidence: trade.confidence,
    reasoning: trade.reasoning,
  });
}

async function evaluateChecklistItem(params) {
  const { workerProposal } = params;

  // Skip LLM call if disabled - return fallback decision instead of throwing
  if (!isLlmEnabled) {
    console.warn('[managerBrain] LLM disabled; returning fallback decision');
    return createFallbackDecision(params);
  }

  try {
    const { systemPrompt, userPrompt, allowedSymbols } = buildPrompts(params);
    
    let raw;
    try {
      raw = await callLLM({
        systemPrompt,
        userPrompt,
        jsonMode: true,
      });
    } catch (llmError) {
      // LLM call failed - return fallback decision
      console.error('[managerBrain] LLM call failed:', llmError);
      return createFallbackDecision(params);
    }

    const priceContext = params.sectorState.simulatedPrice ?? params.sectorState.baselinePrice;
    
    let parsed;
    try {
      parsed = parseLLMTradeAction(raw, {
        fallbackSector: params.sectorState.sectorName,
        fallbackSymbol: allowedSymbols[0],
        remainingCapital: params.sectorState.balance,
        currentPrice: priceContext,
      });
    } catch (parseError) {
      // Parse failed - return fallback decision
      console.error('[managerBrain] Failed to parse LLM trade action:', parseError);
      return createFallbackDecision(params);
    }

    let llmTrade;
    try {
      llmTrade = validateLLMTradeAction(parsed, {
        allowedSymbols,
        remainingCapital: params.sectorState.balance,
        fallbackSector: params.sectorState.sectorName,
        fallbackSymbol: allowedSymbols[0],
        currentPrice: priceContext,
      });
    } catch (validationError) {
      // Validation failed - return fallback decision
      console.error('[managerBrain] Failed to validate LLM trade action:', validationError);
      return createFallbackDecision(params);
    }

    // Check balance constraint - clamp instead of throwing
    if (params.sectorState.balance !== undefined && llmTrade.amount > params.sectorState.balance) {
      console.warn('[managerBrain] LLMTradeAction.amount exceeds sector balance, clamping amount');
      llmTrade.amount = params.sectorState.balance;
    }

    // Normalize LLM response before checklist creation
    let normalized;
    try {
      normalized = normalizeLLMResponse(llmTrade, {
        sectorRiskProfile: params.sectorState.riskScore,
        lastConfidence: params.managerConfidence,
        allowedSymbols,
      });
    } catch (normalizeError) {
      // Normalization failed - use normalizeLLMDecision as fallback
      console.error('[managerBrain] Failed to normalize LLM response:', normalizeError);
      const fallbackNormalized = normalizeLLMDecision(llmTrade, 'LLM output could not be normalized; defaulting to conservative HOLD position.');
      normalized = {
        actionType: fallbackNormalized.action,
        symbol: llmTrade.symbol || allowedSymbols[0] || 'UNKNOWN',
        allocationPercent: fallbackNormalized.allocationPercent,
        confidence: fallbackNormalized.confidence,
        reasoning: fallbackNormalized.reasoning,
      };
    }

    const trade = {
      action: normalized.actionType,
      amount: llmTrade.amount, // Keep original amount calculation
      confidence: normalized.confidence,
      reasoning: normalized.reasoning,
    };

    return mapTradeToDecision(trade, params.sectorState);
  } catch (error) {
    // Any other error - return fallback decision (non-blocking behavior)
    console.error('[managerBrain] Unexpected error:', error);
    return createFallbackDecision(params);
  }
}

/**
 * Creates a fallback manager decision when LLM parsing fails.
 * Returns a conservative HOLD decision to ensure the discussion lifecycle continues.
 */
function createFallbackDecision(params) {
  return validateManagerChecklistDecision({
    approve: false, // Don't approve on parse failure
    editedAllocationPercent: 0,
    confidence: 1, // Minimum confidence
    reasoning: 'LLM output could not be parsed; defaulting to conservative HOLD position.',
  });
}

module.exports = {
  evaluateChecklistItem,
};

