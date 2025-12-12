import { callLLM } from './llmClient';
import { validateWorkerAgentProposal, WorkerAgentProposal } from './agentSchemas';

type SectorType = 'crypto' | 'equities' | 'forex' | 'commodities' | 'other';

type GenerateWorkerProposalParams = {
  agentProfile: {
    name: string;
    roleDescription: string;
  };
  sectorState: {
    sectorName: string;
    sectorType: SectorType;
    simulatedPrice: number;
    baselinePrice: number;
    volatility: number;
    trendDescriptor: string;
    balance?: number;
    indicators?: Record<string, number | string>;
  };
  purpose?: string;
};

const SYSTEM_PROMPT =
  'You are MAX Trading LLM. You always output JSON. You must produce a single actionable trade relevant to the sector. Your response must NOT exceed 120 characters outside JSON.';

function buildUserPrompt(params: GenerateWorkerProposalParams): string {
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

function validateTradeJson(raw: any, sectorState: GenerateWorkerProposalParams['sectorState']) {
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

function mapTradeToWorkerProposal(
  trade: { action: WorkerAgentProposal['action']; amount: number; confidence: number; rationale: string },
  sectorState: GenerateWorkerProposalParams['sectorState']
): WorkerAgentProposal {
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

export async function generateWorkerProposal(
  params: GenerateWorkerProposalParams
): Promise<WorkerAgentProposal> {
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
