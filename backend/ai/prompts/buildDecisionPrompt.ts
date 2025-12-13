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
    `You are an active trading agent for the ${sectorName} sector. Your job is to make trading decisions, not to avoid them.`,
    'You see contextual data: sector, allowedSymbols, simulated price, baseline, trend %, volatility, recent P/L, and indicators.',
    `The agent brief is: "${params.agentBrief || specialization}".`,
    'CRITICAL: You are expected to make active trading decisions. HOLD should be rare and only used when truly necessary.',
    '',
    'Decision guidelines (in order of priority):',
    '1. BUY when:',
    '   - Trend is positive (>1%) OR price is above baseline OR indicators are bullish',
    '   - Volatility is reasonable (<0.4)',
    '   - Available capital exists',
    '   - Confidence should be 50-85% based on signal strength',
    '',
    '2. SELL when:',
    '   - Trend is negative (<-1%) OR price is below baseline OR indicators are bearish',
    '   - Volatility is reasonable (<0.4)',
    '   - You have existing positions to sell',
    '   - Confidence should be 50-80% based on signal strength',
    '',
    '3. HOLD only when:',
    '   - Market signals are truly neutral (trend between -1% and +1%)',
    '   - AND volatility is extremely high (>0.5)',
    '   - AND no clear directional signal exists',
    '   - Confidence should be low (5-30%) for HOLD',
    '',
    'IMPORTANT: If you have available capital and any positive trend (>0.5%) or bullish indicators, you should strongly consider BUY.',
    'IMPORTANT: If trend is negative (<-0.5%) or bearish indicators exist, consider SELL.',
    'IMPORTANT: Default to action (BUY/SELL) rather than inaction (HOLD) when signals exist.',
    '',
    'Base your confidence on the strength of market signals: strong trends = higher confidence (60-85), moderate = medium confidence (40-60), weak = lower confidence (20-40).',
    'Pick a sizingBasis (fixed_units | fixed_dollars | percent_of_capital) and a numeric size that matches the basis and capital.',
    'Optionally include entryPrice, stopLoss, and takeProfit (numbers) or null.',
    'Output ONLY one JSON object, no markdown or extra prose, matching the REQUIRED schema below.',
    'CRITICAL: You MUST include confidence (0-100), allocation_percent (0-100), and risk_notes in your response.',
    'CRITICAL: Your confidence MUST be based on the strength of your reasoning and market signals, not arbitrary values.',
  ].join('\n');

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
    '- PREFER BUY/SELL over HOLD: Choose action based on market signals - prefer active trading (BUY/SELL) when any signal exists.',
    '- When trend > 0.5% or price > baseline: Strongly consider BUY with confidence 50-75%',
    '- When trend < -0.5% or price < baseline: Consider SELL with confidence 50-70%',
    '- HOLD only if trend is between -0.5% and +0.5% AND no clear indicators exist (confidence 5-30%)',
    '- confidence MUST be a number between 0-100. This is REQUIRED and cannot be omitted.',
    '- confidence MUST reflect the strength of your reasoning:',
    '  * BUY with strong signals (trend >2%, bullish indicators): 65-85%',
    '  * BUY with moderate signals (trend 0.5-2%, positive indicators): 50-65%',
    '  * SELL with strong signals (trend <-2%, bearish indicators): 60-80%',
    '  * SELL with moderate signals (trend -0.5% to -2%, negative indicators): 50-65%',
    '  * HOLD (only when truly neutral): 5-30%',
    '- allocation_percent MUST be a number between 0-100. This is REQUIRED and cannot be omitted.',
    '- For BUY/SELL actions, allocation_percent should be 15-30% for high confidence (60+), 10-20% for medium confidence (40-60), 5-15% for lower confidence (20-40).',
    '- For HOLD actions, allocation_percent should be 0%.',
    '- risk_notes MUST be a string describing your risk assessment. This is REQUIRED and cannot be omitted.',
    '- Confidence is allowed to increase across rounds as you gather more information.',
    `- ${sizingRule}`,
    '- Base reasoning on realTimeData (price, baseline, trend %, volatility, P/L, indicators).',
    '- Use actual market data to justify your decision - reference specific numbers from realTimeData in your reasoning.',
    '- REMEMBER: You are an active trader. Make decisions. HOLD is a last resort, not a default.',
    '- Output pure JSON only (jsonMode=true).',
    '- If you omit confidence, allocation_percent, or risk_notes, your response will be rejected.'
  ].join('\n');

  return { systemPrompt, userPrompt, allowedSymbols };
}


