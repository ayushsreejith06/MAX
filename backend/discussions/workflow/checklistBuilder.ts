import { callLLM } from '../../ai/llmClient';

type AllowedAction = 'BUY' | 'SELL' | 'HOLD' | 'REBALANCE';

export type ChecklistTrade = {
  action: AllowedAction;
  amount: number;
  confidence: number;
  rationale: string;
};

type BuildChecklistTradeParams = {
  sector: { type?: string };
  sectorData: unknown;
  agent: { purpose?: string };
  availableBalance: number;
};

function sanitizeAmount(rawAmount: any, availableBalance: number): number {
  const parsed = typeof rawAmount === 'number' ? rawAmount : Number(rawAmount);
  if (!Number.isFinite(parsed) || parsed < 0) {
    return 0;
  }
  return Math.min(parsed, Math.max(availableBalance, 0));
}

function validateAction(rawAction: any): AllowedAction {
  const action = typeof rawAction === 'string' ? rawAction.toUpperCase() : '';
  if (action === 'BUY' || action === 'SELL' || action === 'HOLD' || action === 'REBALANCE') {
    return action;
  }
  throw new Error('LLM trade action invalid or missing.');
}

function validateConfidence(rawConfidence: any): number {
  const confidence = typeof rawConfidence === 'number' ? rawConfidence : Number(rawConfidence);
  if (!Number.isFinite(confidence)) {
    throw new Error('LLM trade confidence invalid or missing.');
  }
  // Clamp to a sensible range [0,1]
  return Math.min(Math.max(confidence, 0), 1);
}

export async function buildChecklistTrade(params: BuildChecklistTradeParams): Promise<ChecklistTrade> {
  const { sector, sectorData, agent, availableBalance } = params;

  const llmResponse = await callLLM({
    systemPrompt: `
You are MAX Trading LLM. You output ONLY JSON.
Produce one actionable trade relevant to the sector.
Short, precise, no paragraphs.
`,
    userPrompt: `
Sector type: ${sector.type}
Sector data snapshot (indicators, prices, trend, volatility):
${JSON.stringify(sectorData)}

Agent purpose: "${agent.purpose}"

Generate a JSON trade object:

{
  "action": "BUY" | "SELL" | "HOLD" | "REBALANCE",
  "amount": number,
  "confidence": number,
  "rationale": "short explanation"
}

Rules:
- Must be SECTOR-RELEVANT.
- Amount <= available balance.
- Confidence is based on sector data.
- NO text outside JSON.
`,
    jsonMode: true
  });

  const parsed = JSON.parse(llmResponse);

  const action = validateAction(parsed?.action);
  const amount = sanitizeAmount(parsed?.amount, availableBalance);
  const confidence = validateConfidence(parsed?.confidence);
  const rationale = typeof parsed?.rationale === 'string' ? parsed.rationale.trim() : '';

  if (!rationale) {
    throw new Error('LLM trade rationale missing.');
  }

  return {
    action,
    amount,
    confidence,
    rationale
  };
}


