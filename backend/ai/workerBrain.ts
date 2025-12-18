import { generateAgentReasoning, AgentReasoning } from '../agents/agentReasoning';

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
    allowedSymbols?: string[];
    trendPercent?: number;
    riskScore?: number; // Sector risk profile (0-100)
  };
  purpose?: string;
  agentConfidence?: number; // Agent's last confidence (0-100)
};

/**
 * Plain text proposal type - no structured actions
 */
export type WorkerAgentProposal = {
  reasoning: string;
  proposal: string;
  confidence: number; // 0.0-1.0
};

function parseTrendPercent(trendDescriptor?: string | number): number | undefined {
  if (typeof trendDescriptor === 'number' && Number.isFinite(trendDescriptor)) {
    return trendDescriptor;
  }
  if (typeof trendDescriptor === 'string') {
    const match = trendDescriptor.match(/-?\d+(\.\d+)?/);
    if (match) {
      const parsed = Number(match[0]);
      if (Number.isFinite(parsed)) {
        return parsed;
      }
    }
  }
  return undefined;
}

/**
 * Generate a plain text proposal from an agent.
 * Returns only reasoning, proposal (plain text), and confidence (0.0-1.0).
 * No structured actions, no BUY/SELL/HOLD labels, no execution semantics.
 */
export async function generateWorkerProposal(
  params: GenerateWorkerProposalParams
): Promise<WorkerAgentProposal> {
  try {
    const { sectorState, purpose, agentProfile } = params;
    const trendPercent = typeof sectorState.trendPercent === 'number'
      ? sectorState.trendPercent
      : parseTrendPercent(sectorState.trendDescriptor);

    // Use generateAgentReasoning which returns plain text only
    const agentReasoning = await generateAgentReasoning({
      sector: {
        type: sectorState.sectorType,
        symbol: sectorState.sectorName,
        name: sectorState.sectorName,
        allowedSymbols: Array.isArray(sectorState.allowedSymbols) ? sectorState.allowedSymbols : [],
        trendPercent,
        riskScore: sectorState.riskScore,
      },
      sectorData: {
        currentPrice: sectorState.simulatedPrice,
        baselinePrice: sectorState.baselinePrice,
        changePercent: trendPercent,
        volatility: sectorState.volatility,
        ...(sectorState.indicators ?? {}),
      },
      agent: {
        purpose: purpose ?? agentProfile.roleDescription,
        confidence: params.agentConfidence,
      },
      availableBalance: sectorState.balance ?? 0,
    });

    // Return plain text proposal - no structured actions
    return {
      reasoning: agentReasoning.reasoning,
      proposal: agentReasoning.proposal,
      confidence: agentReasoning.confidence, // Already 0.0-1.0 from generateAgentReasoning
    };
  } catch (error) {
    // Bubble up to let the discussion workflow handle invalid JSON/output.
    throw error;
  }
}
