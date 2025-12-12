import { callLLM } from '../../ai/llmClient';
import { buildDecisionPrompt } from '../../ai/prompts/buildDecisionPrompt';
import { parseLLMTradeAction } from '../../ai/parseLLMTradeAction';
import { normalizeActionToUpper, validateLLMTradeAction } from '../../types/llmAction';

type AllowedAction = 'BUY' | 'SELL' | 'HOLD' | 'REBALANCE';

export type ChecklistItem = {
  agentId: string;
  sectorId: string;
  type: AllowedAction;
  symbol: string;
  amount: number;
  confidence: number;
  reasoning: string;
  metadata: {
    stopLoss?: number;
    takeProfit?: number;
  };
};

type BuildChecklistTradeParams = {
  sector: { id: string; type?: string; symbol?: string; name?: string; allowedSymbols?: string[]; trendPercent?: number };
  sectorData: Record<string, unknown> | unknown;
  agent: { id: string; purpose?: string };
  availableBalance: number;
};

function clampAmount(amount: number, availableBalance: number): number {
  if (!Number.isFinite(amount) || amount <= 0) {
    throw new Error('LLM trade amount invalid or missing.');
  }
  const maxBalance = Math.max(availableBalance, 0);
  if (maxBalance === 0) {
    return 0;
  }
  const min = maxBalance * 0.01;
  const max = maxBalance * 0.2;
  return Math.min(Math.max(amount, min), Math.min(max, maxBalance));
}

export async function buildChecklistTrade(params: BuildChecklistTradeParams): Promise<ChecklistItem> {
  const { sector, sectorData, agent, availableBalance } = params;

  const allowedSymbols = Array.isArray(sector.allowedSymbols)
    ? sector.allowedSymbols
    : [sector.symbol, sector.name].filter((sym): sym is string => typeof sym === 'string' && sym.trim() !== '');

  const snapshot = (sectorData && typeof sectorData === 'object') ? sectorData as Record<string, unknown> : {};

  const { systemPrompt, userPrompt, allowedSymbols: normalizedSymbols } = buildDecisionPrompt({
    sectorName: sector.name || sector.symbol || 'UNKNOWN',
    agentSpecialization: agent.purpose || 'checklist reviewer',
    allowedSymbols,
    remainingCapital: availableBalance,
    realTimeData: {
      recentPrice: typeof (snapshot as any).currentPrice === 'number' ? (snapshot as any).currentPrice : undefined,
      baselinePrice: typeof (snapshot as any).baselinePrice === 'number' ? (snapshot as any).baselinePrice : undefined,
      trendPercent:
        typeof sector.trendPercent === 'number'
          ? sector.trendPercent
          : (typeof (snapshot as any).changePercent === 'number' ? (snapshot as any).changePercent : undefined),
      volatility: typeof (snapshot as any).volatility === 'number' ? (snapshot as any).volatility : undefined,
      indicators: snapshot,
    },
  });

  const llmResponseText = await callLLM({
    systemPrompt,
    userPrompt,
    jsonMode: true,
  });

  const parsed = parseLLMTradeAction(llmResponseText);
  const llmAction = validateLLMTradeAction(parsed, {
    allowedSymbols: normalizedSymbols,
    remainingCapital: availableBalance,
  });

  const type = normalizeActionToUpper(llmAction.action) as AllowedAction;
  const amount = clampAmount(llmAction.amount, availableBalance);
  const confidence = Math.min(Math.max(llmAction.confidence, 0), 100);
  const reasoning = llmAction.reasoning.trim();

  return {
    agentId: agent.id,
    sectorId: sector.id,
    type,
    symbol: llmAction.symbol,
    amount,
    confidence,
    reasoning,
    metadata: {
      stopLoss: llmAction.stopLoss,
      takeProfit: llmAction.takeProfit
    }
  };
}


