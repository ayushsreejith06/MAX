import { NormalizedLLMTradeAction } from '../../types/llmAction';

export type SectorContext = {
  sectorCode: string; // e.g. "TECH", "CRYPTO"
  capital: number;
  volatility: number;
  trendPercent: number;
};

function clampPercentForVolatility(baseMax: number, volatility: number): number {
  if (!Number.isFinite(volatility) || volatility <= 0) {
    return baseMax;
  }
  if (volatility >= 0.6) {
    return 0.1; // very high vol → cap to 10%
  }
  if (volatility >= 0.3) {
    return 0.15; // high vol → cap to 15%
  }
  return baseMax;
}

export function applyTradeRules(ctx: SectorContext, raw: NormalizedLLMTradeAction): NormalizedLLMTradeAction {
  const capital = Math.max(Number.isFinite(ctx.capital) ? ctx.capital : 0, 0);
  const volatility = Math.max(Number.isFinite(ctx.volatility) ? ctx.volatility : 0, 0);
  const trendPercent = Number.isFinite(ctx.trendPercent) ? ctx.trendPercent : 0;

  const sanitizedAmount = Number.isFinite(raw.amount) ? Math.max(raw.amount, 0) : 0;

  if (String(raw.side).toUpperCase() === 'HOLD') {
    return { ...raw, amount: 0, size: 0 };
  }

  if (capital === 0) {
    return { ...raw, amount: sanitizedAmount };
  }

  const baseMaxPercent = 0.25;
  const maxPercent = clampPercentForVolatility(baseMaxPercent, volatility);
  const minPercent = 0.01;

  const rawPercent = Math.abs(sanitizedAmount) / capital;
  const clampedPercent = Math.min(Math.max(rawPercent, minPercent), maxPercent);
  const finalAmount = Number((clampedPercent * capital).toFixed(2));

  let finalSize = raw.size;
  if (raw.sizingBasis === 'percent_of_capital') {
    finalSize = Number((clampedPercent * 100).toFixed(2));
  } else if (raw.sizingBasis === 'fixed_dollars') {
    finalSize = finalAmount;
  }

  return {
    ...raw,
    amount: finalAmount,
    size: finalSize,
    reasoning:
      raw.reasoning ||
      `Rules normalized ${raw.side} sizing for ${ctx.sectorCode} (trend ${trendPercent.toFixed(2)}%).`,
  };
}


