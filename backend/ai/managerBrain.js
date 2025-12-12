const { callLLM, isLlmEnabled } = require('./llmClient');
const { validateManagerChecklistDecision } = require('./agentSchemas');
const { validateLLMTradeAction, normalizeActionToUpper } = require('../types/llmAction');
const { buildDecisionPrompt } = require('./prompts/buildDecisionPrompt');
const { parseLLMTradeAction } = require('./parseLLMTradeAction');

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

  // Skip LLM call if disabled
  if (!isLlmEnabled) {
    throw new Error('LLM disabled; cannot evaluate checklist item');
  }

  try {
    const { systemPrompt, userPrompt, allowedSymbols } = buildPrompts(params);
    const raw = await callLLM({
      systemPrompt,
      userPrompt,
      jsonMode: true,
    });

    const priceContext = params.sectorState.simulatedPrice ?? params.sectorState.baselinePrice;
    const parsed = parseLLMTradeAction(raw, {
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
      throw new Error('LLMTradeAction.amount exceeds sector balance.');
    }

    const confidence = llmTrade.confidence;
    const boundedConfidence = Math.min(Math.max(confidence, 0), 100);

    const trade = {
      action: normalizeActionToUpper(llmTrade.side),
      amount: llmTrade.amount,
      confidence: boundedConfidence,
      reasoning: llmTrade.reasoning,
    };

    return mapTradeToDecision(trade, params.sectorState);
  } catch (error) {
    console.error('[managerBrain] Invalid JSON or LLM error:', error);
    // Bubble up to allow the discussion workflow to handle invalid output.
    throw error;
  }
}

module.exports = {
  evaluateChecklistItem,
};

