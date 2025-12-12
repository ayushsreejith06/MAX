const ALLOWED_LLM_SIDES = ['BUY', 'SELL', 'HOLD', 'REBALANCE'];
const ALLOWED_LLM_SIDES_LOWER = ['buy', 'sell', 'hold', 'rebalance'];
const ALLOWED_LLM_SIZING_BASES = ['fixed_units', 'fixed_dollars', 'percent_of_capital'];

function ensureNumber(value, fallback) {
  if (typeof value !== 'number' || Number.isNaN(value) || !Number.isFinite(value)) {
    return fallback;
  }
  return value;
}

function toNumberOrNull(value) {
  if (value === null || value === undefined) return null;
  if (typeof value !== 'number' || Number.isNaN(value) || !Number.isFinite(value)) return null;
  return value;
}

function normalizeAllowedSymbols(symbols, fallback) {
  const normalized = [...(symbols || []), fallback]
    .map((sym) => (typeof sym === 'string' ? sym.trim().toUpperCase() : ''))
    .filter(Boolean);

  return Array.from(new Set(normalized.length > 0 ? normalized : [fallback]));
}

function normalizeSide(raw) {
  const value = typeof raw === 'string' ? raw.trim().toUpperCase() : '';
  if (ALLOWED_LLM_SIDES.includes(value)) {
    return { upper: value, lower: value.toLowerCase() };
  }
  return { upper: 'HOLD', lower: 'hold' };
}

function normalizeSizingBasis(raw) {
  const value = typeof raw === 'string' ? raw.trim().toLowerCase() : '';
  if (ALLOWED_LLM_SIZING_BASES.includes(value)) {
    return value;
  }
  return 'percent_of_capital';
}

function clampSize(size, remainingCapital) {
  const max = remainingCapital && remainingCapital > 0 ? remainingCapital * 2 : 1_000_000;
  if (size <= 0) return 0;
  return Math.min(size, max);
}

function clampPercentSize(size) {
  if (size <= 0) return 0;
  if (size > 100) return 100;
  return size;
}

function resolveAmountFromSizing(size, sizingBasis, remainingCapital, currentPrice) {
  if (size <= 0) return 0;
  if (sizingBasis === 'percent_of_capital') {
    if (remainingCapital && remainingCapital > 0) {
      return (remainingCapital * clampPercentSize(size)) / 100;
    }
    return size;
  }

  if (sizingBasis === 'fixed_dollars') {
    const boundedSize = clampSize(size, remainingCapital);
    return remainingCapital ? Math.min(boundedSize, remainingCapital) : boundedSize;
  }

  if (currentPrice && currentPrice > 0) {
    const unitsCost = size * currentPrice;
    return remainingCapital ? Math.min(unitsCost, remainingCapital) : unitsCost;
  }

  return clampSize(size, remainingCapital);
}

function validateLLMTradeAction(raw, options) {
  if (raw === null || typeof raw !== 'object' || Array.isArray(raw)) {
    throw new Error('LLMTradeAction must be a JSON object.');
  }

  const { upper: side, lower: action } = normalizeSide(raw.side ?? raw.action);
  const sizingBasis = normalizeSizingBasis(raw.sizingBasis ?? raw.sizing_basis ?? raw.sizingbasis);
  const hasRemainingCapital = typeof options?.remainingCapital === 'number' && options.remainingCapital > 0;
  const sizeRaw = ensureNumber(
    raw.size ?? raw.amount ?? raw.quantity,
    hasRemainingCapital ? options.remainingCapital * 0.01 : 0,
  );
  const size =
    sizingBasis === 'percent_of_capital'
      ? clampPercentSize(sizeRaw)
      : clampSize(sizeRaw, options?.remainingCapital);

  const reasoning =
    typeof raw.reasoning === 'string' && raw.reasoning.trim().length > 0
      ? raw.reasoning.trim()
      : 'LLM did not provide reasoning';

  const confidence = Math.min(Math.max(ensureNumber(raw.confidence, 50), 0), 100);

  const fallbackSymbol = options?.fallbackSymbol || options?.fallbackSector || 'UNKNOWN';
  const symbol =
    typeof raw.symbol === 'string' && raw.symbol.trim() !== ''
      ? raw.symbol.trim().toUpperCase()
      : fallbackSymbol.toUpperCase();

  const sector =
    typeof raw.sector === 'string' && raw.sector.trim() !== ''
      ? raw.sector.trim()
      : options?.fallbackSector || symbol;

  const allowedSymbols = normalizeAllowedSymbols(options?.allowedSymbols ?? [], symbol);
  if (!allowedSymbols.includes(symbol)) {
    throw new Error(`LLMTradeAction.symbol must be one of: ${allowedSymbols.join(', ')}.`);
  }

  const stopLoss = toNumberOrNull(raw.stopLoss ?? raw.stop_loss);
  const takeProfit = toNumberOrNull(raw.takeProfit ?? raw.take_profit);
  const entryPrice = toNumberOrNull(raw.entryPrice ?? raw.entry_price ?? raw.price);

  const amount = resolveAmountFromSizing(size, sizingBasis, options?.remainingCapital, options?.currentPrice);

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
  };
}

function normalizeActionToUpper(action) {
  const normalized = typeof action === 'string' ? action.trim().toUpperCase() : '';
  if (ALLOWED_LLM_SIDES.includes(normalized)) {
    return normalized;
  }
  return 'HOLD';
}

module.exports = {
  ALLOWED_LLM_SIDES,
  ALLOWED_LLM_SIZING_BASES,
  validateLLMTradeAction,
  normalizeActionToUpper,
};

