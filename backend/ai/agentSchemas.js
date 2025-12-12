const ALLOWED_ACTIONS = ['BUY', 'SELL', 'HOLD', 'REBALANCE'];

function ensureObject(raw, label) {
  if (raw === null || typeof raw !== 'object' || Array.isArray(raw)) {
    throw new Error(`${label}: expected an object`);
  }
}

function ensureString(value, label) {
  if (typeof value !== 'string') {
    throw new Error(`${label}: expected a string`);
  }
}

function ensureBoolean(value, label) {
  if (typeof value !== 'boolean') {
    throw new Error(`${label}: expected a boolean`);
  }
}

function ensureNumberInRange(value, label, min, max) {
  if (typeof value !== 'number' || Number.isNaN(value)) {
    throw new Error(`${label}: expected a number`);
  }
  if (value < min || value > max) {
    throw new Error(`${label}: must be between ${min} and ${max}`);
  }
}

function validateWorkerAgentProposal(raw) {
  ensureObject(raw, 'WorkerAgentProposal');

  const { action, symbol, allocationPercent, confidence, reasoning } = raw;

  if (!ALLOWED_ACTIONS.includes((action || '').toUpperCase())) {
    throw new Error(
      `WorkerAgentProposal: action must be one of ${ALLOWED_ACTIONS.join(', ')}`
    );
  }

  ensureString(symbol, 'WorkerAgentProposal.symbol');
  ensureNumberInRange(allocationPercent, 'WorkerAgentProposal.allocationPercent', 0, 100);
  ensureNumberInRange(confidence, 'WorkerAgentProposal.confidence', 0, 100);
  ensureString(reasoning, 'WorkerAgentProposal.reasoning');

  return {
    action: action.toUpperCase(),
    symbol,
    allocationPercent,
    confidence,
    reasoning
  };
}

function validateManagerChecklistDecision(raw) {
  ensureObject(raw, 'ManagerChecklistDecision');

  const { approve, editedAllocationPercent, confidence, reasoning } = raw;

  ensureBoolean(approve, 'ManagerChecklistDecision.approve');
  ensureNumberInRange(confidence, 'ManagerChecklistDecision.confidence', 0, 100);
  ensureString(reasoning, 'ManagerChecklistDecision.reasoning');

  if (editedAllocationPercent !== undefined) {
    ensureNumberInRange(
      editedAllocationPercent,
      'ManagerChecklistDecision.editedAllocationPercent',
      0,
      100
    );
  }

  return {
    approve,
    editedAllocationPercent,
    confidence,
    reasoning
  };
}

module.exports = {
  ALLOWED_ACTIONS,
  validateWorkerAgentProposal,
  validateManagerChecklistDecision
};

