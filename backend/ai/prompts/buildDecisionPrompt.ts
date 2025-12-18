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
    'You see contextual data: sector, simulated price, baseline, trend %, volatility, recent P/L, and indicators.',
    `The agent brief is: "${params.agentBrief || specialization}".`,
    '',
    'Your task is to analyze the current market conditions and provide:',
    '1. REASONING: Your internal thought process and analysis of the current market conditions (plain text)',
    '2. PROPOSAL: A plain text proposal describing your trading recommendation (plain text, no structured actions)',
    '3. CONFIDENCE: Your confidence level (0.0-1.0) in your proposal, based solely on the strength of your current reasoning',
    '',
    'CRITICAL RULES:',
    '- Provide reasoning as plain text based on the market data (price, trend, volatility, indicators)',
    '- Write proposals as natural language text, not structured action objects',
    '- Do NOT use BUY/SELL/HOLD as structured labels - describe your recommendation in plain text',
    '- Confidence MUST be a float between 0.0 and 1.0',
    '- Confidence MUST be derived SOLELY from the strength of your current proposal and reasoning',
    '- Confidence MUST NOT depend on prior discussions, past confidence values, or manager feedback',
    '- Confidence MUST NOT monotonically increase over time',
    '- Base confidence on signal strength: strong signals = 0.6-0.85, moderate = 0.4-0.6, weak = 0.2-0.4',
    '- Output ONLY pure JSON matching the required schema below.'
  ].join('\n');

  const userPrompt = [
    `sectorName: ${sectorName}`,
    `agentSpecialization: ${specialization}`,
    `agentBrief: ${params.agentBrief || specialization}`,
    `allowedSymbols: ${JSON.stringify(allowedSymbols)}`,
    `remainingCapital: ${remainingCapital ?? 'unknown'}`,
    `realTimeData: ${JSON.stringify(realTimeData)}`,
    '',
    'REQUIRED JSON Schema (all fields are mandatory):',
    '{',
    '  "reasoning": "string", // REQUIRED: Plain text explanation of your analysis',
    '  "proposal": "string", // REQUIRED: Plain text proposal describing your recommendation',
    '  "confidence": number (0.0-1.0) // REQUIRED: Your confidence in this proposal, based solely on current reasoning',
    '}',
    '',
    'Rules:',
    '- reasoning MUST be a plain text string describing your analysis of the market conditions',
    '- proposal MUST be a plain text string describing your trading recommendation (no structured actions)',
    '- confidence MUST be a float between 0.0 and 1.0',
    '- confidence MUST reflect the strength of your current reasoning only',
    '- confidence MUST NOT be influenced by prior discussions, past confidence, or manager feedback',
    '- confidence MUST NOT monotonically increase - it should vary based on current signal strength',
    '- Base reasoning and proposal on realTimeData (price, baseline, trend %, volatility, P/L, indicators)',
    '- Use actual market data to justify your decision - reference specific numbers from realTimeData',
    '- Output pure JSON only (jsonMode=true).',
    '- If you omit reasoning, proposal, or confidence, your response will be rejected.'
  ].join('\n');

  return { systemPrompt, userPrompt, allowedSymbols };
}


