/**
 * JavaScript wrapper for createChecklistFromLLM.ts
 * Exports function for creating checklist items from LLM messages
 */

// Try to load TypeScript version, fallback to basic implementation if not available
let createChecklistFromLLM;

try {
  // Attempt to load TypeScript version (requires ts-node or similar)
  const tsModule = require('./createChecklistFromLLM.ts');
  createChecklistFromLLM = tsModule.createChecklistFromLLM;
} catch (error) {
  // Fallback: Provide basic implementation if TypeScript can't be loaded
  console.warn('[createChecklistFromLLM] TypeScript module not available, using fallback implementation');
  
  const { parseLLMTradeAction } = require('../../ai/parseLLMTradeAction');
  const { validateLLMTradeAction } = require('../../types/llmAction');
  const { normalizeLLMResponse } = require('../../ai/normalizeLLMResponse');
  const { v4: uuidv4 } = require('uuid');
  const { validateChecklistItem } = require('./checklistBuilder');

  /**
   * Fallback implementation for creating checklist items from LLM messages
   */
  createChecklistFromLLM = async function(params) {
    const {
      messageContent,
      discussionId,
      agentId,
      sector,
      sectorData = {},
      availableBalance = 0,
      currentPrice,
    } = params;

    if (!messageContent || typeof messageContent !== 'string' || messageContent.trim() === '') {
      return null;
    }

    // Determine allowed symbols
    const allowedSymbols = Array.isArray(sector.allowedSymbols) && sector.allowedSymbols.length > 0
      ? sector.allowedSymbols
      : [sector.symbol, sector.name].filter(sym => typeof sym === 'string' && sym.trim() !== '');

    if (allowedSymbols.length === 0) {
      console.warn(`[createChecklistFromLLM] No allowed symbols found for sector ${sector.id}`);
      return null;
    }

    const normalizedSymbols = allowedSymbols.map(s => s.trim().toUpperCase());

    // Prepare parse options
    const parseOptions = {
      fallbackSector: sector.name || sector.symbol || 'UNKNOWN',
      fallbackSymbol: normalizedSymbols[0],
      remainingCapital: availableBalance,
      currentPrice: currentPrice || (typeof sectorData.currentPrice === 'number' ? sectorData.currentPrice : undefined) ||
                     (typeof sectorData.baselinePrice === 'number' ? sectorData.baselinePrice : undefined),
    };

    try {
      // Attempt to parse the message content as a structured trade action
      const parsed = parseLLMTradeAction(messageContent, parseOptions);

      // Validate the parsed response
      const validated = validateLLMTradeAction(parsed, {
        allowedSymbols: normalizedSymbols,
        remainingCapital: availableBalance,
        fallbackSector: sector.name || sector.symbol || 'UNKNOWN',
        fallbackSymbol: normalizedSymbols[0],
        currentPrice: parseOptions.currentPrice,
      });

      // Normalize LLM response before checklist creation
      const normalized = normalizeLLMResponse(validated, {
        sectorRiskProfile: sector.riskScore,
        lastConfidence: params.agentConfidence,
        allowedSymbols: normalizedSymbols,
      });

      // Check if this is a valid trade proposal (BUY, SELL, or HOLD)
      if (!['BUY', 'SELL', 'HOLD'].includes(normalized.actionType)) {
        // Not a valid trade proposal, skip
        return null;
      }

      // Use normalized allocationPercent (already handled by normalization layer)
      const finalAllocationPercent = normalized.allocationPercent ?? 0;

      // Calculate amount from allocation percent
      const amount = availableBalance > 0
        ? (finalAllocationPercent / 100) * availableBalance
        : 0;

      // Generate unique ID
      const id = `checklist-${discussionId}-${agentId}-${Date.now()}-${uuidv4().substring(0, 8)}`;

      // Create checklist item payload
      const checklistItemPayload = {
        id,
        sourceAgentId: agentId,
        actionType: normalized.actionType,
        symbol: normalized.symbol,
        amount,
        allocationPercent: finalAllocationPercent,
        confidence: normalized.confidence,
        reasoning: normalized.reasoning,
        rationale: normalized.reasoning,
        status: 'PENDING', // Using PENDING as ChecklistItem type doesn't support "PROPOSED"
      };

      // Validate and return the checklist item
      return validateChecklistItem(checklistItemPayload, {
        allowedSymbols: normalizedSymbols,
        allowZeroAmount: actionType === 'HOLD',
        allowZeroAllocation: actionType === 'HOLD',
      });
    } catch (error) {
      // If parsing fails, it's not a structured proposal - this is expected for many messages
      // Only log if it's an unexpected error (not just a parse failure)
      if (error instanceof Error && error.message.includes('LLM response is missing required confidence')) {
        // This is a structured proposal but missing required fields - log for debugging
        console.debug(`[createChecklistFromLLM] Message contains structured proposal but missing required fields: ${error.message}`);
      }
      // Silently return null - not all messages will be structured proposals
      return null;
    }
  };
}

module.exports = {
  createChecklistFromLLM,
};

