/**
 * Validates agent messages to ensure they contain required fields:
 * - symbol: A symbol or sector identifier
 * - confidence: A numeric confidence value
 * - reasoning: Actual reasoning beyond just stating the confidence
 * 
 * @param {string} messageContent - The message content to validate
 * @param {string} agentId - Optional agent ID for logging
 * @param {string} agentName - Optional agent name for logging
 * @returns {Object} Validation result with { isValid: boolean, reason?: string }
 */
function validateAgentMessage(messageContent, agentId = null, agentName = null) {
  if (!messageContent || typeof messageContent !== 'string') {
    return {
      isValid: false,
      reason: 'Message content is empty or invalid'
    };
  }

  const content = messageContent.trim();
  const contentLower = content.toLowerCase();

  // Check for symbol/sector identifier
  // Look for patterns like "for {symbol}", "for {sector}", or ticker symbols
  const symbolPatterns = [
    /for\s+([a-z0-9]+)/i,  // "for technology", "for AAPL"
    /symbol[:\s]+([a-z0-9]+)/i,  // "symbol: AAPL"
    /\b([A-Z]{1,5})\b/,  // Ticker symbols (1-5 uppercase letters)
  ];

  let hasSymbol = false;
  for (const pattern of symbolPatterns) {
    if (pattern.test(content)) {
      hasSymbol = true;
      break;
    }
  }

  // Also check if message mentions a sector name (common sector names)
  const commonSectors = ['technology', 'healthcare', 'finance', 'energy', 'consumer', 'industrial', 'materials', 'utilities', 'real estate', 'communication'];
  if (!hasSymbol) {
    for (const sector of commonSectors) {
      if (contentLower.includes(sector)) {
        hasSymbol = true;
        break;
      }
    }
  }

  // Check for confidence value (numeric)
  const confidencePatterns = [
    /confidence[:\s]+([\d.]+)/i,  // "confidence: 100.0" or "confidence 100.0"
    /confidence\s+of\s+([\d.]+)/i,  // "confidence of 100.0"
    /with\s+confidence\s+([\d.]+)/i,  // "with confidence 100.0"
    /because\s+of\s+confidence\s+([\d.]+)/i,  // "because of confidence 100.0"
  ];

  let hasConfidence = false;
  for (const pattern of confidencePatterns) {
    if (pattern.test(content)) {
      hasConfidence = true;
      break;
    }
  }

  // Check for reasoning beyond just stating confidence
  // Reasoning should be more than just "because of confidence X" or similar
  const minimalReasoningPatterns = [
    /because\s+of\s+confidence/i,  // "because of confidence"
    /due\s+to\s+confidence/i,  // "due to confidence"
    /confidence\s+is\s+[\d.]+/i,  // "confidence is 100.0"
  ];

  // Check if the message has substantial reasoning
  // Remove confidence-related phrases and check if there's meaningful content left
  let reasoningContent = content;
  for (const pattern of minimalReasoningPatterns) {
    reasoningContent = reasoningContent.replace(pattern, '');
  }

  // Remove common action phrases
  reasoningContent = reasoningContent.replace(/proposed\s+action/i, '');
  reasoningContent = reasoningContent.replace(/action\s+is/i, '');
  reasoningContent = reasoningContent.replace(/agent\s+[^:]+:/i, '');  // Remove "Agent Name:"
  reasoningContent = reasoningContent.replace(/for\s+[a-z0-9]+/i, '');  // Remove "for symbol"
  reasoningContent = reasoningContent.replace(/is\s+(buy|sell|hold|rebalance)/i, '');
  reasoningContent = reasoningContent.replace(/confidence[:\s]+[\d.]+/i, '');
  reasoningContent = reasoningContent.trim();

  // Check if there's meaningful reasoning left (at least 20 characters of actual content)
  const hasReasoning = reasoningContent.length >= 20 && 
    !reasoningContent.match(/^\s*(because|due|confidence|action|proposed|is|for)\s*$/i);

  // Build validation result
  const missingFields = [];
  if (!hasSymbol) {
    missingFields.push('symbol');
  }
  if (!hasConfidence) {
    missingFields.push('confidence');
  }
  if (!hasReasoning) {
    missingFields.push('reasoning');
  }

  if (missingFields.length > 0) {
    const agentInfo = agentName || agentId || 'Unknown';
    return {
      isValid: false,
      reason: `Message from ${agentInfo} is missing required fields: ${missingFields.join(', ')}. Message: "${content.substring(0, 100)}${content.length > 100 ? '...' : ''}"`
    };
  }

  return {
    isValid: true
  };
}

module.exports = {
  validateAgentMessage
};

