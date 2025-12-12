import { callLLM } from './llmClient';
import { validateWorkerAgentProposal, WorkerAgentProposal } from './agentSchemas';
import { normalizeActionToUpper, validateLLMTradeAction } from '../types/llmAction';
import { buildDecisionPrompt } from './prompts/buildDecisionPrompt';
import { parseLLMTradeAction } from './parseLLMTradeAction';
import { normalizeLLMResponse } from './normalizeLLMResponse';

type SectorType = 'crypto' | 'equities' | 'forex' | 'commodities' | 'other';

type GenerateWorkerProposalParams = {
  agentProfile: {
    name: string;
    roleDescription: string;
  };
  sectorState: {
    sectorName: string;
    sectorType: SectorType;
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
  purpose?: string;
  agentConfidence?: number; // Agent's last confidence (0-100)
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

function buildPrompts(params: GenerateWorkerProposalParams) {
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

function mapTradeToWorkerProposal(
  trade: {
    action: WorkerAgentProposal['action'];
    amount: number;
    confidence: number;
    reasoning: string;
    symbol: string;
  },
  sectorState: GenerateWorkerProposalParams['sectorState']
): WorkerAgentProposal {
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

export async function generateWorkerProposal(
  params: GenerateWorkerProposalParams
): Promise<WorkerAgentProposal> {
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
      action: normalized.actionType as WorkerAgentProposal['action'],
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
