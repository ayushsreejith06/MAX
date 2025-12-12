import { callLLM } from '../ai/llmClient';
import { parseLLMTradeAction } from '../ai/parseLLMTradeAction';
import { normalizeActionToUpper, validateLLMTradeAction } from '../types/llmAction';
import { buildDecisionPrompt } from '../ai/prompts/buildDecisionPrompt';

type AllowedAction = 'BUY' | 'SELL' | 'HOLD' | 'REBALANCE';

export type AgentTrade = {
  action: AllowedAction;
  amount: number;
  symbol: string;
  sector: string;
  confidence?: number;
  reasoning?: string;
  stopLoss?: number;
  takeProfit?: number;
  sizingBasis?: 'fixed_units' | 'fixed_dollars' | 'percent_of_capital';
  size?: number;
  entryPrice?: number | null;
};

type AgentReasoningParams = {
  sector: { type?: string; symbol?: string; name?: string; allowedSymbols?: string[]; trendPercent?: number };
  sectorData: Record<string, unknown> | unknown;
  agent: { purpose?: string };
  availableBalance: number;
};

function buildPrompts(params: AgentReasoningParams) {
  const { sector, sectorData, agent, availableBalance } = params;
  const allowedSymbols = Array.isArray(sector.allowedSymbols)
    ? sector.allowedSymbols
    : [sector.symbol, sector.name].filter((sym): sym is string => typeof sym === 'string' && sym.trim() !== '');

  const snapshot = (sectorData && typeof sectorData === 'object') ? sectorData as Record<string, unknown> : {};

  return buildDecisionPrompt({
    sectorName: sector.symbol || sector.name || 'UNKNOWN',
    agentSpecialization: agent.purpose || 'trader',
    agentBrief: agent.purpose,
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
}

export async function generateAgentTrade(params: AgentReasoningParams): Promise<AgentTrade> {
  const { sector, sectorData, agent, availableBalance } = params;

  const snapshot = (sectorData && typeof sectorData === 'object') ? sectorData as Record<string, unknown> : {};
  const currentPrice =
    typeof (snapshot as any).currentPrice === 'number'
      ? (snapshot as any).currentPrice
      : (typeof (snapshot as any).baselinePrice === 'number' ? (snapshot as any).baselinePrice : undefined);

  const { systemPrompt, userPrompt, allowedSymbols } = buildPrompts(params);
  const llmResponse = await callLLM({
    systemPrompt,
    userPrompt,
    jsonMode: true,
    useDecisionSystemPrompt: true
  });

  const parsed = parseLLMTradeAction(llmResponse, {
    fallbackSector: sector.symbol || sector.name,
    fallbackSymbol: allowedSymbols[0],
    remainingCapital: availableBalance,
    currentPrice,
  });
  const trade = validateLLMTradeAction(parsed, {
    allowedSymbols,
    remainingCapital: availableBalance,
    fallbackSector: sector.symbol || sector.name,
    fallbackSymbol: allowedSymbols[0],
    currentPrice,
  });

  if (trade.amount > availableBalance) {
    throw new Error('LLMTradeAction.amount exceeds available balance.');
  }

  return {
    action: normalizeActionToUpper(trade.side),
    amount: trade.amount,
    symbol: trade.symbol,
    sector: trade.sector || (sector.symbol ?? sector.name ?? 'UNKNOWN'),
    confidence: trade.confidence,
    reasoning: trade.reasoning,
    stopLoss: trade.stopLoss,
    takeProfit: trade.takeProfit,
    sizingBasis: trade.sizingBasis,
    size: trade.size,
    entryPrice: trade.entryPrice,
  };
}


