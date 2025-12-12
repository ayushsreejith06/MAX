const { callLLM, isLlmEnabled } = require('./llmClient');
const { validateWorkerAgentProposal } = require('./agentSchemas');

const SYSTEM_PROMPT =
  'You are MAX Trading LLM. You always output JSON. You must produce a single actionable trade relevant to the sector. Your response must NOT exceed 120 characters outside JSON.';

function buildUserPrompt(params) {
  const { sectorState, purpose, agentProfile } = params;
  const sectorData = {
    sectorState,
    agentProfile,
    indicators: sectorState.indicators ?? {},
  };

  return `Generate a trading action for sector=${sectorState.sectorType} using this data snapshot=${JSON.stringify(
    sectorData
  )} and agentGoal=${purpose ?? agentProfile.roleDescription}.`;
}

function validateTradeJson(raw, sectorState) {
  if (raw === null || typeof raw !== 'object' || Array.isArray(raw)) {
    throw new Error('LLM response must be a JSON object');
  }

  const { action, amount, confidence, rationale } = raw;
  const allowedActions = ['BUY', 'SELL', 'HOLD', 'REBALANCE'];

  if (!allowedActions.includes(action)) {
    throw new Error(`action must be one of ${allowedActions.join(', ')}`);
  }

  if (typeof amount !== 'number' || Number.isNaN(amount)) {
    throw new Error('amount must be a number');
  }

  if (sectorState.balance !== undefined && amount > sectorState.balance) {
    throw new Error('amount exceeds sector balance');
  }

  if (typeof confidence !== 'number' || Number.isNaN(confidence) || confidence < 0 || confidence > 100) {
    throw new Error('confidence must be between 0 and 100');
  }

  if (typeof rationale !== 'string') {
    throw new Error('rationale must be a string');
  }

  return { action, amount, confidence, rationale };
}

function mapTradeToWorkerProposal(trade, sectorState) {
  const allocationPercent =
    sectorState.balance && sectorState.balance > 0 ? Math.min(100, (trade.amount / sectorState.balance) * 100) : 0;

  return validateWorkerAgentProposal({
    action: trade.action,
    symbol: sectorState.sectorName ?? '',
    allocationPercent,
    confidence: trade.confidence,
    reasoning: trade.rationale,
  });
}

async function generateWorkerProposal(params) {
  // Guard early if LLM disabled to avoid throwing in callLLM
  if (!isLlmEnabled) {
    throw new Error('LLM disabled; cannot generate proposal');
  }

  try {
    const rawResponse = await callLLM({
      systemPrompt: SYSTEM_PROMPT,
      userPrompt: buildUserPrompt(params),
      jsonMode: true
    });

    const parsed = JSON.parse(rawResponse);
    const trade = validateTradeJson(parsed, params.sectorState);
    return mapTradeToWorkerProposal(trade, params.sectorState);
  } catch (error) {
    // Bubble up to let the discussion workflow handle invalid JSON/output.
    throw error;
  }
}

module.exports = {
  generateWorkerProposal
};

