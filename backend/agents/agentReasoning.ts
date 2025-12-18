import { callLLM } from '../ai/llmClient';
import { buildDecisionPrompt } from '../ai/prompts/buildDecisionPrompt';

export type AgentReasoning = {
  reasoning: string;
  proposal: string;
  confidence: number; // 0.0-1.0
};

type AgentReasoningParams = {
  sector: { type?: string; symbol?: string; name?: string; allowedSymbols?: string[]; trendPercent?: number; riskScore?: number };
  sectorData: Record<string, unknown> | unknown;
  agent: { purpose?: string; confidence?: number };
  availableBalance: number;
};

function buildPrompts(params: AgentReasoningParams) {
  const { sector, sectorData, agent, availableBalance } = params;
  const allowedSymbols = Array.isArray(sector.allowedSymbols)
    ? sector.allowedSymbols
    : [sector.symbol, sector.name].filter((sym): sym is string => typeof sym === 'string' && sym.trim() !== '');

  const snapshot = (sectorData && typeof sectorData === 'object') ? sectorData as Record<string, unknown> : {};

  return buildDecisionPrompt({
    sectorName: sector.symbol || sector.name || 'UNKNOWN',
    agentSpecialization: agent.purpose || 'trader',
    agentBrief: agent.purpose,
    allowedSymbols,
    remainingCapital: availableBalance,
    realTimeData: {
      recentPrice: typeof (snapshot as any).currentPrice === 'number' ? (snapshot as any).currentPrice : undefined,
      baselinePrice: typeof (snapshot as any).baselinePrice === 'number' ? (snapshot as any).baselinePrice : undefined,
      trendPercent:
        typeof sector.trendPercent === 'number'
          ? sector.trendPercent
          : (typeof (snapshot as any).changePercent === 'number' ? (snapshot as any).changePercent : undefined),
      volatility: typeof (snapshot as any).volatility === 'number' ? (snapshot as any).volatility : undefined,
      indicators: snapshot,
    },
  });
}

export async function generateAgentReasoning(params: AgentReasoningParams): Promise<AgentReasoning> {
  const { sector, agent } = params;

  const { systemPrompt, userPrompt } = buildPrompts(params);
  const llmResponse = await callLLM({
    systemPrompt,
    userPrompt,
    jsonMode: true,
    useDecisionSystemPrompt: true
  });

  // Parse simple JSON response: { reasoning, proposal, confidence }
  let parsed: { reasoning?: string; proposal?: string; confidence?: number };
  try {
    const cleaned = llmResponse
      .replace(/```json/gi, '')
      .replace(/```/g, '')
      .trim();
    parsed = JSON.parse(cleaned);
  } catch (error) {
    console.error('[agentReasoning] Failed to parse LLM response:', error);
    // Fallback response
    return {
      reasoning: 'Unable to parse agent reasoning response.',
      proposal: 'Maintain current position due to insufficient data.',
      confidence: 0.5,
    };
  }

  // Extract and validate fields
  const reasoning = typeof parsed.reasoning === 'string' && parsed.reasoning.trim().length > 0
    ? parsed.reasoning.trim()
    : 'Agent did not provide reasoning.';

  const proposal = typeof parsed.proposal === 'string' && parsed.proposal.trim().length > 0
    ? parsed.proposal.trim()
    : 'No specific proposal provided.';

  // Validate confidence (0.0-1.0)
  // Confidence MUST be derived solely from the current proposal, not from prior discussions, past confidence, or manager feedback
  let confidence: number;
  if (typeof parsed.confidence === 'number' && Number.isFinite(parsed.confidence)) {
    // Convert from 0-100 scale to 0.0-1.0 if needed, or clamp to 0.0-1.0
    if (parsed.confidence > 1.0) {
      // Likely in 0-100 scale, convert to 0.0-1.0
      confidence = Math.max(0.0, Math.min(1.0, parsed.confidence / 100));
    } else {
      // Already in 0.0-1.0 scale
      confidence = Math.max(0.0, Math.min(1.0, parsed.confidence));
    }
  } else {
    // Default to 0.5 if confidence is missing or invalid
    // DO NOT use agent's last confidence - confidence must be derived from current proposal only
    confidence = 0.5;
  }

  return {
    reasoning,
    proposal,
    confidence,
  };
}


