/**
 * JavaScript wrapper for checklistBuilder.ts
 * Exports validation functions for use in JavaScript files
 */

// Try to load TypeScript version, fallback to basic validation if not available
let validateChecklistItem;
let formatChecklistItemDescription;

try {
  // Attempt to load TypeScript version (requires ts-node or similar)
  const tsModule = require('./checklistBuilder.ts');
  validateChecklistItem = tsModule.validateChecklistItem;
  formatChecklistItemDescription = tsModule.formatChecklistItemDescription;
} catch (error) {
  // Fallback: Provide basic validation if TypeScript can't be loaded
  console.warn('[checklistBuilder] TypeScript module not available, using fallback validation');
  
  /**
   * Basic validation fallback (should match TypeScript version)
   */
  validateChecklistItem = function(item, options) {
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

    const normalizedSymbol = item.symbol.trim().toUpperCase();
    const normalizedAllowedSymbols = (options.allowedSymbols || []).map(s => s.trim().toUpperCase());
    if (!normalizedAllowedSymbols.includes(normalizedSymbol)) {
      throw new Error(
        `ChecklistItem.symbol "${item.symbol}" must be one of: ${options.allowedSymbols.join(', ')}`
      );
    }

    // Validate allocationPercent (primary field)
    if (typeof item.allocationPercent !== 'number' || !Number.isFinite(item.allocationPercent)) {
      throw new Error('ChecklistItem.allocationPercent must be a finite number');
    }

    if (item.allocationPercent < 0 || item.allocationPercent > 100) {
      throw new Error('ChecklistItem.allocationPercent must be in range [0, 100]');
    }

    const allowZeroAllocation = options.allowZeroAllocation !== undefined ? options.allowZeroAllocation : item.actionType === 'HOLD';
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

    const allowZeroAmount = options.allowZeroAmount !== undefined ? options.allowZeroAmount : item.actionType === 'HOLD';
    if (!allowZeroAmount && amount <= 0 && item.actionType !== 'HOLD') {
      // Only validate amount > 0 for non-HOLD actions if allocationPercent is also > 0
      if (item.allocationPercent > 0) {
        throw new Error(`ChecklistItem.amount must be > 0 for actionType "${item.actionType}"`);
      }
    }

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

    const validStatuses = ['PENDING', 'APPROVED', 'REJECTED', 'REVISE_REQUIRED', 'ACCEPT_REJECTION', 'RESUBMITTED'];
    const status = item.status || 'PENDING';
    if (!validStatuses.includes(status)) {
      throw new Error(`ChecklistItem.status must be one of: ${validStatuses.join(', ')}`);
    }

    const finalRationale = rationale.trim();

    return {
      id: item.id,
      sourceAgentId: item.sourceAgentId,
      actionType: item.actionType,
      symbol: normalizedSymbol,
      amount: amount, // Legacy field
      allocationPercent: item.allocationPercent,
      confidence: item.confidence,
      reasoning: finalRationale, // Alias for rationale
      rationale: finalRationale, // Primary field
      status,
    };
  };

  formatChecklistItemDescription = function(item) {
    const amountStr = item.amount > 0 ? `$${item.amount.toFixed(2)}` : 'no amount';
    return `${item.actionType} ${amountStr} of ${item.symbol} (confidence: ${item.confidence}%) - ${item.reasoning}`;
  };
}

module.exports = {
  validateChecklistItem,
  formatChecklistItemDescription,
};

