import { LLMTradeAction, LLMTradeSide, LLMTradeSizingBasis } from './types/LLMTradeAction';

export type ParseLLMTradeActionOptions = {
  fallbackSector?: string;
  fallbackSymbol?: string;
  remainingCapital?: number;
  currentPrice?: number;
};

const ALLOWED_SIDES: ReadonlyArray<LLMTradeSide> = ['BUY', 'SELL', 'HOLD', 'REBALANCE'];
const ALLOWED_SIZING_BASES: ReadonlyArray<LLMTradeSizingBasis> = [
  'fixed_units',
  'fixed_dollars',
  'percent_of_capital',
];

function fallbackAction(options?: ParseLLMTradeActionOptions): LLMTradeAction & { confidence: number } {
  const sector = options?.fallbackSector || options?.fallbackSymbol || 'UNKNOWN';
  const symbol = options?.fallbackSymbol || sector || 'UNKNOWN';
  return {
    sector,
    symbol,
    side: 'HOLD',
    sizingBasis: 'percent_of_capital',
    size: 0,
    entryPrice: null,
    stopLoss: null,
    takeProfit: null,
    reasoning: 'LLM output could not be parsed; defaulting to HOLD.',
    confidence: 50,
  };
}

function normalizeSide(raw: unknown): LLMTradeSide {
  const value = typeof raw === 'string' ? raw.trim().toUpperCase() : '';
  return ALLOWED_SIDES.includes(value as LLMTradeSide) ? (value as LLMTradeSide) : 'HOLD';
}

function normalizeSizingBasis(raw: unknown): LLMTradeSizingBasis {
  const value = typeof raw === 'string' ? raw.trim().toLowerCase() : '';
  return ALLOWED_SIZING_BASES.includes(value as LLMTradeSizingBasis)
    ? (value as LLMTradeSizingBasis)
    : 'percent_of_capital';
}

function parseNumber(value: unknown): number | null {
  if (typeof value !== 'number' || Number.isNaN(value) || !Number.isFinite(value)) {
    return null;
  }
  return value;
}

function clampSize(size: number, sizingBasis: LLMTradeSizingBasis, remainingCapital?: number): number {
  if (!Number.isFinite(size) || size < 0) return 0;

  if (sizingBasis === 'percent_of_capital') {
    if (size > 100) return 100;
    return size;
  }

  const max = remainingCapital && remainingCapital > 0 ? remainingCapital * 2 : 1_000_000;
  return Math.min(size, max);
}

export function parseLLMTradeAction(
  rawText: string,
  options?: ParseLLMTradeActionOptions,
): (LLMTradeAction & { confidence: number }) {
  if (typeof rawText !== 'string' || rawText.trim() === '') {
    console.error('[LLM_PARSE_ERROR] Empty response from LLM');
    return fallbackAction(options);
  }

  const cleaned = rawText
    .replace(/```json/gi, '')
    .replace(/```/g, '')
    .trim();

  let json: Record<string, unknown>;
  try {
    json = JSON.parse(cleaned);
  } catch (error) {
    console.error('[LLM_PARSE_ERROR] Failed to parse LLM JSON', { rawText, error });
    return fallbackAction(options);
  }

  // Support both "action" (new schema) and "side" (legacy) for backward compatibility
  const side = normalizeSide(json.action ?? json.side ?? json.tradeAction ?? json.actionType);
  const sizingBasis = normalizeSizingBasis(json.sizingBasis ?? json.sizing_basis ?? json.sizingbasis);

  const size = clampSize(
    typeof json.size === 'number'
      ? json.size
      : typeof (json as any).amount === 'number'
        ? (json as any).amount
        : typeof (json as any).quantity === 'number'
          ? (json as any).quantity
          : 0,
    sizingBasis,
    options?.remainingCapital,
  );

  const symbol =
    typeof json.symbol === 'string' && json.symbol.trim() !== ''
      ? json.symbol.trim().toUpperCase()
      : (options?.fallbackSymbol || options?.fallbackSector || 'UNKNOWN').toUpperCase();

  const sector =
    typeof json.sector === 'string' && json.sector.trim() !== ''
      ? json.sector.trim()
      : options?.fallbackSector || symbol;

  const entryPrice =
    parseNumber((json as any).entryPrice ?? (json as any).entry_price ?? (json as any).price) ??
    (options?.currentPrice ?? null);
  const stopLoss = parseNumber((json as any).stopLoss ?? (json as any).stop_loss);
  const takeProfit = parseNumber((json as any).takeProfit ?? (json as any).take_profit);

  const reasoning =
    typeof json.reasoning === 'string' && json.reasoning.trim().length > 0
      ? json.reasoning.trim()
      : 'LLM did not provide reasoning';

  // CRITICAL: Confidence is REQUIRED - reject if missing or invalid
  const rawConfidence = (json as any).confidence;
  if (rawConfidence === undefined || rawConfidence === null) {
    console.error('[LLM_PARSE_ERROR] Missing required confidence field', { json });
    throw new Error('LLM response is missing required confidence field. Confidence must be a number between 0-100.');
  }
  
  const confidenceValue = parseNumber(rawConfidence);
  if (confidenceValue === null) {
    console.error('[LLM_PARSE_ERROR] Invalid confidence value (must be numeric)', { json, rawConfidence });
    throw new Error('LLM response has invalid confidence value. Confidence must be a number between 0-100.');
  }
  
  const confidence = Math.min(Math.max(confidenceValue, 0), 100);

  // Extract new fields (allocation_percent, risk_notes) if present
  const allocationPercent = parseNumber((json as any).allocation_percent ?? (json as any).allocationPercent);
  const riskNotes = typeof (json as any).risk_notes === 'string' 
    ? (json as any).risk_notes.trim() 
    : typeof (json as any).riskNotes === 'string'
      ? (json as any).riskNotes.trim()
      : undefined;

  return {
    sector,
    symbol,
    side,
    sizingBasis,
    size,
    entryPrice,
    stopLoss,
    takeProfit,
    reasoning,
    confidence,
    allocationPercent: allocationPercent ?? undefined,
    riskNotes: riskNotes,
  };
}

export function demoParseLLMTradeAction() {
  const sample = JSON.stringify({
    sector: 'TECH',
    symbol: 'NVDA',
    side: 'BUY',
    sizingBasis: 'percent_of_capital',
    size: 10,
    entryPrice: 100,
    stopLoss: 95,
    takeProfit: 115,
    reasoning: 'Momentum with controlled risk.',
  });

  return parseLLMTradeAction(sample, { fallbackSector: 'TECH', fallbackSymbol: 'NVDA', remainingCapital: 10000 });
}

