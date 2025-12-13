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
    `You are an ACTIVE trading agent for the ${sectorName} sector. Your job is to make trading decisions, not avoid them.`,
    'You see contextual data: sector, allowedSymbols, simulated price, baseline, trend %, volatility, recent P/L, and indicators.',
    `The agent brief is: "${agentBrief}".`,
    'CRITICAL: You are expected to make active trading decisions. HOLD should be rare and only used when truly necessary.',
    '',
    'Decision priority:',
    '1. BUY when trend > 0.5% OR price > baseline OR bullish indicators exist (confidence 50-85%)',
    '2. SELL when trend < -0.5% OR price < baseline OR bearish indicators exist (confidence 50-80%)',
    '3. HOLD ONLY when trend is neutral (-0.5% to +0.5%) AND no clear signals exist (confidence 5-30%)',
    '',
    'IMPORTANT: Default to action (BUY/SELL) rather than inaction (HOLD) when any market signal exists.',
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
    '- PREFER BUY/SELL over HOLD: Choose action based on market signals - prefer active trading when any signal exists.',
    '- When trend > 0.5% or price > baseline: Strongly consider BUY with confidence 50-75%',
    '- When trend < -0.5% or price < baseline: Consider SELL with confidence 50-70%',
    '- HOLD only if trend is between -0.5% and +0.5% AND no clear indicators exist (confidence 5-30%)',
    '- confidence MUST be a number between 0-100. This is REQUIRED and cannot be omitted.',
    '- confidence MUST reflect signal strength: BUY/SELL with signals = 50-85%, HOLD = 5-30%',
    '- allocationPercent MUST be a number between 0-100. This is REQUIRED and cannot be omitted.',
    '- For BUY/SELL: allocationPercent should be 15-30% (high confidence), 10-20% (medium), 5-15% (lower)',
    '- For HOLD: allocationPercent should be 0%',
    '- reasoning MUST be a string. This is REQUIRED and cannot be omitted.',
    '- Confidence is allowed to increase across rounds as you gather more information.',
    `- ${sizingRule}`,
    '- Base reasoning on realTimeData (price, baseline, trend %, volatility, P/L, indicators).',
    '- REMEMBER: You are an active trader. Make decisions. HOLD is a last resort, not a default.',
    '- The PROPOSAL section must contain ONLY valid JSON, no markdown code blocks.',
    '- If you omit confidence, allocationPercent, or reasoning, your response will be rejected.'
  ].join('\n');

  return { systemPrompt, userPrompt, allowedSymbols };
}

module.exports = {
  buildDecisionPrompt
};


