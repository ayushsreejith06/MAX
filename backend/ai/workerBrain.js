const { callLLM, isLlmEnabled } = require('./llmClient');
const { validateWorkerAgentProposal } = require('./agentSchemas');
const { validateLLMTradeAction, normalizeActionToUpper } = require('../types/llmAction');
const { buildDecisionPrompt } = require('./prompts/buildDecisionPrompt');
const { parseLLMTradeAction } = require('./parseLLMTradeAction');
const { normalizeLLMResponse } = require('./normalizeLLMResponse');

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
  const { sectorState, purpose, agentProfile } = params;
  const trendPercent = typeof sectorState.trendPercent === 'number'
    ? sectorState.trendPercent
    : parseTrendPercent(sectorState.trendDescriptor);

  return buildDecisionPrompt({
    sectorName: sectorState.sectorName,
    agentSpecialization: purpose ?? agentProfile.roleDescription,
    agentBrief: purpose ?? agentProfile.roleDescription,
    allowedSymbols: Array.isArray(sectorState.allowedSymbols) ? sectorState.allowedSymbols : [],
    remainingCapital: sectorState.balance,
    realTimeData: {
      recentPrice: sectorState.simulatedPrice,
      baselinePrice: sectorState.baselinePrice,
      trendPercent,
      volatility: sectorState.volatility,
      indicators: sectorState.indicators ?? {},
    },
  });
}

function mapTradeToWorkerProposal(trade, sectorState) {
  const allocationPercent =
    sectorState.balance && sectorState.balance > 0 ? Math.min(100, (trade.amount / sectorState.balance) * 100) : 0;

  return validateWorkerAgentProposal({
    action: trade.action,
    symbol: trade.symbol,
    allocationPercent,
    confidence: trade.confidence,
    reasoning: trade.reasoning,
  });
}

async function generateWorkerProposal(params) {
  // Guard early if LLM disabled to avoid throwing in callLLM
  if (!isLlmEnabled) {
    throw new Error('LLM disabled; cannot generate proposal');
  }

  try {
    const { systemPrompt, userPrompt, allowedSymbols } = buildPrompts(params);
    const rawResponse = await callLLM({
      systemPrompt,
      userPrompt,
      jsonMode: true
    });

    const priceContext = params.sectorState.simulatedPrice ?? params.sectorState.baselinePrice;
    const parsed = parseLLMTradeAction(rawResponse, {
      fallbackSector: params.sectorState.sectorName,
      fallbackSymbol: allowedSymbols[0],
      remainingCapital: params.sectorState.balance,
      currentPrice: priceContext,
    });
    const llmTrade = validateLLMTradeAction(parsed, {
      allowedSymbols,
      remainingCapital: params.sectorState.balance,
      fallbackSector: params.sectorState.sectorName,
      fallbackSymbol: allowedSymbols[0],
      currentPrice: priceContext,
    });

    if (params.sectorState.balance !== undefined && llmTrade.amount > params.sectorState.balance) {
      throw new Error('LLMTradeAction.amount exceeds available sector balance.');
    }

    // Normalize LLM response before checklist creation
    const normalized = normalizeLLMResponse(llmTrade, {
      sectorRiskProfile: params.sectorState.riskScore,
      lastConfidence: params.agentConfidence,
      allowedSymbols,
    });

    const trade = {
      action: normalized.actionType,
      amount: llmTrade.amount, // Keep original amount calculation
      confidence: normalized.confidence,
      reasoning: normalized.reasoning,
      symbol: normalized.symbol,
    };

    return mapTradeToWorkerProposal(trade, params.sectorState);
  } catch (error) {
    // Bubble up to let the discussion workflow handle invalid JSON/output.
    throw error;
  }
}

module.exports = {
  generateWorkerProposal
};

