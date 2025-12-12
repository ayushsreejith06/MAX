export type LLMTradeActionType = 'buy' | 'sell' | 'hold' | 'rebalance';

export interface LLMTradeAction {
  action: LLMTradeActionType;
  amount: number;
  symbol: string;
  sector?: string;
  confidence: number;
  reasoning: string;
  stopLoss?: number;
  takeProfit?: number;
}

export type ValidateLLMTradeActionOptions = {
  allowedSymbols?: string[];
  remainingCapital?: number;
};

export const ALLOWED_LLM_ACTIONS: ReadonlyArray<LLMTradeActionType> = ['buy', 'sell', 'hold', 'rebalance'] as const;

function ensureNumber(value: unknown, label: string): number {
  if (typeof value !== 'number' || Number.isNaN(value) || !Number.isFinite(value)) {
    throw new Error(`${label} must be a finite number.`);
  }
  return value;
}

function normalizeAllowedSymbols(symbols: string[], fallback: string): string[] {
  const normalized = [...(symbols || []), fallback]
    .map((sym) => (typeof sym === 'string' ? sym.trim().toUpperCase() : ''))
    .filter(Boolean);

  return Array.from(new Set(normalized.length > 0 ? normalized : [fallback]));
}

export function validateLLMTradeAction(
  raw: unknown,
  options?: ValidateLLMTradeActionOptions
): LLMTradeAction {
  if (raw === null || typeof raw !== 'object' || Array.isArray(raw)) {
    throw new Error('LLMTradeAction must be a JSON object.');
  }

  const record = raw as Record<string, unknown>;

  const actionRaw = typeof record.action === 'string' ? record.action.trim().toLowerCase() : '';
  if (!ALLOWED_LLM_ACTIONS.includes(actionRaw as LLMTradeActionType)) {
    throw new Error(`LLMTradeAction.action must be one of: ${ALLOWED_LLM_ACTIONS.join(', ')}.`);
  }
  const action = actionRaw as LLMTradeActionType;

  const amount = ensureNumber(record.amount, 'LLMTradeAction.amount');
  if (amount <= 0) {
    throw new Error('LLMTradeAction.amount must be greater than 0.');
  }

  if (typeof record.symbol !== 'string' || record.symbol.trim() === '') {
    throw new Error('LLMTradeAction.symbol is required and must be a non-empty string.');
  }
  const symbol = record.symbol.trim().toUpperCase();

  const sector =
    typeof record.sector === 'string' && record.sector.trim() !== ''
      ? record.sector.trim()
      : undefined;

  const stopLoss =
    record.stopLoss === undefined ? undefined : ensureNumber(record.stopLoss, 'LLMTradeAction.stopLoss');
  const takeProfit =
    record.takeProfit === undefined ? undefined : ensureNumber(record.takeProfit, 'LLMTradeAction.takeProfit');
  const confidenceRaw =
    record.confidence === undefined ? undefined : ensureNumber(record.confidence, 'LLMTradeAction.confidence');
  const confidence = Math.min(Math.max(confidenceRaw ?? 50, 0), 100);

  if (typeof record.reasoning !== 'string' || record.reasoning.trim() === '') {
    throw new Error('LLMTradeAction.reasoning must be a non-empty string.');
  }
  const reasoning = record.reasoning.trim();

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
    action,
    amount: boundedAmount,
    symbol,
    sector,
    stopLoss,
    takeProfit,
    confidence,
    reasoning
  };
}

export function normalizeActionToUpper(action: LLMTradeActionType): 'BUY' | 'SELL' | 'HOLD' {
  return action.toUpperCase() as 'BUY' | 'SELL' | 'HOLD';
}

