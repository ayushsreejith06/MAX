import { callLLM } from './llmClient';
import {
  ManagerChecklistDecision,
  WorkerAgentProposal,
  validateManagerChecklistDecision,
} from './agentSchemas';
import { normalizeActionToUpper, validateLLMTradeAction } from '../types/llmAction';
import { buildDecisionPrompt } from './prompts/buildDecisionPrompt';
import { parseLLMTradeAction } from './parseLLMTradeAction';

type EvaluateChecklistItemParams = {
  managerProfile: {
    name: string;
    sectorGoal: string;
    riskTolerance: 'low' | 'medium' | 'high';
  };
  sectorState: {
    sectorName: string;
    sectorType: 'crypto' | 'equities' | 'forex' | 'commodities' | 'other';
    simulatedPrice: number;
    baselinePrice: number;
    volatility: number;
    trendDescriptor: string;
    balance?: number;
    indicators?: Record<string, number | string>;
    allowedSymbols?: string[];
    trendPercent?: number;
  };
  workerProposal: WorkerAgentProposal;
};

function parseTrendPercent(trendDescriptor?: string | number): number | undefined {
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

function buildPrompts(params: EvaluateChecklistItemParams) {
  const { sectorState, managerProfile, workerProposal } = params;
  const trendPercent = typeof sectorState.trendPercent === 'number'
    ? sectorState.trendPercent
    : parseTrendPercent(sectorState.trendDescriptor);

  return buildDecisionPrompt({
    sectorName: sectorState.sectorName,
    agentSpecialization: managerProfile.sectorGoal,
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

function mapTradeToDecision(
  trade: { action: WorkerAgentProposal['action']; amount: number; confidence: number; reasoning: string },
  sectorState: EvaluateChecklistItemParams['sectorState']
): ManagerChecklistDecision {
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

export async function evaluateChecklistItem(
  params: EvaluateChecklistItemParams,
): Promise<ManagerChecklistDecision> {
  const { workerProposal } = params;

  try {
    const { systemPrompt, userPrompt, allowedSymbols } = buildPrompts(params);
    const raw = await callLLM({
      systemPrompt,
      userPrompt,
      jsonMode: true,
    });

    const parsed = parseLLMTradeAction(raw);
    const llmTrade = validateLLMTradeAction(parsed, {
      allowedSymbols,
      remainingCapital: params.sectorState.balance,
    });

    if (params.sectorState.balance !== undefined && llmTrade.amount > params.sectorState.balance) {
      throw new Error('LLMTradeAction.amount exceeds sector balance.');
    }

    const confidence = llmTrade.confidence;
    const boundedConfidence = Math.min(Math.max(confidence, 0), 100);

    const trade = {
      action: normalizeActionToUpper(llmTrade.action) as WorkerAgentProposal['action'],
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

