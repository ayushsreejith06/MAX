import { ChecklistItem, validateChecklistItem } from './checklistBuilder';
import { v4 as uuidv4 } from 'uuid';
import { normalizeLLMDecision } from '../../ai/normalizeLLMDecision';

/**
 * Structured proposal object that MUST be provided by the LLM.
 * This is the ONLY source of truth for checklist item creation.
 */
export type StructuredProposal = {
  action: 'BUY' | 'SELL' | 'HOLD';
  allocationPercent: number; // 0-100
  confidence: number; // 0-100
  reasoning: string | string[]; // Can be string or array of strings
  riskNotes?: string | string[]; // Optional risk assessment notes
};

export type CreateChecklistFromLLMParams = {
  proposal: StructuredProposal; // REQUIRED: Structured proposal object from LLM
  discussionId: string;
  agentId: string;
  agentName?: string; // Agent name for sourceAgent
  sector: {
    id: string;
    symbol?: string;
    name?: string;
    allowedSymbols?: string[];
    riskScore?: number; // Sector risk profile (0-100)
  };
  sectorData?: Record<string, unknown>;
  availableBalance?: number;
  currentPrice?: number;
  agentConfidence?: number; // Agent's last confidence (0-100)
};

/**
 * Creates a checklist item from a structured proposal object.
 * This function ONLY accepts structured proposal objects - never parses message text.
 * 
 * If the proposal cannot be parsed or validated, a fallback checklist item is created.
 * 
 * @param params - Parameters for creating checklist item from structured proposal
 * @returns ChecklistItem (always returns a valid item, even if fallback is used)
 */
export async function createChecklistFromLLM(
  params: CreateChecklistFromLLMParams
): Promise<ChecklistItem> {
  const {
    proposal,
    discussionId,
    agentId,
    agentName,
    sector,
    sectorData = {},
    availableBalance = 0,
  } = params;

  // Determine allowed symbols
  const allowedSymbols = Array.isArray(sector.allowedSymbols) && sector.allowedSymbols.length > 0
    ? sector.allowedSymbols
    : [sector.symbol, sector.name].filter((sym): sym is string => typeof sym === 'string' && sym.trim() !== '');

  // If no allowed symbols, use a default
  const normalizedSymbols = allowedSymbols.length > 0
    ? allowedSymbols.map(s => s.trim().toUpperCase())
    : ['UNKNOWN'];

  const sectorBalance = typeof availableBalance === 'number' && availableBalance > 0 ? availableBalance : 0;

  try {
    // Normalize the proposal object using normalizeLLMDecision - this NEVER throws
    const normalized = normalizeLLMDecision(
      proposal,
      `LLM output could not be parsed for agent ${agentId}; defaulting to conservative HOLD position.`
    );

    // Extract riskNotes if present (optional field)
    let riskNotes: string | undefined;
    if (proposal && typeof proposal === 'object' && 'riskNotes' in proposal) {
      const rawRiskNotes = (proposal as any).riskNotes;
      if (Array.isArray(rawRiskNotes)) {
        riskNotes = rawRiskNotes.join(' ').trim();
      } else if (typeof rawRiskNotes === 'string') {
        riskNotes = rawRiskNotes.trim();
      }
    }

    const extractedAction: {
      action: 'BUY' | 'SELL' | 'HOLD';
      allocationPercent: number;
      confidence: number;
      reasoning: string;
      riskNotes?: string;
    } = {
      action: normalized.action,
      allocationPercent: normalized.allocationPercent,
      confidence: normalized.confidence,
      reasoning: normalized.reasoning,
      riskNotes,
    };

    // Calculate amount from allocation percent
    const amount = sectorBalance > 0
      ? (extractedAction.allocationPercent / 100) * sectorBalance
      : 0;

    // Generate unique ID
    const id = `checklist-${discussionId}-${agentId}-${Date.now()}-${uuidv4().substring(0, 8)}`;

    // Create checklist item payload
    const checklistItemPayload: Partial<ChecklistItem> = {
      id,
      sourceAgentId: agentId,
      discussionId: discussionId, // Include discussionId as required field
      actionType: extractedAction.action,
      symbol: normalizedSymbols[0], // Use first allowed symbol
      amount,
      allocationPercent: extractedAction.allocationPercent,
      confidence: extractedAction.confidence,
      reasoning: extractedAction.reasoning,
      rationale: extractedAction.reasoning,
      status: 'PENDING',
    };

    // Validate and return the checklist item
    try {
      const validatedItem = validateChecklistItem(checklistItemPayload, {
        allowedSymbols: normalizedSymbols,
        allowZeroAmount: extractedAction.action === 'HOLD',
        allowZeroAllocation: extractedAction.action === 'HOLD',
      });
      
      console.log(`[createChecklistFromLLM] Checklist item created successfully: ${validatedItem.actionType} ${validatedItem.symbol} (confidence: ${validatedItem.confidence}, allocation: ${validatedItem.allocationPercent}%) for agent ${agentId} in discussion ${discussionId}`);
      return validatedItem;
    } catch (validationError) {
      // Validation failed - create fallback checklist item
      console.error(`[createChecklistFromLLM] Failed to validate checklist item for agent ${agentId} in discussion ${discussionId}: ${validationError instanceof Error ? validationError.message : 'Unknown error'}. Creating fallback checklist item.`);
      return createFallbackChecklistItem(discussionId, agentId, agentName, normalizedSymbols[0]);
    }
  } catch (error) {
    // Any other error - create fallback checklist item
    console.error(`[createChecklistFromLLM] Error creating checklist item for agent ${agentId} in discussion ${discussionId}: ${error instanceof Error ? error.message : 'Unknown error'}. Creating fallback checklist item.`);
    return createFallbackChecklistItem(discussionId, agentId, agentName, normalizedSymbols[0]);
  }
}

/**
 * Creates a fallback checklist item when parsing fails.
 * This ensures a checklist item is ALWAYS created, even if the LLM output is malformed.
 * Returns HOLD, 0%, confidence 1, marked as REJECTED with reason "Unparseable LLM output".
 */
function createFallbackChecklistItem(
  discussionId: string,
  agentId: string,
  agentName?: string,
  symbol: string = 'UNKNOWN'
): ChecklistItem {
  const id = `checklist-${discussionId}-${agentId}-${Date.now()}-${uuidv4().substring(0, 8)}`;
  
  const fallbackPayload: Partial<ChecklistItem> = {
    id,
    sourceAgentId: agentId,
    discussionId: discussionId, // Include discussionId as required field
    actionType: 'HOLD',
    symbol,
    amount: 0,
    allocationPercent: 0,
    confidence: 1,
    reasoning: 'Unparseable LLM output',
    rationale: 'Unparseable LLM output',
    status: 'REJECTED',
  };

  // Try to validate, but if it fails, return a minimal valid item
  try {
    return validateChecklistItem(fallbackPayload, {
      allowedSymbols: [symbol],
      allowZeroAmount: true,
      allowZeroAllocation: true,
    });
  } catch (validationError) {
    // If even validation fails, return a minimal valid item
    console.error(`[createFallbackChecklistItem] Fallback validation failed: ${validationError instanceof Error ? validationError.message : 'Unknown error'}`);
    return {
      id,
      sourceAgentId: agentId,
      discussionId: discussionId, // Include discussionId as required field
      actionType: 'HOLD',
      symbol: symbol || 'UNKNOWN',
      amount: 0,
      allocationPercent: 0,
      confidence: 1,
      reasoning: 'Unparseable LLM output',
      rationale: 'Unparseable LLM output',
      status: 'REJECTED',
    };
  }
}


