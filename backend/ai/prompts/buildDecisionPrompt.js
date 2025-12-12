function normalizeAllowedSymbols(symbols, sectorName) {
  const fallback = sectorName ? sectorName.toUpperCase() : 'UNKNOWN';
  const normalized = [...(symbols || []), fallback]
    .map(sym => (typeof sym === 'string' ? sym.trim().toUpperCase() : ''))
    .filter(Boolean);

  return Array.from(new Set(normalized.length > 0 ? normalized : [fallback]));
}

function normalizeRealTimeData(data, sectorName) {
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

function buildDecisionPrompt(params) {
  const sectorName = params.sectorName || 'UNKNOWN';
  const specialization = params.agentSpecialization || 'generalist';
  const agentBrief = params.agentBrief || specialization;
  const allowedSymbols = normalizeAllowedSymbols(params.allowedSymbols, sectorName);
  const remainingCapital =
    typeof params.remainingCapital === 'number' && params.remainingCapital > 0
      ? params.remainingCapital
      : undefined;
  const realTimeData = normalizeRealTimeData(params.realTimeData, sectorName);

  const systemPrompt = [
    `You are a trading agent for the ${sectorName} sector.`,
    'You see contextual data: sector, allowedSymbols, simulated price, baseline, trend %, volatility, recent P/L, and indicators.',
    `The agent brief is: "${agentBrief}".`,
    'Think about risks, available capital, and whether to BUY, SELL, HOLD, or REBALANCE.',
    'Your response must have TWO parts:',
    '1. ANALYSIS: Your internal thought process (not shown to users)',
    '2. PROPOSAL: A structured JSON object with action, symbol, allocationPercent, confidence, and reasoning.',
    'CRITICAL: The PROPOSAL must be valid JSON with all required fields: action, symbol, allocationPercent (0-100), confidence (0-100), and reasoning.',
  ].join(' ');

  const sizingRule = remainingCapital
    ? `When using percent_of_capital, keep size between ${Number((remainingCapital * 0.01).toFixed(2))}% and 20%. For fixed_dollars stay within $${Number(
        (remainingCapital * 0.2).toFixed(2)
      )}.`
    : 'When capital is unknown, pick conservative sizing (<=10% if using percent_of_capital).';

  const userPrompt = [
    `sectorName: ${sectorName}`,
    `agentSpecialization: ${specialization}`,
    `agentBrief: ${agentBrief}`,
    `allowedSymbols: ${JSON.stringify(allowedSymbols)}`,
    `remainingCapital: ${remainingCapital ?? 'unknown (assume conservative sizing)'}`,
    `realTimeData: ${JSON.stringify(realTimeData)}`,
    '',
    'Your response MUST have TWO parts:',
    '',
    '1. ANALYSIS (internal, not shown to users):',
    '   Provide your internal analysis and thought process. This is for your own reasoning.',
    '',
    '2. PROPOSAL (structured, machine-readable JSON):',
    '   This MUST be a valid JSON object with the following schema:',
    '   {',
    '     "action": "BUY" | "SELL" | "HOLD",',
    '     "symbol": "<one of allowedSymbols>",',
    '     "allocationPercent": number (0-100),',
    '     "confidence": number (0-100),',
    '     "reasoning": "string"',
    '   }',
    '',
    'Output format:',
    'ANALYSIS:',
    '<your internal analysis here>',
    '',
    'PROPOSAL:',
    '<JSON object only, no markdown>',
    '',
    'Rules:',
    '- Select symbol from allowedSymbols.',
    '- Choose action (BUY/SELL/HOLD) based on risk and trend; HOLD if nothing stands out.',
    '- confidence MUST be a number between 0-100. This is REQUIRED and cannot be omitted.',
    '- allocationPercent MUST be a number between 0-100. This is REQUIRED and cannot be omitted.',
    '- reasoning MUST be a string. This is REQUIRED and cannot be omitted.',
    '- Confidence is allowed to increase across rounds as you gather more information.',
    `- ${sizingRule}`,
    '- Base reasoning on realTimeData (price, baseline, trend %, volatility, P/L, indicators).',
    '- The PROPOSAL section must contain ONLY valid JSON, no markdown code blocks.',
    '- If you omit confidence, allocationPercent, or reasoning, your response will be rejected.'
  ].join('\n');

  return { systemPrompt, userPrompt, allowedSymbols };
}

module.exports = {
  buildDecisionPrompt
};


