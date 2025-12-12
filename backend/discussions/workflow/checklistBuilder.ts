import { callLLM } from '../../ai/llmClient';
import { buildDecisionPrompt } from '../../ai/prompts/buildDecisionPrompt';
import { parseLLMTradeAction } from '../../ai/parseLLMTradeAction';
import { applyTradeRules, SectorContext } from './tradeRules';
import { normalizeActionToUpper, validateLLMTradeAction } from '../../types/llmAction';

type AllowedAction = 'BUY' | 'SELL' | 'HOLD' | 'REBALANCE';

export type ChecklistItem = {
  agentId: string;
  sectorId: string;
  action?: AllowedAction;
  type: AllowedAction;
  symbol: string;
  amount: number;
  confidence: number;
  reasoning: string;
  description: string;
  sizingBasis: 'fixed_units' | 'fixed_dollars' | 'percent_of_capital';
  size: number;
  entryPrice?: number | null;
  metadata: {
    stopLoss?: number;
    takeProfit?: number;
  };
};

type BuildChecklistTradeParams = {
  sector: {
    id: string;
    type?: string;
    symbol?: string;
    name?: string;
    allowedSymbols?: string[];
    trendPercent?: number;
  };
  sectorData: Record<string, unknown> | unknown;
  agent: { id: string; purpose?: string };
  availableBalance: number;
};

function clampAmount(amount: number, availableBalance: number): number {
  if (!Number.isFinite(amount) || amount < 0) {
    throw new Error('LLM trade amount invalid or missing.');
  }
  const maxBalance = Math.max(availableBalance, 0);
  if (maxBalance === 0) {
    return 0;
  }
  return Math.min(amount, maxBalance);
}

function formatDescription(
  action: ReturnType<typeof validateLLMTradeAction>,
  type: AllowedAction,
  entryPrice: number | null,
  reasoning: string,
): string {
  const sizingDescription =
    action.sizingBasis === 'percent_of_capital'
      ? `${action.size}% of capital`
      : action.sizingBasis === 'fixed_dollars'
        ? `$${action.size}`
        : `${action.size} units`;

  const pricePart = entryPrice && entryPrice > 0 ? ` @ $${entryPrice}` : '';
  const stopPart = action.stopLoss ? `, SL ${action.stopLoss}` : '';
  const takeProfitPart = action.takeProfit ? `, TP ${action.takeProfit}` : '';

  return `${type} ${sizingDescription} ${action.symbol}${pricePart}${stopPart}${takeProfitPart}, because ${reasoning}`;
}

export async function buildChecklistTrade(params: BuildChecklistTradeParams): Promise<ChecklistItem> {
  const { sector, sectorData, agent, availableBalance } = params;

  const allowedSymbols = Array.isArray(sector.allowedSymbols)
    ? sector.allowedSymbols
    : [sector.symbol, sector.name].filter((sym): sym is string => typeof sym === 'string' && sym.trim() !== '');

  const snapshot = sectorData && typeof sectorData === 'object' ? (sectorData as Record<string, unknown>) : {};
  const currentPrice =
    typeof (snapshot as any).currentPrice === 'number'
      ? (snapshot as any).currentPrice
      : (typeof (snapshot as any).baselinePrice === 'number' ? (snapshot as any).baselinePrice : undefined);

  const { systemPrompt, userPrompt, allowedSymbols: normalizedSymbols } = buildDecisionPrompt({
    sectorName: sector.name || sector.symbol || 'UNKNOWN',
    agentSpecialization: agent.purpose || 'checklist reviewer',
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
      recentPnLPercent: typeof (snapshot as any).recentPnLPercent === 'number' ? (snapshot as any).recentPnLPercent : undefined,
      indicators: snapshot,
    },
  });

  const llmResponseText = await callLLM({
    systemPrompt,
    userPrompt,
    jsonMode: true,
  });

  const parsed = parseLLMTradeAction(llmResponseText, {
    fallbackSector: sector.symbol || sector.name,
    fallbackSymbol: normalizedSymbols[0],
    remainingCapital: availableBalance,
    currentPrice,
  });

  let llmAction;
  try {
    llmAction = validateLLMTradeAction(parsed, {
      allowedSymbols: normalizedSymbols,
      remainingCapital: availableBalance,
      fallbackSector: sector.symbol || sector.name,
      fallbackSymbol: normalizedSymbols[0],
      currentPrice,
    });
  } catch (error) {
    console.error('[LLM_PARSE_ERROR] Invalid LLM trade action, defaulting to HOLD', { error });
    llmAction = validateLLMTradeAction(
      {
        sector: sector.symbol || sector.name || 'UNKNOWN',
        symbol: normalizedSymbols[0] || sector.symbol || sector.name || 'UNKNOWN',
        side: 'HOLD',
        sizingBasis: 'percent_of_capital',
        size: 0,
        reasoning: 'Fallback HOLD after parse error.',
        confidence: 0,
      },
      {
        allowedSymbols: normalizedSymbols.length > 0 ? normalizedSymbols : [sector.symbol || sector.name || 'UNKNOWN'],
        remainingCapital: availableBalance,
        fallbackSector: sector.symbol || sector.name || 'UNKNOWN',
        fallbackSymbol: normalizedSymbols[0] || sector.symbol || sector.name || 'UNKNOWN',
        currentPrice,
      },
    );
  }

  const sectorContext: SectorContext = {
    sectorCode: sector.type || sector.symbol || sector.name || 'UNKNOWN',
    capital: availableBalance,
    volatility: typeof (snapshot as any).volatility === 'number' ? (snapshot as any).volatility : 0,
    trendPercent:
      typeof sector.trendPercent === 'number'
        ? sector.trendPercent
        : typeof (snapshot as any).changePercent === 'number'
          ? (snapshot as any).changePercent
          : 0,
  };

  const adjustedAction = applyTradeRules(sectorContext, llmAction);

  const type = normalizeActionToUpper(adjustedAction.side) as AllowedAction;
  const amount = clampAmount(adjustedAction.amount, availableBalance);
  const confidence = Math.min(Math.max(adjustedAction.confidence, 0), 100);
  const reasoning = (adjustedAction.reasoning || llmAction.reasoning || '').trim();
  const entryPrice = adjustedAction.entryPrice ?? currentPrice ?? null;

  const description = formatDescription(adjustedAction, type, entryPrice, reasoning);

  return {
    agentId: agent.id,
    sectorId: sector.id,
    action: type,
    type,
    symbol: adjustedAction.symbol,
    amount,
    confidence,
    reasoning,
    description,
    sizingBasis: adjustedAction.sizingBasis,
    size: adjustedAction.size,
    entryPrice,
    metadata: {
      stopLoss: adjustedAction.stopLoss ?? undefined,
      takeProfit: adjustedAction.takeProfit ?? undefined
    }
  };
}

export function demoChecklistItemFromSample(): ChecklistItem {
  const sampleCapital = 10_000;
  const sample = JSON.stringify({
    sector: 'TECH',
    symbol: 'NVDA',
    side: 'BUY',
    sizingBasis: 'percent_of_capital',
    size: 5,
    entryPrice: 100,
    stopLoss: 95,
    takeProfit: 115,
    reasoning: 'Strong momentum with moderate volatility.',
  });

  const parsed = parseLLMTradeAction(sample, {
    fallbackSector: 'TECH',
    fallbackSymbol: 'NVDA',
    remainingCapital: sampleCapital,
    currentPrice: 100,
  });

  const validated = validateLLMTradeAction(parsed, {
    allowedSymbols: ['NVDA'],
    remainingCapital: sampleCapital,
    fallbackSector: 'TECH',
    fallbackSymbol: 'NVDA',
    currentPrice: 100,
  });

  const adjusted = applyTradeRules(
    {
      sectorCode: 'TECH',
      capital: sampleCapital,
      volatility: 0.2,
      trendPercent: 8,
    },
    validated,
  );

  const type = normalizeActionToUpper(adjusted.side) as AllowedAction;
  const amount = clampAmount(adjusted.amount, sampleCapital);
  const confidence = Math.min(Math.max(adjusted.confidence, 0), 100);
  const reasoning = adjusted.reasoning.trim();
  const entryPrice = adjusted.entryPrice ?? 100;
  const description = formatDescription(adjusted, type, entryPrice, reasoning);

  return {
    agentId: 'demo-agent',
    sectorId: 'demo-sector',
    action: type,
    type,
    symbol: adjusted.symbol,
    amount,
    confidence,
    reasoning,
    description,
    sizingBasis: adjusted.sizingBasis,
    size: adjusted.size,
    entryPrice,
    metadata: {
      stopLoss: adjusted.stopLoss ?? undefined,
      takeProfit: adjusted.takeProfit ?? undefined,
    },
  };
}


