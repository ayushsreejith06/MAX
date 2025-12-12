/**
 * Normalizes LLM decision outputs to ensure they are always valid and non-blocking.
 * This utility ensures parse failures degrade gracefully without blocking the system.
 * 
 * CRITICAL: This function NEVER throws errors - it always returns a valid decision.
 */

export type NormalizedLLMDecision = {
  action: 'BUY' | 'SELL' | 'HOLD';
  allocationPercent: number; // Clamped to [0, 100]
  confidence: number; // Clamped to [1, 100]
  reasoning: string; // Always non-empty
};

/**
 * Normalizes an LLM decision, clamping values to valid ranges and ensuring
 * a valid action enum. This function NEVER throws - it always returns a valid decision.
 * 
 * @param raw - Raw decision object from LLM (may be malformed)
 * @param fallbackReasoning - Optional custom fallback reasoning message
 * @returns Normalized decision that is always valid and actionable
 */
export function normalizeLLMDecision(
  raw: unknown,
  fallbackReasoning: string = 'LLM output could not be parsed; defaulting to conservative HOLD position.'
): NormalizedLLMDecision {
  // Default fallback decision
  const fallback: NormalizedLLMDecision = {
    action: 'HOLD',
    allocationPercent: 0,
    confidence: 1,
    reasoning: fallbackReasoning,
  };

  // If raw is not an object, return fallback
  if (!raw || typeof raw !== 'object') {
    console.error('[normalizeLLMDecision] Invalid input: not an object', { raw });
    return fallback;
  }

  const obj = raw as Record<string, unknown>;

  // Normalize action - validate enum
  let action: 'BUY' | 'SELL' | 'HOLD' = 'HOLD';
  const rawAction = obj.action || obj.side || obj.tradeAction || obj.actionType;
  if (typeof rawAction === 'string') {
    const normalizedAction = rawAction.trim().toUpperCase();
    if (normalizedAction === 'BUY' || normalizedAction === 'SELL' || normalizedAction === 'HOLD') {
      action = normalizedAction;
    } else {
      console.warn(`[normalizeLLMDecision] Invalid action "${rawAction}", defaulting to HOLD`);
    }
  }

  // Normalize allocationPercent - clamp to [0, 100]
  let allocationPercent = 0;
  const rawAllocation = obj.allocationPercent || obj.allocation_percent || obj.allocation;
  if (typeof rawAllocation === 'number' && Number.isFinite(rawAllocation)) {
    allocationPercent = Math.max(0, Math.min(100, rawAllocation));
  } else if (rawAllocation !== undefined && rawAllocation !== null) {
    console.warn(`[normalizeLLMDecision] Invalid allocationPercent "${rawAllocation}", defaulting to 0`);
  }

  // Normalize confidence - clamp to [1, 100] (minimum 1 to ensure it's actionable)
  let confidence = 1;
  const rawConfidence = obj.confidence;
  if (typeof rawConfidence === 'number' && Number.isFinite(rawConfidence)) {
    confidence = Math.max(1, Math.min(100, rawConfidence));
  } else if (rawConfidence !== undefined && rawConfidence !== null) {
    console.warn(`[normalizeLLMDecision] Invalid confidence "${rawConfidence}", defaulting to 1`);
  }

  // Normalize reasoning - ensure it's always non-empty
  let reasoning = fallbackReasoning;
  const rawReasoning = obj.reasoning || obj.rationale || obj.reason;
  if (typeof rawReasoning === 'string' && rawReasoning.trim().length > 0) {
    reasoning = rawReasoning.trim();
  } else if (rawReasoning !== undefined && rawReasoning !== null) {
    console.warn(`[normalizeLLMDecision] Invalid reasoning, using fallback`);
  }

  return {
    action,
    allocationPercent,
    confidence,
    reasoning,
  };
}

