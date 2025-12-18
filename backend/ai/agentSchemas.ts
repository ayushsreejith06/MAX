// Legacy type - kept for backward compatibility with managerBrain.ts
// New agent proposals use plain text only (see workerBrain.ts)
const ALLOWED_ACTIONS = ['BUY', 'SELL', 'HOLD', 'REBALANCE'] as const;

/**
 * Legacy structured proposal type - agents no longer generate these
 * @deprecated Agents now generate plain text proposals only (see workerBrain.ts WorkerAgentProposal)
 */
export type WorkerAgentProposal = {
  action: (typeof ALLOWED_ACTIONS)[number];
  symbol: string;
  allocationPercent: number; // 0–100
  confidence: number; // 0–100
  reasoning: string;
};

export type ManagerChecklistDecision = {
  approve: boolean;
  editedAllocationPercent?: number;
  confidence: number; // 0–100
  reasoning: string;
};

function ensureObject(raw: any, label: string): asserts raw is Record<string, unknown> {
  if (raw === null || typeof raw !== 'object' || Array.isArray(raw)) {
    throw new Error(`${label}: expected an object`);
  }
}

function ensureString(value: any, label: string): asserts value is string {
  if (typeof value !== 'string') {
    throw new Error(`${label}: expected a string`);
  }
}

function ensureBoolean(value: any, label: string): asserts value is boolean {
  if (typeof value !== 'boolean') {
    throw new Error(`${label}: expected a boolean`);
  }
}

function ensureNumberInRange(
  value: any,
  label: string,
  min: number,
  max: number
): asserts value is number {
  if (typeof value !== 'number' || Number.isNaN(value)) {
    throw new Error(`${label}: expected a number`);
  }
  if (value < min || value > max) {
    throw new Error(`${label}: must be between ${min} and ${max}`);
  }
}

export function validateWorkerAgentProposal(raw: any): WorkerAgentProposal {
  ensureObject(raw, 'WorkerAgentProposal');

  const { action, symbol, allocationPercent, confidence, reasoning } = raw;

  if (!ALLOWED_ACTIONS.includes(action as WorkerAgentProposal['action'])) {
    throw new Error(
      `WorkerAgentProposal: action must be one of ${ALLOWED_ACTIONS.join(', ')}`
    );
  }

  ensureString(symbol, 'WorkerAgentProposal.symbol');
  ensureNumberInRange(allocationPercent, 'WorkerAgentProposal.allocationPercent', 0, 100);
  ensureNumberInRange(confidence, 'WorkerAgentProposal.confidence', 0, 100);
  ensureString(reasoning, 'WorkerAgentProposal.reasoning');

  return {
    action,
    symbol,
    allocationPercent,
    confidence,
    reasoning,
  };
}

export function validateManagerChecklistDecision(raw: any): ManagerChecklistDecision {
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
    reasoning,
  };
}

