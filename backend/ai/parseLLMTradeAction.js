const ALLOWED_SIDES = ['BUY', 'SELL', 'HOLD', 'REBALANCE'];
const ALLOWED_SIZING_BASES = ['fixed_units', 'fixed_dollars', 'percent_of_capital'];

function fallbackAction(options) {
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

function normalizeSide(raw) {
  const value = typeof raw === 'string' ? raw.trim().toUpperCase() : '';
  return ALLOWED_SIDES.includes(value) ? value : 'HOLD';
}

function normalizeSizingBasis(raw) {
  const value = typeof raw === 'string' ? raw.trim().toLowerCase() : '';
  return ALLOWED_SIZING_BASES.includes(value) ? value : 'percent_of_capital';
}

function parseNumber(value) {
  if (typeof value !== 'number' || Number.isNaN(value) || !Number.isFinite(value)) {
    return null;
  }
  return value;
}

function clampSize(size, sizingBasis, remainingCapital) {
  if (!Number.isFinite(size) || size < 0) return 0;
  if (sizingBasis === 'percent_of_capital') {
    if (size > 100) return 100;
    return size;
  }
  const max = remainingCapital && remainingCapital > 0 ? remainingCapital * 2 : 1_000_000;
  return Math.min(size, max);
}

function parseLLMTradeAction(rawText, options = {}) {
  if (typeof rawText !== 'string' || rawText.trim() === '') {
    console.error('[LLM_PARSE_ERROR] Empty response from LLM');
    return fallbackAction(options);
  }

  const cleaned = rawText
    .replace(/```json/gi, '')
    .replace(/```/g, '')
    .trim();

  let json;
  try {
    json = JSON.parse(cleaned);
  } catch (err) {
    console.error('[LLM_PARSE_ERROR] Failed to parse LLM JSON', { rawText, err });
    return fallbackAction(options);
  }

  // Support both "action" (new schema) and "side" (legacy) for backward compatibility
  const side = normalizeSide(json.action ?? json.side ?? json.tradeAction ?? json.actionType);
  const sizingBasis = normalizeSizingBasis(json.sizingBasis ?? json.sizing_basis ?? json.sizingbasis);
  const size = clampSize(
    typeof json.size === 'number'
      ? json.size
      : typeof json.amount === 'number'
        ? json.amount
        : typeof json.quantity === 'number'
          ? json.quantity
          : 0,
    sizingBasis,
    options.remainingCapital,
  );

  const symbol =
    typeof json.symbol === 'string' && json.symbol.trim() !== ''
      ? json.symbol.trim().toUpperCase()
      : (options.fallbackSymbol || options.fallbackSector || 'UNKNOWN').toUpperCase();

  const sector =
    typeof json.sector === 'string' && json.sector.trim() !== ''
      ? json.sector.trim()
      : options.fallbackSector || symbol;

  const entryPrice =
    parseNumber(json.entryPrice ?? json.entry_price ?? json.price) ??
    (options.currentPrice ?? null);
  const stopLoss = parseNumber(json.stopLoss ?? json.stop_loss);
  const takeProfit = parseNumber(json.takeProfit ?? json.take_profit);

  const reasoning =
    typeof json.reasoning === 'string' && json.reasoning.trim().length > 0
      ? json.reasoning.trim()
      : 'LLM did not provide reasoning';

  // CRITICAL: Confidence is REQUIRED - reject if missing or invalid
  const rawConfidence = json.confidence;
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
  const allocationPercent = parseNumber(json.allocation_percent ?? json.allocationPercent);
  const riskNotes = typeof json.risk_notes === 'string' 
    ? json.risk_notes.trim() 
    : typeof json.riskNotes === 'string'
      ? json.riskNotes.trim()
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

function demoParseLLMTradeAction() {
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

module.exports = {
  parseLLMTradeAction,
  demoParseLLMTradeAction,
};


