function normalizeAllowedSymbols(symbols, sectorName) {
  const fallback = sectorName ? sectorName.toUpperCase() : 'UNKNOWN';
  const normalized = [...(symbols || []), fallback]
    .map(sym => (typeof sym === 'string' ? sym.trim().toUpperCase() : ''))
    .filter(Boolean);

  return Array.from(new Set(normalized.length > 0 ? normalized : [fallback]));
}

function normalizeRealTimeData(data, sectorName) {
  const { recentPrice, baselinePrice, trendPercent, volatility, indicators } = data || {};

  return {
    sectorName,
    recentPrice: typeof recentPrice === 'number' ? recentPrice : null,
    baselinePrice: typeof baselinePrice === 'number' ? baselinePrice : null,
    trendPercent: typeof trendPercent === 'number' ? trendPercent : null,
    volatility: typeof volatility === 'number' ? volatility : null,
    indicators: indicators ?? {}
  };
}

function buildDecisionPrompt(params) {
  const sectorName = params.sectorName || 'UNKNOWN';
  const specialization = params.agentSpecialization || 'generalist';
  const allowedSymbols = normalizeAllowedSymbols(params.allowedSymbols, sectorName);
  const remainingCapital =
    typeof params.remainingCapital === 'number' && params.remainingCapital > 0
      ? params.remainingCapital
      : undefined;
  const realTimeData = normalizeRealTimeData(params.realTimeData, sectorName);

  const systemPrompt = [
    'You are MAX Trading LLM.',
    'You MUST output JSON according to LLMTradeAction.',
    'Choose ONLY from allowedSymbols.',
    'Choose realistic amount (1–20% of remaining capital).',
    'Include reasoning.',
    'Output strictly JSON with no extra text.'
  ].join(' ');

  const amountRule = remainingCapital
    ? `Amount should be between ${Number((remainingCapital * 0.01).toFixed(2))} and ${Number(
        (remainingCapital * 0.2).toFixed(2)
      )} (1–20% of remaining capital)`
    : 'Amount should represent 1–20% of remaining capital; if capital is unknown, pick a conservative value';

  const userPrompt = [
    `sectorName: ${sectorName}`,
    `agentSpecialization: ${specialization}`,
    `allowedSymbols: ${JSON.stringify(allowedSymbols)}`,
    `remainingCapital: ${remainingCapital ?? 'unknown (assume conservative sizing)'}`,
    `realTimeData: ${JSON.stringify(realTimeData)}`,
    'Respond with one JSON object following LLMTradeAction:',
    '{',
    '  "action": "BUY" | "SELL" | "HOLD" | "REBALANCE",',
    '  "symbol": "<one of allowedSymbols>",',
    '  "amount": number,',
    '  "confidence": number (0-100),',
    '  "reasoning": "concise justification based on the data"',
    '}',
    'Rules:',
    '- Select symbol from allowedSymbols.',
    `- ${amountRule}.`,
    '- Base reasoning on realTimeData trends, volatility, and indicators.',
    '- No prose outside the JSON object.'
  ].join('\n');

  return { systemPrompt, userPrompt, allowedSymbols };
}

module.exports = {
  buildDecisionPrompt
};


