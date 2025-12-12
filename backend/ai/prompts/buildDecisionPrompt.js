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
    'Pick a sizingBasis (fixed_units | fixed_dollars | percent_of_capital) and a numeric size that matches the basis and capital.',
    'Optionally include entryPrice, stopLoss, and takeProfit (numbers) or null.',
    'Output ONLY one JSON object, no markdown or extra prose, matching LLMTradeAction.',
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
    'Respond with one JSON object following LLMTradeAction:',
    '{',
    '  "sector": "<sector name or symbol>",',
    '  "symbol": "<one of allowedSymbols>",',
    '  "side": "BUY" | "SELL" | "HOLD" | "REBALANCE",',
    '  "sizingBasis": "fixed_units" | "fixed_dollars" | "percent_of_capital",',
    '  "size": number,',
    '  "entryPrice": number | null,',
    '  "stopLoss": number | null,',
    '  "takeProfit": number | null,',
    '  "reasoning": "short explanation"',
    '}',
    'Rules:',
    '- Select symbol from allowedSymbols.',
    '- Choose side based on risk and trend; HOLD if nothing stands out.',
    `- ${sizingRule}`,
    '- Base reasoning on realTimeData (price, baseline, trend %, volatility, P/L, indicators).',
    '- Output pure JSON only (jsonMode=true).'
  ].join('\n');

  return { systemPrompt, userPrompt, allowedSymbols };
}

module.exports = {
  buildDecisionPrompt
};


