export type LLMTradeAction = {
  action: 'BUY' | 'SELL' | 'HOLD' | 'REBALANCE';
  amount: number;
  confidence: number;
  reasoning?: string;
  riskScore?: number; // Optional 0-100 risk score from the LLM
};

export type SectorReviewContext = {
  confidenceThreshold?: number;
  allowedRisk?: number; // Optional 0-100 ceiling for acceptable risk
  capital?: number; // Available capital for the sector
  balance?: number; // Alias for capital if exposed that way
};

export type ManagerChecklistReview = {
  autoApproved: boolean;
  needsManagerReview: boolean;
  reason: string;
  checks: {
    confidence: number;
    confidenceThreshold: number;
    reasoningQuality: 'missing' | 'weak' | 'ok';
    riskOk: boolean;
    riskLimit?: number;
    amountRelativeToCapital: number; // 0-1 ratio of capital used
    capitalConsidered: number;
  };
};

function normalizePercent(value: unknown): number {
  if (typeof value !== 'number' || Number.isNaN(value)) {
    return 0;
  }

  // Accept both 0-1 and 0-100 inputs; normalize to 0-100.
  if (value <= 1) {
    return Math.max(0, Math.min(100, value * 100));
  }

  return Math.max(0, Math.min(100, value));
}

function evaluateReasoningQuality(reasoning?: string): 'missing' | 'weak' | 'ok' {
  if (!reasoning || typeof reasoning !== 'string') {
    return 'missing';
  }

  const trimmedLength = reasoning.trim().length;
  if (trimmedLength === 0) {
    return 'missing';
  }

  // Short blurbs are treated as weak; longer, clearer reasoning is acceptable.
  return trimmedLength < 30 ? 'weak' : 'ok';
}

function evaluateRiskAllowance(llmAction: LLMTradeAction, sector: SectorReviewContext): { riskOk: boolean; riskLimit?: number } {
  const riskLimit = normalizePercent(sector.allowedRisk);

  // If no risk ceiling is provided, treat risk as acceptable and defer to manager review details.
  if (!riskLimit) {
    return { riskOk: true, riskLimit: undefined };
  }

  const riskScore = normalizePercent(llmAction.riskScore);
  // Missing risk score means the manager must review.
  if (riskScore === 0 && llmAction.riskScore === undefined) {
    return { riskOk: false, riskLimit };
  }

  return { riskOk: riskScore <= riskLimit, riskLimit };
}

function computeAmountRatio(llmAction: LLMTradeAction, sector: SectorReviewContext): { ratio: number; capital: number } {
  const capital = typeof sector.capital === 'number' ? sector.capital : typeof sector.balance === 'number' ? sector.balance : 0;
  if (capital <= 0) {
    return { ratio: 1, capital: 0 }; // Unknown capital -> treat as full allocation to force review context
  }

  const ratio = llmAction.amount > 0 ? llmAction.amount / capital : 0;
  return { ratio, capital };
}

/**
 * Review a single checklist item produced by an LLM trade action.
 * Auto-approves when the LLM confidence meets the sector confidence threshold.
 * Otherwise, flags the item for manager review with supporting check details.
 */
export function reviewChecklistItem(params: {
  llmAction: LLMTradeAction;
  sector: SectorReviewContext;
}): ManagerChecklistReview {
  const { llmAction, sector } = params;

  const confidence = normalizePercent(llmAction.confidence);
  const confidenceThreshold = normalizePercent(sector.confidenceThreshold);

  // New auto-approval rule: confidence gate only.
  if (confidence >= confidenceThreshold) {
    const { ratio, capital } = computeAmountRatio(llmAction, sector);
    return {
      autoApproved: true,
      needsManagerReview: false,
      reason: `Auto-approved: confidence ${confidence.toFixed(1)} >= threshold ${confidenceThreshold.toFixed(1)}.`,
      checks: {
        confidence,
        confidenceThreshold,
        reasoningQuality: evaluateReasoningQuality(llmAction.reasoning),
        riskOk: true,
        amountRelativeToCapital: ratio,
        capitalConsidered: capital,
      },
    };
  }

  // Confidence below threshold → manager must review the qualitative and risk checks.
  const reasoningQuality = evaluateReasoningQuality(llmAction.reasoning);
  const { riskOk, riskLimit } = evaluateRiskAllowance(llmAction, sector);
  const { ratio, capital } = computeAmountRatio(llmAction, sector);

  return {
    autoApproved: false,
    needsManagerReview: true,
    reason: 'Confidence below threshold; manager review required for reasoning quality, risk, and sizing versus capital.',
    checks: {
      confidence,
      confidenceThreshold,
      reasoningQuality,
      riskOk,
      riskLimit,
      amountRelativeToCapital: ratio,
      capitalConsidered: capital,
    },
  };
}

