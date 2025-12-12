import { callLLM } from './llmClient';
import {
  ManagerChecklistDecision,
  WorkerAgentProposal,
  validateManagerChecklistDecision,
} from './agentSchemas';
import { normalizeActionToUpper, validateLLMTradeAction } from '../types/llmAction';
import { buildDecisionPrompt } from './prompts/buildDecisionPrompt';
import { parseLLMTradeAction } from './parseLLMTradeAction';
import { normalizeLLMResponse } from './normalizeLLMResponse';
import { normalizeLLMDecision } from './normalizeLLMDecision';

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
    riskScore?: number; // Sector risk profile (0-100)
  };
  workerProposal: WorkerAgentProposal;
  managerConfidence?: number; // Manager's last confidence (0-100)
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
    
    let raw: string;
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

    // Check balance constraint
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
      action: normalized.actionType as WorkerAgentProposal['action'],
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
 * Defaults to APPROVAL unless there's a clear reason to reject (e.g., hard constraints).
 * Only reject if there's a good reason - otherwise approve to allow the proposal through.
 */
function createFallbackDecision(params: EvaluateChecklistItemParams): ManagerChecklistDecision {
  const { workerProposal } = params;
  
  // Default to approval unless there's a clear reason to reject
  // If the worker proposal is reasonable (has action, reasoning, confidence), approve it
  const hasValidProposal = workerProposal && 
    workerProposal.action && 
    workerProposal.reasoning && 
    workerProposal.confidence !== undefined;
  
  // Only reject if proposal is clearly invalid
  const shouldReject = !hasValidProposal || 
    (workerProposal.confidence !== undefined && workerProposal.confidence < 1) ||
    (workerProposal.action && ['HOLD', 'hold'].includes(workerProposal.action) && (!workerProposal.allocationPercent || workerProposal.allocationPercent === 0));
  
  return validateManagerChecklistDecision({
    approve: !shouldReject, // Approve by default unless proposal is clearly invalid
    editedAllocationPercent: workerProposal?.allocationPercent || 0,
    confidence: workerProposal?.confidence || 50, // Use worker's confidence if available
    reasoning: shouldReject 
      ? 'LLM evaluation failed and proposal appears invalid; rejecting.'
      : 'LLM evaluation failed but proposal appears valid; approving based on worker confidence.',
  });
}

