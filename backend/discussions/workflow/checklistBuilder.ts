/**
 * Canonical ChecklistAction shape used everywhere.
 * Represents structured, executable AI decisions instead of descriptive summaries.
 */
export type ChecklistAction = {
  action: 'BUY' | 'SELL' | 'HOLD';
  symbol: string;
  allocationPercent: number; // 0–100
  confidence: number; // 0–100
  rationale: string; // short reasoning text (1–2 sentences, concise)
};

/**
 * Strict executable payload for checklist items.
 * Items MUST be created from ChecklistAction objects, never from text summaries.
 * The UI may display a readable summary, but the backend MUST persist this executable form.
 */
export type ChecklistItem = {
  id: string;
  sourceAgentId: string;
  actionType: 'BUY' | 'SELL' | 'HOLD';
  symbol: string;
  amount: number; // Legacy field - kept for backward compatibility
  allocationPercent: number; // 0–100 (primary field)
  confidence: number; // 0–100
  reasoning: string; // Alias for rationale
  rationale: string; // Primary field (1–2 sentences, concise)
  status: 'PENDING' | 'APPROVED' | 'REJECTED' | 'REVISE_REQUIRED' | 'ACCEPT_REJECTION' | 'RESUBMITTED';
};

type AllowedAction = 'BUY' | 'SELL' | 'HOLD' | 'REBALANCE';

type BuildChecklistTradeParams = {
  sector: {
    id: string;
    type?: string;
    symbol?: string;
    name?: string;
    allowedSymbols?: string[];
    trendPercent?: number;
  };
  sectorData: Record<string, unknown> | unknown;
  agent: { id: string; purpose?: string };
  availableBalance: number;
};

/**
 * Validation options for checklist items
 */
export type ValidateChecklistItemOptions = {
  allowedSymbols: string[];
  allowZeroAmount?: boolean; // For HOLD actions
  allowZeroAllocation?: boolean; // For HOLD actions
};

/**
 * Validates a checklist item against strict rules.
 * Throws an error if validation fails.
 */
export function validateChecklistItem(
  item: Partial<ChecklistItem>,
  options: ValidateChecklistItemOptions,
): ChecklistItem {
  // Validate required fields
  if (!item.id || typeof item.id !== 'string' || item.id.trim() === '') {
    throw new Error('ChecklistItem.id is required and must be a non-empty string');
  }

  if (!item.sourceAgentId || typeof item.sourceAgentId !== 'string' || item.sourceAgentId.trim() === '') {
    throw new Error('ChecklistItem.sourceAgentId is required and must be a non-empty string');
  }

  if (!item.actionType || !['BUY', 'SELL', 'HOLD'].includes(item.actionType)) {
    throw new Error('ChecklistItem.actionType must be one of: BUY, SELL, HOLD');
  }

  if (!item.symbol || typeof item.symbol !== 'string' || item.symbol.trim() === '') {
    throw new Error('ChecklistItem.symbol is required and must be a non-empty string');
  }

  // Validate symbol is in allowed symbols
  const normalizedSymbol = item.symbol.trim().toUpperCase();
  const normalizedAllowedSymbols = options.allowedSymbols.map(s => s.trim().toUpperCase());
  if (!normalizedAllowedSymbols.includes(normalizedSymbol)) {
    throw new Error(
      `ChecklistItem.symbol "${item.symbol}" must be one of: ${options.allowedSymbols.join(', ')}`,
    );
  }

  // Validate allocationPercent (primary field)
  if (typeof item.allocationPercent !== 'number' || !Number.isFinite(item.allocationPercent)) {
    throw new Error('ChecklistItem.allocationPercent must be a finite number');
  }

  if (item.allocationPercent < 0 || item.allocationPercent > 100) {
    throw new Error('ChecklistItem.allocationPercent must be in range [0, 100]');
  }

  const allowZeroAllocation = options.allowZeroAllocation ?? item.actionType === 'HOLD';
  if (!allowZeroAllocation && item.allocationPercent <= 0) {
    throw new Error(`ChecklistItem.allocationPercent must be > 0 for actionType "${item.actionType}"`);
  }

  // Validate amount (legacy field - kept for backward compatibility)
  // If not provided, derive from allocationPercent
  let amount = item.amount;
  if (typeof amount !== 'number' || !Number.isFinite(amount) || amount < 0) {
    // Amount will be calculated from allocationPercent when needed
    amount = 0;
  }

  // Validate confidence
  if (typeof item.confidence !== 'number' || !Number.isFinite(item.confidence)) {
    throw new Error('ChecklistItem.confidence must be a finite number');
  }

  if (item.confidence < 0 || item.confidence > 100) {
    throw new Error('ChecklistItem.confidence must be in range [0, 100]');
  }

  // Validate rationale (primary field) or reasoning (alias)
  const rationale = item.rationale || item.reasoning || '';
  if (!rationale || typeof rationale !== 'string' || rationale.trim() === '') {
    throw new Error('ChecklistItem.rationale (or reasoning) is required and must be a non-empty string');
  }

  // Validate status (default to PENDING if not provided)
  const validStatuses = ['PENDING', 'APPROVED', 'REJECTED', 'REVISE_REQUIRED', 'ACCEPT_REJECTION', 'RESUBMITTED'];
  const status = item.status || 'PENDING';
  if (!validStatuses.includes(status)) {
    throw new Error(`ChecklistItem.status must be one of: ${validStatuses.join(', ')}`);
  }

  const rationale = (item.rationale || item.reasoning || '').trim();
  
  return {
    id: item.id,
    sourceAgentId: item.sourceAgentId,
    actionType: item.actionType,
    symbol: normalizedSymbol,
    amount: amount, // Legacy field
    allocationPercent: item.allocationPercent,
    confidence: item.confidence,
    reasoning: rationale, // Alias for rationale
    rationale: rationale, // Primary field
    status,
  };
}

function clampAmount(amount: number, availableBalance: number): number {
  if (!Number.isFinite(amount) || amount < 0) {
    throw new Error('LLM trade amount invalid or missing.');
  }
  const maxBalance = Math.max(availableBalance, 0);
  if (maxBalance === 0) {
    return 0;
  }
  return Math.min(amount, maxBalance);
}

/**
 * Generates a human-readable description from an executable checklist item.
 * This is for UI display only - the backend stores only the executable payload.
 */
export function formatChecklistItemDescription(item: ChecklistItem): string {
  const allocationStr = item.allocationPercent > 0 ? `${item.allocationPercent}%` : '0%';
  const rationale = item.rationale || item.reasoning || 'No rationale';
  return `${item.actionType} ${allocationStr} of ${item.symbol} (confidence: ${item.confidence}%) - ${rationale}`;
}

/**
 * Deterministic placeholder logic that generates ChecklistAction objects.
 * This resembles LLM output but respects the ChecklistAction structure.
 * 
 * TODO: Replace with real LLM calls when ready.
 */
function generateDeterministicChecklistAction(params: {
  sector: BuildChecklistTradeParams['sector'];
  sectorData: Record<string, unknown>;
  agent: BuildChecklistTradeParams['agent'];
  availableBalance: number;
  allowedSymbols: string[];
}): ChecklistAction {
  const { sector, sectorData, agent, allowedSymbols } = params;
  
  // Select symbol from allowed symbols (deterministic based on agent ID hash)
  const symbolIndex = Math.abs(
    agent.id.split('').reduce((acc, char) => acc + char.charCodeAt(0), 0)
  ) % allowedSymbols.length;
  const symbol = allowedSymbols[symbolIndex] || allowedSymbols[0] || sector.symbol || sector.name || 'UNKNOWN';
  
  // Extract market data
  const trendPercent = typeof sector.trendPercent === 'number' 
    ? sector.trendPercent 
    : (typeof sectorData.changePercent === 'number' ? sectorData.changePercent : 0);
  const volatility = typeof sectorData.volatility === 'number' ? sectorData.volatility : 0.2;
  
  // Deterministic action selection based on trend and volatility
  let action: 'BUY' | 'SELL' | 'HOLD';
  if (trendPercent > 5 && volatility < 0.3) {
    action = 'BUY';
  } else if (trendPercent < -5 && volatility < 0.3) {
    action = 'SELL';
  } else {
    action = 'HOLD';
  }
  
  // Allocation percent: 10-30% for BUY/SELL, 0% for HOLD
  let allocationPercent: number;
  if (action === 'HOLD') {
    allocationPercent = 0;
  } else {
    // Deterministic allocation between 10-30% based on confidence
    const baseAllocation = 10;
    const confidenceFactor = Math.min(Math.max(Math.abs(trendPercent) / 10, 0), 1);
    allocationPercent = Math.round(baseAllocation + (confidenceFactor * 20));
    allocationPercent = Math.min(Math.max(allocationPercent, 10), 30);
  }
  
  // Confidence: 50-90% based on trend strength and volatility
  const trendStrength = Math.min(Math.abs(trendPercent) / 10, 1);
  const volatilityPenalty = Math.max(0, (volatility - 0.2) * 50);
  const confidence = Math.round(50 + (trendStrength * 40) - volatilityPenalty);
  const clampedConfidence = Math.min(Math.max(confidence, 50), 90);
  
  // Generate concise rationale (1-2 sentences)
  let rationale: string;
  if (action === 'BUY') {
    rationale = `Positive trend (${trendPercent.toFixed(1)}%) with moderate volatility suggests buying opportunity.`;
  } else if (action === 'SELL') {
    rationale = `Negative trend (${trendPercent.toFixed(1)}%) indicates potential downside risk.`;
  } else {
    rationale = `Market conditions are neutral; maintaining current position is prudent.`;
  }
  
  return {
    action,
    symbol: symbol.toUpperCase(),
    allocationPercent,
    confidence: clampedConfidence,
    rationale,
  };
}

/**
 * Builds a checklist item from a ChecklistAction.
 * This is the ONLY way to create checklist items - they MUST come from ChecklistAction objects.
 * 
 * @throws Error if ChecklistAction cannot be validated
 */
export async function buildChecklistTrade(params: BuildChecklistTradeParams): Promise<ChecklistItem> {
  const { sector, sectorData, agent, availableBalance } = params;

  const allowedSymbols = Array.isArray(sector.allowedSymbols)
    ? sector.allowedSymbols
    : [sector.symbol, sector.name].filter((sym): sym is string => typeof sym === 'string' && sym.trim() !== '');

  if (allowedSymbols.length === 0) {
    throw new Error('No allowed symbols found for sector');
  }

  const normalizedSymbols = allowedSymbols.map(s => s.trim().toUpperCase());
  const snapshot = sectorData && typeof sectorData === 'object' ? (sectorData as Record<string, unknown>) : {};

  // Generate deterministic ChecklistAction (placeholder logic)
  const checklistAction = generateDeterministicChecklistAction({
    sector,
    sectorData: snapshot,
    agent,
    availableBalance,
    allowedSymbols: normalizedSymbols,
  });

  // Convert ChecklistAction to ChecklistItem
  const actionType = checklistAction.action;
  const allocationPercent = checklistAction.allocationPercent;
  const amount = (allocationPercent / 100) * availableBalance; // Calculate amount from allocation percent
  const confidence = checklistAction.confidence;
  const rationale = checklistAction.rationale;

  // Generate unique ID
  const id = `checklist-${sector.id}-${agent.id}-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;

  // Create executable payload
  const executablePayload: Partial<ChecklistItem> = {
    id,
    sourceAgentId: agent.id,
    actionType,
    symbol: checklistAction.symbol,
    amount,
    allocationPercent,
    confidence,
    reasoning: rationale,
    rationale,
    status: 'PENDING',
  };

  // Validate the payload
  return validateChecklistItem(executablePayload, {
    allowedSymbols: normalizedSymbols,
    allowZeroAmount: actionType === 'HOLD',
    allowZeroAllocation: actionType === 'HOLD',
  });
}

/**
 * Demo function that creates a checklist item from a sample ChecklistAction.
 * This demonstrates the proper flow: ChecklistAction -> ChecklistItem -> validate.
 */
export function demoChecklistItemFromSample(): ChecklistItem {
  const sampleCapital = 10_000;
  
  // Create a sample ChecklistAction
  const sampleAction: ChecklistAction = {
    action: 'BUY',
    symbol: 'NVDA',
    allocationPercent: 20,
    confidence: 75,
    rationale: 'Strong momentum with moderate volatility suggests buying opportunity.',
  };

  // Convert ChecklistAction to ChecklistItem
  const amount = (sampleAction.allocationPercent / 100) * sampleCapital;
  
  const executablePayload: Partial<ChecklistItem> = {
    id: 'demo-checklist-item-1',
    sourceAgentId: 'demo-agent',
    actionType: sampleAction.action,
    symbol: sampleAction.symbol,
    amount,
    allocationPercent: sampleAction.allocationPercent,
    confidence: sampleAction.confidence,
    reasoning: sampleAction.rationale,
    rationale: sampleAction.rationale,
    status: 'PENDING',
  };

  // Validate and return
  return validateChecklistItem(executablePayload, {
    allowedSymbols: ['NVDA'],
    allowZeroAmount: sampleAction.action === 'HOLD',
    allowZeroAllocation: sampleAction.action === 'HOLD',
  });
}


