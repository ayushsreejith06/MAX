export type LLMTradeSide = 'BUY' | 'SELL' | 'HOLD' | 'REBALANCE';
export type LLMTradeSideLower = 'buy' | 'sell' | 'hold' | 'rebalance';
export type LLMTradeSizingBasis = 'fixed_units' | 'fixed_dollars' | 'percent_of_capital';

export interface LLMTradeAction {
  sector: string;
  symbol: string;
  side: LLMTradeSide | LLMTradeSideLower;
  sizingBasis: LLMTradeSizingBasis;
  size: number;
  entryPrice?: number | null;
  stopLoss?: number | null;
  takeProfit?: number | null;
  reasoning: string;
  confidence: number; // REQUIRED: Must be provided by LLM (0-100)
  allocationPercent?: number; // Optional: Percentage of capital to allocate (0-100)
  riskNotes?: string; // Optional: Risk assessment notes
}

export interface NormalizedLLMTradeAction extends LLMTradeAction {
  side: LLMTradeSide;
  sizingBasis: LLMTradeSizingBasis;
  size: number;
  symbol: string;
  sector: string;
  entryPrice: number | null;
  stopLoss: number | null;
  takeProfit: number | null;
  reasoning: string;
  confidence: number; // REQUIRED
  action: LLMTradeSideLower;
  amount: number;
  allocationPercent?: number; // Optional: Percentage of capital to allocate (0-100)
  riskNotes?: string; // Optional: Risk assessment notes
}

export type ValidateLLMTradeActionOptions = {
  allowedSymbols?: string[];
  remainingCapital?: number;
  fallbackSector?: string;
  fallbackSymbol?: string;
  currentPrice?: number;
};

export const ALLOWED_LLM_SIDES: ReadonlyArray<LLMTradeSide> = ['BUY', 'SELL', 'HOLD', 'REBALANCE'] as const;
const ALLOWED_LLM_SIDES_LOWER: ReadonlyArray<LLMTradeSideLower> = ['buy', 'sell', 'hold', 'rebalance'] as const;
export const ALLOWED_LLM_SIZING_BASES: ReadonlyArray<LLMTradeSizingBasis> = [
  'fixed_units',
  'fixed_dollars',
  'percent_of_capital',
] as const;

function ensureNumber(value: unknown, fallback: number): number {
  if (typeof value !== 'number' || Number.isNaN(value) || !Number.isFinite(value)) {
    return fallback;
  }
  return value;
}

function toNumberOrNull(value: unknown): number | null {
  if (value === null || value === undefined) return null;
  if (typeof value !== 'number' || Number.isNaN(value) || !Number.isFinite(value)) return null;
  return value;
}

function normalizeAllowedSymbols(symbols: string[], fallback: string): string[] {
  const normalized = [...(symbols || []), fallback]
    .map((sym) => (typeof sym === 'string' ? sym.trim().toUpperCase() : ''))
    .filter(Boolean);

  return Array.from(new Set(normalized.length > 0 ? normalized : [fallback]));
}

function normalizeSide(raw: unknown): { upper: LLMTradeSide; lower: LLMTradeSideLower } {
  const value = typeof raw === 'string' ? raw.trim().toUpperCase() : '';
  if (ALLOWED_LLM_SIDES.includes(value as LLMTradeSide)) {
    return { upper: value as LLMTradeSide, lower: value.toLowerCase() as LLMTradeSideLower };
  }

  return { upper: 'HOLD', lower: 'hold' };
}

function normalizeSizingBasis(raw: unknown): LLMTradeSizingBasis {
  const value = typeof raw === 'string' ? raw.trim().toLowerCase() : '';
  if (ALLOWED_LLM_SIZING_BASES.includes(value as LLMTradeSizingBasis)) {
    return value as LLMTradeSizingBasis;
  }
  return 'percent_of_capital';
}

function clampSize(size: number, remainingCapital?: number): number {
  const max = remainingCapital && remainingCapital > 0 ? remainingCapital * 2 : 1_000_000;
  if (size <= 0) return 0;
  return Math.min(size, max);
}

function clampPercentSize(size: number): number {
  if (size <= 0) return 0;
  if (size > 100) return 100;
  return size;
}

function resolveAmountFromSizing(
  size: number,
  sizingBasis: LLMTradeSizingBasis,
  remainingCapital?: number,
  currentPrice?: number,
): number {
  if (size <= 0) return 0;
  if (sizingBasis === 'percent_of_capital') {
    if (remainingCapital && remainingCapital > 0) {
      return (remainingCapital * clampPercentSize(size)) / 100;
    }
    return size; // fall back to treating percent as raw size when capital is unknown
  }

  if (sizingBasis === 'fixed_dollars') {
    const boundedSize = clampSize(size, remainingCapital);
    return remainingCapital ? Math.min(boundedSize, remainingCapital) : boundedSize;
  }

  // fixed_units
  if (currentPrice && currentPrice > 0) {
    const unitsCost = size * currentPrice;
    return remainingCapital ? Math.min(unitsCost, remainingCapital) : unitsCost;
  }

  return clampSize(size, remainingCapital);
}

export function validateLLMTradeAction(
  raw: unknown,
  options?: ValidateLLMTradeActionOptions,
): NormalizedLLMTradeAction {
  if (raw === null || typeof raw !== 'object' || Array.isArray(raw)) {
    throw new Error('LLMTradeAction must be a JSON object.');
  }

  const record = raw as Record<string, unknown>;

  // Support both "action" (new schema) and "side" (legacy) for backward compatibility
  const { upper: side, lower: action } = normalizeSide(record.action ?? record.side);
  const sizingBasis = normalizeSizingBasis(record.sizingBasis ?? record.sizing_basis ?? record.sizingbasis);
  const hasRemainingCapital = typeof options?.remainingCapital === 'number' && options.remainingCapital > 0;
  const sizeRaw = ensureNumber(
    record.size ?? record.amount ?? record.quantity,
    hasRemainingCapital ? options!.remainingCapital! * 0.01 : 0,
  );
  const size =
    sizingBasis === 'percent_of_capital'
      ? clampPercentSize(sizeRaw)
      : clampSize(sizeRaw, options?.remainingCapital);

  const reasoning =
    typeof record.reasoning === 'string' && record.reasoning.trim().length > 0
      ? record.reasoning.trim()
      : 'LLM did not provide reasoning';

  // CRITICAL: Confidence is REQUIRED - reject if missing or invalid
  const rawConfidence = record.confidence;
  if (rawConfidence === undefined || rawConfidence === null) {
    throw new Error('LLMTradeAction is missing required confidence field. Confidence must be a number between 0-100.');
  }
  
  const confidenceValue = ensureNumber(rawConfidence, NaN);
  if (Number.isNaN(confidenceValue)) {
    throw new Error('LLMTradeAction has invalid confidence value. Confidence must be a number between 0-100.');
  }
  
  const confidence = Math.min(Math.max(confidenceValue, 0), 100);

  const fallbackSymbol = options?.fallbackSymbol || options?.fallbackSector || 'UNKNOWN';
  const symbol =
    typeof record.symbol === 'string' && record.symbol.trim() !== ''
      ? record.symbol.trim().toUpperCase()
      : fallbackSymbol.toUpperCase();

  const sector =
    typeof record.sector === 'string' && record.sector.trim() !== ''
      ? record.sector.trim()
      : options?.fallbackSector || symbol;

  const allowedSymbols = normalizeAllowedSymbols(options?.allowedSymbols ?? [], symbol);
  if (!allowedSymbols.includes(symbol)) {
    throw new Error(`LLMTradeAction.symbol must be one of: ${allowedSymbols.join(', ')}.`);
  }

  const stopLoss = toNumberOrNull(record.stopLoss ?? record.stop_loss);
  const takeProfit = toNumberOrNull(record.takeProfit ?? record.take_profit);
  const entryPrice = toNumberOrNull(record.entryPrice ?? record.entry_price ?? record.price);

  const amount = resolveAmountFromSizing(size, sizingBasis, options?.remainingCapital, options?.currentPrice);

  // Extract new fields (allocation_percent, risk_notes) if present
  const allocationPercent = toNumberOrNull(record.allocation_percent ?? record.allocationPercent);
  const riskNotes = typeof record.risk_notes === 'string' 
    ? record.risk_notes.trim() 
    : typeof record.riskNotes === 'string'
      ? record.riskNotes.trim()
      : undefined;

  return {
    side,
    action,
    sizingBasis,
    size,
    amount,
    symbol,
    sector,
    entryPrice,
    stopLoss,
    takeProfit,
    reasoning,
    confidence,
    allocationPercent: allocationPercent ?? undefined,
    riskNotes: riskNotes,
  };
}

export function normalizeActionToUpper(action: LLMTradeSide | LLMTradeSideLower): LLMTradeSide {
  const normalized = typeof action === 'string' ? action.trim().toUpperCase() : '';
  if (ALLOWED_LLM_SIDES.includes(normalized as LLMTradeSide)) {
    return normalized as LLMTradeSide;
  }
  return 'HOLD';
}

