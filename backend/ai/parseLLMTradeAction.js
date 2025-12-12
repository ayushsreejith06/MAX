function parseLLMTradeAction(rawText) {
  const cleaned = rawText
    .replace(/```json/gi, '')
    .replace(/```/g, '')
    .trim();

  let json;
  try {
    json = JSON.parse(cleaned);
  } catch (err) {
    throw new Error('LLM returned invalid JSON: ' + err);
  }

  const action =
    json.action ||
    json.tradeAction ||
    json.actionType ||
    json.trade_action;

  if (!action) {
    throw new Error('LLM response missing action');
  }

  const normalizedAction = (action.action || action.actionType || action).toLowerCase();

  const llmAction = {
    action: normalizedAction,
    amount: action.amount || json.amount || 0,
    symbol: action.symbol || json.symbol || action.stockSymbol || '',
    sector: action.sector || json.sector || '',
    stopLoss: action.stopLoss,
    takeProfit: action.takeProfit,
    reasoning: (json.reasoning || action.reasoning || 'LLM did not provide reasoning').toString(),
    confidence: Number(json.confidence ?? action.confidence ?? 50)
  };

  if (!llmAction.symbol) {
    throw new Error('LLM action missing symbol');
  }

  if (!llmAction.amount || llmAction.amount <= 0) {
    llmAction.amount = 1;
  }

  llmAction.confidence = Math.min(
    Math.max(Number.isFinite(llmAction.confidence) ? llmAction.confidence : 50, 0),
    100
  );

  return llmAction;
}

module.exports = {
  parseLLMTradeAction,
};


