export type AllowedAction = 'BUY' | 'SELL' | 'HOLD' | 'REBALANCE';

export type LLMTradeAction = {
  sector: string;
  symbol: string;
  side: AllowedAction;
  sizingBasis: 'fixed_units' | 'fixed_dollars' | 'percent_of_capital';
  size: number;
  entryPrice?: number | null;
  stopLoss?: number | null;
  takeProfit?: number | null;
  reasoning: string;
};

export type BuildDecisionPromptParams = {
  sectorName: string;
  agentSpecialization: string;
  agentBrief?: string;
  allowedSymbols: string[];
  remainingCapital?: number;
  realTimeData: {
    recentPrice?: number;
    baselinePrice?: number;
    trendPercent?: number;
    volatility?: number;
    recentPnLPercent?: number;
    indicators?: Record<string, number | string>;
  };
};

export type BuildDecisionPromptResult = {
  systemPrompt: string;
  userPrompt: string;
  allowedSymbols: string[];
};

function normalizeAllowedSymbols(symbols: string[], sectorName: string): string[] {
  const fallback = sectorName ? sectorName.toUpperCase() : 'UNKNOWN';
  const normalized = [...(symbols || []), fallback]
    .map((sym) => (typeof sym === 'string' ? sym.trim().toUpperCase() : ''))
    .filter(Boolean);

  return Array.from(new Set(normalized.length > 0 ? normalized : [fallback]));
}

function normalizeRealTimeData(data: BuildDecisionPromptParams['realTimeData'], sectorName: string) {
  const { recentPrice, baselinePrice, trendPercent, volatility, indicators, recentPnLPercent } = data || {};

  return {
    sectorName,
    recentPrice: typeof recentPrice === 'number' ? recentPrice : null,
    baselinePrice: typeof baselinePrice === 'number' ? baselinePrice : null,
    trendPercent: typeof trendPercent === 'number' ? trendPercent : null,
    volatility: typeof volatility === 'number' ? volatility : null,
    recentPnLPercent: typeof recentPnLPercent === 'number' ? recentPnLPercent : null,
    indicators: indicators ?? {}
  };
}

export function buildDecisionPrompt(params: BuildDecisionPromptParams): BuildDecisionPromptResult {
  const sectorName = params.sectorName || 'UNKNOWN';
  const specialization = params.agentSpecialization || 'generalist';
  const allowedSymbols = normalizeAllowedSymbols(params.allowedSymbols, sectorName);
  const remainingCapital =
    typeof params.remainingCapital === 'number' && params.remainingCapital > 0
      ? params.remainingCapital
      : undefined;
  const realTimeData = normalizeRealTimeData(params.realTimeData, sectorName);

  const systemPrompt = [
    `You are a trading agent for the ${sectorName} sector.`,
    'You see contextual data: sector, allowedSymbols, simulated price, baseline, trend %, volatility, recent P/L, and indicators.',
    `The agent brief is: "${params.agentBrief || specialization}".`,
    'Analyze the market data carefully and make informed decisions:',
    '- If trend is positive (>2%) and volatility is reasonable (<0.3), consider BUY',
    '- If trend is negative (<-2%) and volatility is reasonable, consider SELL',
    '- Only choose HOLD if market signals are truly neutral or uncertain',
    '- Base your confidence on the strength of market signals: strong trends = higher confidence, weak signals = lower confidence',
    'Think about risks, available capital, and whether to BUY, SELL, HOLD, or REBALANCE.',
    'Pick a sizingBasis (fixed_units | fixed_dollars | percent_of_capital) and a numeric size that matches the basis and capital.',
    'Optionally include entryPrice, stopLoss, and takeProfit (numbers) or null.',
    'Output ONLY one JSON object, no markdown or extra prose, matching the REQUIRED schema below.',
    'CRITICAL: You MUST include confidence (0-100), allocation_percent (0-100), and risk_notes in your response.',
    'CRITICAL: Your confidence MUST be based on the strength of your reasoning and market signals, not arbitrary values.',
  ].join(' ');

  const sizingRule = remainingCapital
    ? `When using percent_of_capital, keep size between ${Number((remainingCapital * 0.01).toFixed(2))}% and 20%. For fixed_dollars stay within $${Number(
        (remainingCapital * 0.2).toFixed(2)
      )}.`
    : 'When capital is unknown, pick conservative sizing (<=10% if using percent_of_capital).';

  const userPrompt = [
    `sectorName: ${sectorName}`,
    `agentSpecialization: ${specialization}`,
    `agentBrief: ${params.agentBrief || specialization}`,
    `allowedSymbols: ${JSON.stringify(allowedSymbols)}`,
    `remainingCapital: ${remainingCapital ?? 'unknown (assume conservative sizing)'}`,
    `realTimeData: ${JSON.stringify(realTimeData)}`,
    '',
    'REQUIRED JSON Schema (all fields are mandatory):',
    '{',
    '  "action": "BUY" | "SELL" | "HOLD",',
    '  "confidence": number (0-100), // REQUIRED: Your confidence level in this decision',
    '  "reasoning": "string", // REQUIRED: Explanation for your decision',
    '  "allocation_percent": number (0-100), // REQUIRED: Percentage of capital to allocate',
    '  "risk_notes": "string", // REQUIRED: Risk assessment and considerations',
    '  "sector": "<sector name or symbol>",',
    '  "symbol": "<one of allowedSymbols>",',
    '  "sizingBasis": "fixed_units" | "fixed_dollars" | "percent_of_capital",',
    '  "size": number,',
    '  "entryPrice": number | null,',
    '  "stopLoss": number | null,',
    '  "takeProfit": number | null',
    '}',
    '',
    'Rules:',
    '- Select symbol from allowedSymbols.',
    '- Choose action (BUY/SELL/HOLD) based on risk and trend; prefer BUY/SELL when market signals are clear.',
    '- confidence MUST be a number between 0-100. This is REQUIRED and cannot be omitted.',
    '- confidence MUST reflect the strength of your reasoning: strong conviction with clear signals = 60-90, moderate = 40-60, weak/uncertain = 10-40',
    '- allocation_percent MUST be a number between 0-100. This is REQUIRED and cannot be omitted.',
    '- For BUY/SELL actions, allocation_percent should typically be 10-30% based on confidence and risk.',
    '- For HOLD actions, allocation_percent should be 0%.',
    '- risk_notes MUST be a string describing your risk assessment. This is REQUIRED and cannot be omitted.',
    '- Confidence is allowed to increase across rounds as you gather more information.',
    `- ${sizingRule}`,
    '- Base reasoning on realTimeData (price, baseline, trend %, volatility, P/L, indicators).',
    '- Use actual market data to justify your decision - reference specific numbers from realTimeData in your reasoning.',
    '- Output pure JSON only (jsonMode=true).',
    '- If you omit confidence, allocation_percent, or risk_notes, your response will be rejected.'
  ].join('\n');

  return { systemPrompt, userPrompt, allowedSymbols };
}


