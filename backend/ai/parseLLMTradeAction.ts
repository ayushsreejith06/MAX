import { LLMTradeAction } from './types/LLMTradeAction';

type RawLLMAction = {
  action?: unknown;
  amount?: unknown;
  symbol?: unknown;
  sector?: unknown;
  stopLoss?: unknown;
  takeProfit?: unknown;
  confidence?: unknown;
  reasoning?: unknown;
};

const REQUIRED_FIELDS: Array<keyof RawLLMAction> = [
  'action',
  'amount',
  'symbol',
  'confidence',
  'reasoning',
  'stopLoss',
  'takeProfit'
];

export function parseLLMTradeAction(rawText: string): LLMTradeAction {
  const cleaned = rawText
    .replace(/```json/gi, '')
    .replace(/```/g, '')
    .trim();

  let json: RawLLMAction;
  try {
    json = JSON.parse(cleaned);
  } catch (error) {
    console.error('[parseLLMTradeAction] Failed to parse LLM JSON', { rawText, error });
    throw new Error('Invalid LLM trade action: missing required fields');
  }

  const missingFields = REQUIRED_FIELDS.filter((field) => json[field] === undefined || json[field] === null);
  if (missingFields.length > 0) {
    console.error('[parseLLMTradeAction] Missing required fields from LLM response', {
      rawText,
      missingFields
    });
    throw new Error('Invalid LLM trade action: missing required fields');
  }

  const actionValue = typeof json.action === 'string' ? json.action.trim().toLowerCase() : '';
  const allowedActions: Array<LLMTradeAction['action']> = ['buy', 'sell', 'hold'];
  if (!allowedActions.includes(actionValue as LLMTradeAction['action'])) {
    console.error('[parseLLMTradeAction] Invalid action received from LLM', { rawText, action: json.action });
    throw new Error('Invalid LLM trade action: missing required fields');
  }

  const amountValue = json.amount;
  if (typeof amountValue !== 'number' || Number.isNaN(amountValue) || !Number.isFinite(amountValue)) {
    console.error('[parseLLMTradeAction] Invalid amount received from LLM', { rawText, amount: json.amount });
    throw new Error('Invalid LLM trade action: missing required fields');
  }

  const confidenceValue = json.confidence;
  if (
    typeof confidenceValue !== 'number' ||
    Number.isNaN(confidenceValue) ||
    !Number.isFinite(confidenceValue)
  ) {
    console.error('[parseLLMTradeAction] Invalid confidence received from LLM', {
      rawText,
      confidence: json.confidence
    });
    throw new Error('Invalid LLM trade action: missing required fields');
  }

  if (typeof json.symbol !== 'string' || json.symbol.trim() === '') {
    console.error('[parseLLMTradeAction] Invalid symbol received from LLM', { rawText, symbol: json.symbol });
    throw new Error('Invalid LLM trade action: missing required fields');
  }

  if (typeof json.reasoning !== 'string' || json.reasoning.trim() === '') {
    console.error('[parseLLMTradeAction] Invalid reasoning received from LLM', { rawText, reasoning: json.reasoning });
    throw new Error('Invalid LLM trade action: missing required fields');
  }

  if (typeof json.stopLoss !== 'number' || Number.isNaN(json.stopLoss) || !Number.isFinite(json.stopLoss)) {
    console.error('[parseLLMTradeAction] Invalid stopLoss received from LLM', { rawText, stopLoss: json.stopLoss });
    throw new Error('Invalid LLM trade action: missing required fields');
  }

  if (
    typeof json.takeProfit !== 'number' ||
    Number.isNaN(json.takeProfit) ||
    !Number.isFinite(json.takeProfit)
  ) {
    console.error('[parseLLMTradeAction] Invalid takeProfit received from LLM', {
      rawText,
      takeProfit: json.takeProfit
    });
    throw new Error('Invalid LLM trade action: missing required fields');
  }

  return {
    action: actionValue as LLMTradeAction['action'],
    amount: amountValue,
    symbol: json.symbol.trim(),
    sector: typeof json.sector === 'string' ? json.sector.trim() : undefined,
    stopLoss: json.stopLoss,
    takeProfit: json.takeProfit,
    confidence: confidenceValue,
    reasoning: json.reasoning.trim()
  };
}

