const ALLOWED_LLM_ACTIONS = ['buy', 'sell', 'hold', 'rebalance'];

function ensureNumber(value, label) {
  if (typeof value !== 'number' || Number.isNaN(value) || !Number.isFinite(value)) {
    throw new Error(`${label} must be a finite number.`);
  }
  return value;
}

function normalizeAllowedSymbols(symbols, fallback) {
  const normalized = [...(symbols || []), fallback]
    .map(sym => (typeof sym === 'string' ? sym.trim().toUpperCase() : ''))
    .filter(Boolean);

  return Array.from(new Set(normalized.length > 0 ? normalized : [fallback]));
}

function validateLLMTradeAction(raw, options) {
  if (raw === null || typeof raw !== 'object' || Array.isArray(raw)) {
    throw new Error('LLMTradeAction must be a JSON object.');
  }

  const actionRaw = typeof raw.action === 'string' ? raw.action.trim().toLowerCase() : '';
  if (!ALLOWED_LLM_ACTIONS.includes(actionRaw)) {
    throw new Error(`LLMTradeAction.action must be one of: ${ALLOWED_LLM_ACTIONS.join(', ')}.`);
  }

  const amount = ensureNumber(raw.amount, 'LLMTradeAction.amount');
  if (amount <= 0) {
    throw new Error('LLMTradeAction.amount must be greater than 0.');
  }

  if (typeof raw.symbol !== 'string' || raw.symbol.trim() === '') {
    throw new Error('LLMTradeAction.symbol is required and must be a non-empty string.');
  }
  const symbol = raw.symbol.trim().toUpperCase();

  const sector =
    typeof raw.sector === 'string' && raw.sector.trim() !== ''
      ? raw.sector.trim()
      : undefined;

  const stopLoss = raw.stopLoss === undefined ? undefined : ensureNumber(raw.stopLoss, 'LLMTradeAction.stopLoss');
  const takeProfit =
    raw.takeProfit === undefined ? undefined : ensureNumber(raw.takeProfit, 'LLMTradeAction.takeProfit');
  const confidenceRaw =
    raw.confidence === undefined ? undefined : ensureNumber(raw.confidence, 'LLMTradeAction.confidence');
  const confidence = Math.min(Math.max(confidenceRaw ?? 50, 0), 100);

  if (typeof raw.reasoning !== 'string' || raw.reasoning.trim() === '') {
    throw new Error('LLMTradeAction.reasoning must be a non-empty string.');
  }
  const reasoning = raw.reasoning.trim();

  const remainingCapital =
    typeof options?.remainingCapital === 'number' && options.remainingCapital > 0
      ? options.remainingCapital
      : undefined;

  const allowedSymbols = normalizeAllowedSymbols(options?.allowedSymbols ?? [], symbol);
  if (!allowedSymbols.includes(symbol)) {
    throw new Error(`LLMTradeAction.symbol must be one of: ${allowedSymbols.join(', ')}.`);
  }

  let boundedAmount = amount;
  if (remainingCapital) {
    const min = remainingCapital * 0.01;
    const max = remainingCapital * 0.2;
    boundedAmount = Math.min(Math.max(amount, min), Math.min(max, remainingCapital));
  }

  return {
    action: actionRaw,
    amount: boundedAmount,
    symbol,
    sector,
    stopLoss,
    takeProfit,
    confidence,
    reasoning,
  };
}

function normalizeActionToUpper(action) {
  return action.toUpperCase();
}

module.exports = {
  ALLOWED_LLM_ACTIONS,
  validateLLMTradeAction,
  normalizeActionToUpper,
};

