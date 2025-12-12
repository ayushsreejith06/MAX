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
  
  const { callLLM } = require('../../ai/llmClient');
  const { v4: uuidv4 } = require('uuid');
  const { validateChecklistItem } = require('./checklistBuilder');
  const { normalizeLLMDecision } = require('../../ai/normalizeLLMDecision');

  /**
   * Fallback implementation for creating checklist items from structured proposal objects.
   * This matches the TypeScript interface - accepts a proposal object, never parses message text.
   */
  createChecklistFromLLM = async function(params) {
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
      : [sector.symbol, sector.name].filter(sym => typeof sym === 'string' && sym.trim() !== '');

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

      const extractedAction = {
        action: normalized.action,
        allocationPercent: normalized.allocationPercent,
        confidence: normalized.confidence,
        reasoning: normalized.reasoning,
      };

      // Calculate amount from allocation percent
      const amount = sectorBalance > 0
        ? (extractedAction.allocationPercent / 100) * sectorBalance
        : 0;

      // Generate unique ID
      const id = `checklist-${discussionId}-${agentId}-${Date.now()}-${uuidv4().substring(0, 8)}`;

      // Create checklist item payload
      const checklistItemPayload = {
        id,
        sourceAgentId: agentId,
        actionType: extractedAction.action,
        symbol: normalizedSymbols[0],
        amount,
        allocationPercent: extractedAction.allocationPercent,
        confidence: extractedAction.confidence,
        reasoning: extractedAction.reasoning,
        rationale: extractedAction.reasoning,
        status: 'PENDING',
      };

      // Validate and return the checklist item
      try {
        return validateChecklistItem(checklistItemPayload, {
          allowedSymbols: normalizedSymbols,
          allowZeroAmount: extractedAction.action === 'HOLD',
          allowZeroAllocation: extractedAction.action === 'HOLD',
        });
      } catch (validationError) {
        console.error(`[createChecklistFromLLM] Failed to validate checklist item: ${validationError instanceof Error ? validationError.message : 'Unknown error'}. Creating fallback checklist item.`);
        return createFallbackChecklistItem(discussionId, agentId, normalizedSymbols[0], sectorBalance);
      }
    } catch (error) {
      console.error(`[createChecklistFromLLM] Error creating checklist item: ${error instanceof Error ? error.message : 'Unknown error'}. Creating fallback checklist item.`);
      return createFallbackChecklistItem(discussionId, agentId, normalizedSymbols[0], sectorBalance);
    }
  };

  /**
   * Creates a fallback checklist item when parsing fails.
   * Returns HOLD, 0%, confidence 1 to ensure the discussion lifecycle continues.
   */
  function createFallbackChecklistItem(discussionId, agentId, symbol, sectorBalance) {
    const id = `checklist-${discussionId}-${agentId}-${Date.now()}-${uuidv4().substring(0, 8)}`;
    
    const fallbackPayload = {
      id,
      sourceAgentId: agentId,
      actionType: 'HOLD',
      symbol: symbol || 'UNKNOWN',
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
        allowedSymbols: [symbol || 'UNKNOWN'],
        allowZeroAmount: true,
        allowZeroAllocation: true,
      });
    } catch (validationError) {
      // If even validation fails, return a minimal valid item
      console.error(`[createFallbackChecklistItem] Fallback validation failed: ${validationError instanceof Error ? validationError.message : 'Unknown error'}`);
      return {
        id,
        sourceAgentId: agentId,
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
}

module.exports = {
  createChecklistFromLLM,
};

