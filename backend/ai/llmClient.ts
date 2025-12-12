import fs from 'fs/promises';
import path from 'path';

type CallLLMParams = {
  systemPrompt: string;
  userPrompt: string;
  maxTokens?: number;
  jsonMode?: boolean;
  useDecisionSystemPrompt?: boolean;
};

const {
  LLM_BASE_URL: rawBaseUrl,
  LLM_MODEL_NAME,
  LLM_API_KEY,
  USE_LLM,
  LLM_RESPONSE_FORMAT
} = process.env;

const isLlmEnabled = (USE_LLM || '').toLowerCase() === 'true';
// Default to 'text' for compatibility with LM Studio/open-source stacks that
// reject OpenAI's json_object/response_format payload.
const responseFormat = (LLM_RESPONSE_FORMAT || 'text').toLowerCase();

const baseUrl = rawBaseUrl ? rawBaseUrl.replace(/\/$/, '') : '';

const decisionSystemPromptPath = path.join(__dirname, 'prompts', 'tradeDecision.system.txt');
let cachedDecisionSystemPrompt: string | null = null;

async function loadDecisionSystemPrompt(): Promise<string> {
  if (cachedDecisionSystemPrompt) {
    return cachedDecisionSystemPrompt;
  }

  try {
    const prompt = await fs.readFile(decisionSystemPromptPath, 'utf-8');
    cachedDecisionSystemPrompt = prompt;
    return prompt;
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Unknown error';
    throw new Error(`Failed to load trade decision system prompt: ${message}`);
  }
}

type AllowedTradeAction = 'BUY' | 'SELL' | 'HOLD' | 'REBALANCE';
type RiskProfile = 'low' | 'medium' | 'high';

export type LLMTradeAction = {
  action: AllowedTradeAction;
  sector: string;
  amount: number;
  confidence: number;
  rationale: string;
  riskProfile: RiskProfile;
  sectorVolatility: number;
  userCapital: number;
};

function requireConfig() {
  if (!isLlmEnabled) {
    throw new Error('LLM disabled');
  }

  if (!baseUrl) {
    throw new Error('LLM_BASE_URL not configured');
  }

  if (!LLM_MODEL_NAME) {
    throw new Error('LLM_MODEL_NAME not configured');
  }
}

function buildHeaders() {
  const headers: Record<string, string> = {
    'Content-Type': 'application/json'
  };

  if (LLM_API_KEY) {
    headers.Authorization = `Bearer ${LLM_API_KEY}`;
  }

  return headers;
}

export async function callLLM(params: CallLLMParams): Promise<string> {
  const { systemPrompt, userPrompt, maxTokens, jsonMode, useDecisionSystemPrompt } = params;

  requireConfig();

  const decisionSystemPrompt = useDecisionSystemPrompt ? await loadDecisionSystemPrompt() : null;
  const finalSystemPrompt = decisionSystemPrompt ?? systemPrompt;
  if (!finalSystemPrompt) {
    throw new Error('System prompt is required');
  }

  const payload: Record<string, unknown> = {
    model: LLM_MODEL_NAME,
    messages: [
      { role: 'system', content: finalSystemPrompt },
      { role: 'user', content: userPrompt }
    ],
    temperature: 0.3
  };

  if (typeof maxTokens === 'number') {
    payload.max_tokens = maxTokens;
  }

  if (jsonMode && responseFormat !== 'none' && responseFormat !== 'off') {
    if (responseFormat === 'text') {
      payload.response_format = { type: 'text' };
    } else {
      payload.response_format = { type: 'json_object' };
    }
  }

  const url = `${baseUrl}/chat/completions`;

  let response: any;
  try {
    console.log('[LLM REQUEST BODY]:', JSON.stringify(payload));
    response = await fetch(url, {
      method: 'POST',
      headers: buildHeaders(),
      body: JSON.stringify(payload)
    });
    console.log('[LLM RESPONSE STATUS]:', response?.status);
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Unknown error';
    console.error('[LLM REQUEST ERROR]:', message);
    console.error('[LLM REQUEST BODY]:', JSON.stringify(payload));
    throw new Error(`LLM request failed: ${message}`);
  }

  let data: any;
  try {
    data = await response.json();
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Unknown error';
    throw new Error(`LLM response was not valid JSON: ${message}`);
  }

  if (!response.ok) {
    const serverMessage = data?.error?.message || response.statusText || 'Unknown error';
    throw new Error(`LLM request failed (${response.status}): ${serverMessage}`);
  }

  const content = data?.choices?.[0]?.message?.content;
  if (typeof content !== 'string' || content.length === 0) {
    throw new Error('LLM response missing message content');
  }

  console.log('[LLM RAW OUTPUT]:', content);

  if (jsonMode) {
    try {
      const parsed = JSON.parse(content);
      console.log('[LLM PARSED JSON]:', parsed);
    } catch (error) {
      console.error('[LLM JSON PARSE ERROR]:', error);
      throw new Error('LLM returned malformed JSON');
    }
  }

  return content;
}

export async function checkLLMHealth(): Promise<boolean> {
  try {
    const result = await callLLM({
      systemPrompt: 'Health check',
      userPrompt: 'Respond with OK.',
      maxTokens: 10
    });
    console.log('[LLM HEALTH CHECK RESULT]:', result);
    return true;
  } catch (error) {
    console.error('LLM health check failed:', error);
    return false;
  }
}

function extractJsonObject(raw: string): any {
  if (typeof raw !== 'string') {
    throw new Error('Response must be a string');
  }

  const trimmed = raw.trim();
  const fencedMatch = trimmed.match(/```(?:json)?\s*([\s\S]*?)```/i);
  const candidate = fencedMatch ? fencedMatch[1] : trimmed;

  // Try direct parse first
  try {
    return JSON.parse(candidate);
  } catch {
    /* fall through */
  }

  const start = candidate.indexOf('{');
  const end = candidate.lastIndexOf('}');
  if (start === -1 || end === -1 || end <= start) {
    throw new Error('No JSON object found');
  }

  const sliced = candidate.slice(start, end + 1);
  return JSON.parse(sliced);
}

function toNumber(value: any): number {
  const num = typeof value === 'number' ? value : Number(value);
  if (!Number.isFinite(num)) {
    throw new Error('Invalid number');
  }
  return num;
}

function normalizeAction(value: any): AllowedTradeAction {
  const action = typeof value === 'string' ? value.trim().toUpperCase() : '';
  if (action === 'BUY' || action === 'SELL' || action === 'HOLD' || action === 'REBALANCE') {
    return action;
  }
  throw new Error('Invalid action');
}

function normalizeRiskProfile(value: any): RiskProfile {
  const profile = typeof value === 'string' ? value.trim().toLowerCase() : '';
  if (profile === 'low' || profile === 'medium' || profile === 'high') {
    return profile;
  }
  throw new Error('Invalid risk profile');
}

function normalizeSector(value: any): string {
  if (typeof value !== 'string') {
    throw new Error('Invalid sector');
  }
  const sector = value.trim().toUpperCase();
  if (!sector) {
    throw new Error('Invalid sector');
  }
  return sector;
}

function normalizeConfidence(value: any): number {
  const num = toNumber(value);
  if (num < 0 || num > 100) {
    throw new Error('Confidence out of range');
  }
  return num;
}

function normalizeRationale(value: any): string {
  if (typeof value !== 'string') {
    throw new Error('Invalid rationale');
  }
  const rationale = value.trim();
  if (!rationale) {
    throw new Error('Invalid rationale');
  }
  return rationale;
}

function normalizePositiveNumber(value: any, label: string): number {
  const num = toNumber(value);
  if (num < 0) {
    throw new Error(`${label} must be >= 0`);
  }
  return num;
}

function computeAmount(
  rawAmount: any,
  userCapital: number,
  sectorVolatility: number,
  riskProfile: RiskProfile
): number {
  if (rawAmount !== undefined && rawAmount !== null) {
    const parsed = normalizePositiveNumber(rawAmount, 'amount');
    return Math.min(parsed, userCapital);
  }

  // Heuristic allocation: scale by risk profile and dampen by volatility.
  const riskMultiplier: Record<RiskProfile, number> = {
    low: 0.02,
    medium: 0.05,
    high: 0.1,
  };

  const clampedVol = Math.max(0, Math.min(sectorVolatility, 1));
  const volatilityFactor = Math.max(0.25, 1 - clampedVol * 3); // reduce sizing as volatility rises

  const suggested = userCapital * riskMultiplier[riskProfile] * volatilityFactor;
  return Math.min(userCapital, Math.max(0, Number(suggested.toFixed(2))));
}

export function parseLLMAction(response: string): LLMTradeAction {
  try {
    const raw = extractJsonObject(response);

    const action = normalizeAction(raw.action);
    const sector = normalizeSector(raw.sector ?? raw.sectorName ?? raw.sectorSymbol);
    const riskProfile = normalizeRiskProfile(raw.riskProfile ?? raw.agentRiskProfile);
    const userCapital = normalizePositiveNumber(raw.userCapital ?? raw.capital ?? raw.availableCapital, 'userCapital');
    const sectorVolatility = normalizePositiveNumber(
      raw.sectorVolatility ?? raw.volatility ?? raw.marketVolatility,
      'sectorVolatility'
    );
    const confidence = normalizeConfidence(raw.confidence ?? raw.confidenceScore);
    const rationale = normalizeRationale(raw.rationale ?? raw.reason ?? raw.justification);
    const amount = computeAmount(raw.amount, userCapital, sectorVolatility, riskProfile);

    return {
      action,
      sector,
      amount,
      confidence,
      rationale,
      riskProfile,
      sectorVolatility,
      userCapital,
    };
  } catch (error) {
    console.error('[parseLLMAction] Failed to parse LLM response', error);
    throw new Error('LLM returned invalid action format');
  }
}

