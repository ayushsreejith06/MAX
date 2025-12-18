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
    '',
    'Your task is to analyze the market data and provide:',
    '1. REASONING: Your internal thought process and analysis of the current market conditions',
    '2. PROPOSAL: A plain text proposal describing your trading recommendation (no structured actions)',
    '3. CONFIDENCE: Your confidence level (0-100) in your proposal',
    '',
    'IMPORTANT:',
    '- Provide reasoning based on the market data (price, trend, volatility, indicators)',
    '- Write proposals as natural language text, not structured action objects',
    '- Do not use BUY/SELL/HOLD as structured objects - describe your recommendation in plain text',
    '- Confidence should reflect how certain you are about your proposal (0-100)',
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
    `remainingCapital: ${remainingCapital ?? 'unknown'}`,
    `realTimeData: ${JSON.stringify(realTimeData)}`,
    '',
    'Your response MUST be a valid JSON object with the following schema:',
    '{',
    '  "reasoning": string, // Your analysis and thought process',
    '  "proposal": string,  // Plain text proposal describing your recommendation',
    '  "confidence": number // Your confidence level (0-100)',
    '}',
    '',
    'Rules:',
    '- reasoning: Provide detailed analysis of market conditions, trends, and indicators',
    '- proposal: Write a natural language proposal describing what you recommend (e.g., "I recommend increasing exposure to this sector given the positive trend and strong indicators")',
    '- confidence: A number between 0-100 reflecting how certain you are about your proposal',
    '- Do NOT use structured action objects (BUY/SELL/HOLD) - describe your recommendation in plain text',
    '- Base your reasoning on the realTimeData provided (price, baseline, trend %, volatility, P/L, indicators)',
    '- Confidence should reflect signal strength: strong signals = 60-85%, moderate = 40-60%, weak = 20-40%',
    '- Output MUST be valid JSON - no markdown code blocks, no commentary outside the JSON object'
  ].join('\n');

  return { systemPrompt, userPrompt, allowedSymbols };
}

module.exports = {
  buildDecisionPrompt
};


