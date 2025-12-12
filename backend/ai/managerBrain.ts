import { callLLM } from './llmClient';
import {
  ManagerChecklistDecision,
  WorkerAgentProposal,
  validateManagerChecklistDecision,
} from './agentSchemas';

type EvaluateChecklistItemParams = {
  managerProfile: {
    name: string;
    sectorGoal: string;
    riskTolerance: 'low' | 'medium' | 'high';
  };
  sectorState: {
    sectorName: string;
    sectorType: 'crypto' | 'equities' | 'forex' | 'commodities' | 'other';
    simulatedPrice: number;
    baselinePrice: number;
    volatility: number;
    trendDescriptor: string;
    balance?: number;
    indicators?: Record<string, number | string>;
  };
  workerProposal: WorkerAgentProposal;
};

const SYSTEM_PROMPT =
  'You are MAX Trading LLM. You always output JSON. You must produce a single actionable trade relevant to the sector. Your response must NOT exceed 120 characters outside JSON.';

function buildUserPrompt(params: EvaluateChecklistItemParams): string {
  const { sectorState, managerProfile, workerProposal } = params;
  const sectorData = {
    sectorState,
    managerProfile,
    workerProposal,
    indicators: sectorState.indicators ?? {},
  };

  return `Generate a trading action for sector=${sectorState.sectorType} using this data snapshot=${JSON.stringify(
    sectorData
  )} and agentGoal=${managerProfile.sectorGoal}.`;
}

function validateTradeJson(raw: any, sectorState: EvaluateChecklistItemParams['sectorState']) {
  if (raw === null || typeof raw !== 'object' || Array.isArray(raw)) {
    throw new Error('LLM response must be a JSON object');
  }

  const { action, amount, confidence, rationale } = raw as Record<string, any>;
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

function mapTradeToDecision(
  trade: { action: WorkerAgentProposal['action']; amount: number; confidence: number; rationale: string },
  sectorState: EvaluateChecklistItemParams['sectorState']
): ManagerChecklistDecision {
  const editedAllocationPercent =
    sectorState.balance && sectorState.balance > 0 ? Math.min(100, (trade.amount / sectorState.balance) * 100) : 0;

  const approve = trade.action !== 'HOLD' && trade.amount > 0;

  return validateManagerChecklistDecision({
    approve,
    editedAllocationPercent,
    confidence: trade.confidence,
    reasoning: trade.rationale,
  });
}

export async function evaluateChecklistItem(
  params: EvaluateChecklistItemParams,
): Promise<ManagerChecklistDecision> {
  const { workerProposal } = params;

  try {
    const raw = await callLLM({
      systemPrompt: SYSTEM_PROMPT,
      userPrompt: buildUserPrompt(params),
      jsonMode: true,
    });

    const parsed = JSON.parse(raw);
    const trade = validateTradeJson(parsed, params.sectorState);
    return mapTradeToDecision(trade, params.sectorState);
  } catch (error) {
    console.error('[managerBrain] Invalid JSON or LLM error:', error);
    // Bubble up to allow the discussion workflow to handle invalid output.
    throw error;
  }
}

