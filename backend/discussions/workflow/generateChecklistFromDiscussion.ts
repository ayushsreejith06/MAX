import { ChecklistItem, validateChecklistItem } from './checklistBuilder';
import { v4 as uuidv4 } from 'uuid';
import { callLLM } from '../../ai/llmClient';
import { normalizeLLMDecision } from '../../ai/normalizeLLMDecision';

export type GenerateChecklistFromDiscussionParams = {
  discussionId: string;
  messages: Array<{
    id: string;
    agentId: string;
    agentName?: string;
    content: string;
    analysis?: string;
    proposal?: any;
    timestamp?: string;
  }>;
  sector: {
    id: string;
    symbol?: string;
    name?: string;
    allowedSymbols?: string[];
    riskScore?: number;
  };
  sectorData?: Record<string, unknown>;
  availableBalance?: number;
  currentPrice?: number;
};

type ExtractedChecklistItem = {
  action: 'BUY' | 'SELL' | 'HOLD';
  symbol: string;
  allocationPercent: number;
  confidence: number;
  reasoning: string;
};

/**
 * Generates executable checklist items from ALL discussion messages.
 * Feeds the entire discussion to LLM to extract actionable trade proposals.
 * 
 * @param params - Parameters for generating checklist from discussion
 * @returns Array of ChecklistItem objects
 */
export async function generateChecklistFromDiscussion(
  params: GenerateChecklistFromDiscussionParams
): Promise<ChecklistItem[]> {
  const {
    discussionId,
    messages,
    sector,
    sectorData = {},
    availableBalance = 0,
    currentPrice,
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

  // If no messages, return fallback item to ensure non-blocking behavior
  if (!messages || messages.length === 0) {
    console.log(`[generateChecklistFromDiscussion] No messages provided for discussion ${discussionId}, returning fallback item`);
    return [createFallbackChecklistItem(discussionId, normalizedSymbols[0], sectorBalance)];
  }

  // Combine all messages into a discussion summary
  const discussionSummary = messages.map((msg, index) => {
    const agentName = msg.agentName || msg.agentId || 'Agent';
    const content = msg.content || msg.analysis || '';
    const proposal = msg.proposal ? `\nProposal: ${JSON.stringify(msg.proposal)}` : '';
    return `[Message ${index + 1}] ${agentName}: ${content}${proposal}`;
  }).join('\n\n');

  try {
    console.log(`[generateChecklistFromDiscussion] Generating checklist items from ${messages.length} messages for discussion ${discussionId}`);
    
    // Call LLM to extract executable checklist items from the entire discussion
    const systemPrompt = `You are a trading system that analyzes discussion transcripts and extracts executable trade actions.
Your task is to review the entire discussion and generate a list of actionable trade proposals (BUY, SELL, or HOLD) based on the consensus and key insights from the discussion.

Return a JSON array of trade actions. Each action should be a distinct, executable proposal.`;

    const userPrompt = `Analyze the following discussion transcript and extract executable trade actions.

Discussion Transcript:
${discussionSummary}

Sector Information:
- Sector: ${sector.name || sector.symbol || 'UNKNOWN'}
- Allowed Symbols: ${normalizedSymbols.join(', ')}
- Available Balance: $${sectorBalance}
- Current Price: ${currentPrice || 'N/A'}

Generate a JSON array of executable trade actions. Each action must have:
{
  "action": "BUY" | "SELL" | "HOLD",
  "symbol": string (must be one of the allowed symbols),
  "allocationPercent": number (0-100),
  "confidence": number (0-100),
  "reasoning": string (explanation based on the discussion)
}

Return ONLY a JSON array. Example:
[
  {
    "action": "BUY",
    "symbol": "${normalizedSymbols[0]}",
    "allocationPercent": 60,
    "confidence": 75,
    "reasoning": "Based on the discussion, there is strong consensus for buying due to..."
  }
]`;

    const llmResponse = await callLLM({
      systemPrompt,
      userPrompt,
      jsonMode: true,
      maxTokens: 2000
    });

    // Parse JSON response - wrap in try/catch to ensure non-blocking behavior
    let extractedItems: ExtractedChecklistItem[] = [];
    try {
      const parsed = JSON.parse(llmResponse);
      
      // Handle both array and single object responses
      if (Array.isArray(parsed)) {
        extractedItems = parsed;
      } else if (typeof parsed === 'object' && parsed.action) {
        extractedItems = [parsed];
      } else {
        console.warn(`[generateChecklistFromDiscussion] Unexpected LLM response format: ${typeof parsed}, returning fallback item`);
        // Return fallback item instead of empty array
        return [createFallbackChecklistItem(discussionId, normalizedSymbols[0], sectorBalance)];
      }
    } catch (parseError) {
      console.error(`[generateChecklistFromDiscussion] Failed to parse LLM JSON response: ${parseError instanceof Error ? parseError.message : 'Unknown error'}, returning fallback item`);
      // Return fallback item instead of empty array
      return [createFallbackChecklistItem(discussionId, normalizedSymbols[0], sectorBalance)];
    }

    // Convert extracted items to ChecklistItem objects
    const checklistItems: ChecklistItem[] = [];
    
    for (const extracted of extractedItems) {
      // Normalize each extracted item using normalizeLLMDecision - this NEVER throws
      const normalized = normalizeLLMDecision(
        extracted,
        `LLM output could not be parsed for discussion ${discussionId}; defaulting to conservative HOLD position.`
      );

      // Validate symbol - use normalized values from normalizeLLMDecision
      const symbol = (extracted.symbol || normalizedSymbols[0] || 'UNKNOWN').trim().toUpperCase();
      const validSymbol = normalizedSymbols.includes(symbol) ? symbol : normalizedSymbols[0];

      // Calculate amount from allocation percent (using normalized allocationPercent)
      const amount = sectorBalance > 0
        ? (normalized.allocationPercent / 100) * sectorBalance
        : 0;

      // Generate unique ID
      const id = `checklist-${discussionId}-${Date.now()}-${uuidv4().substring(0, 8)}`;

      // Create checklist item payload using normalized values
      const checklistItemPayload: Partial<ChecklistItem> = {
        id,
        sourceAgentId: 'discussion-consensus', // Mark as coming from discussion consensus
        actionType: normalized.action,
        symbol: validSymbol,
        amount,
        allocationPercent: normalized.allocationPercent,
        confidence: normalized.confidence,
        reasoning: normalized.reasoning,
        rationale: normalized.reasoning,
        status: 'PENDING',
      };

      // Validate and add the checklist item
      try {
        const validatedItem = validateChecklistItem(checklistItemPayload, {
          allowedSymbols: normalizedSymbols,
          allowZeroAmount: extracted.action === 'HOLD',
          allowZeroAllocation: extracted.action === 'HOLD',
        });
        
        checklistItems.push(validatedItem);
        console.log(`[generateChecklistFromDiscussion] Created checklist item: ${validatedItem.actionType} ${validatedItem.symbol} (confidence: ${validatedItem.confidence}, allocation: ${validatedItem.allocationPercent}%)`);
      } catch (validationError) {
        // Validation failed - add fallback item instead of skipping
        console.error(`[generateChecklistFromDiscussion] Failed to validate checklist item: ${validationError instanceof Error ? validationError.message : 'Unknown error'}, adding fallback item`);
        checklistItems.push(createFallbackChecklistItem(discussionId, normalizedSymbols[0], sectorBalance));
      }
    }

    // Ensure at least one item is returned (non-blocking behavior)
    if (checklistItems.length === 0) {
      console.warn(`[generateChecklistFromDiscussion] No checklist items generated, returning fallback item`);
      checklistItems.push(createFallbackChecklistItem(discussionId, normalizedSymbols[0], sectorBalance));
    }

    console.log(`[generateChecklistFromDiscussion] Generated ${checklistItems.length} executable checklist items from discussion ${discussionId}`);
    return checklistItems;
  } catch (error) {
    // Any error - return at least one fallback item to ensure non-blocking behavior
    console.error(`[generateChecklistFromDiscussion] Error generating checklist from discussion: ${error instanceof Error ? error.message : 'Unknown error'}, returning fallback item`);
    return [createFallbackChecklistItem(discussionId, normalizedSymbols[0], sectorBalance)];
  }
}

/**
 * Creates a fallback checklist item when parsing fails.
 * Returns HOLD, 0%, confidence 1 to ensure the discussion lifecycle continues.
 */
function createFallbackChecklistItem(
  discussionId: string,
  symbol: string,
  sectorBalance: number
): ChecklistItem {
  const id = `checklist-${discussionId}-fallback-${Date.now()}-${uuidv4().substring(0, 8)}`;
  
  const fallbackPayload: Partial<ChecklistItem> = {
    id,
    sourceAgentId: 'discussion-consensus',
    actionType: 'HOLD',
    symbol,
    amount: 0,
    allocationPercent: 0,
    confidence: 1,
    reasoning: 'LLM output could not be parsed; defaulting to conservative HOLD position.',
    rationale: 'LLM output could not be parsed; defaulting to conservative HOLD position.',
    status: 'PENDING',
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
      sourceAgentId: 'discussion-consensus',
      actionType: 'HOLD',
      symbol: symbol || 'UNKNOWN',
      amount: 0,
      allocationPercent: 0,
      confidence: 1,
      reasoning: 'LLM output could not be parsed; defaulting to conservative HOLD position.',
      rationale: 'LLM output could not be parsed; defaulting to conservative HOLD position.',
      status: 'PENDING',
    };
  }
}

