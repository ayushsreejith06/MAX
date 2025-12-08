/**
 * ConfidenceEngine - Base confidence system with NO LLM calls and no external dependencies
 * 
 * Updates agent confidence based on agent role using mock logic:
 * - Researcher: +1 to +5 random
 * - Analyst: -2 to +3 random
 * - Custom rules: placeholder (returns 0)
 * 
 * Confidence range: -100 to +100
 */

interface Agent {
  id: string;
  role: string;
  confidence?: number;
  [key: string]: any;
}

/**
 * Calculate confidence change for researcher agents
 * Mock logic: returns random value between +1 and +5
 * @param agent - Agent object
 * @returns Confidence change value
 */
function calculateResearcherConfidence(agent: Agent): number {
  // Mock logic: random value between +1 and +5
  return Math.floor(Math.random() * 5) + 1;
}

/**
 * Calculate confidence change for analyst agents
 * Mock logic: returns random value between -2 and +3
 * @param agent - Agent object
 * @returns Confidence change value
 */
function calculateAnalystConfidence(agent: Agent): number {
  // Mock logic: random value between -2 and +3
  return Math.floor(Math.random() * 6) - 2; // -2, -1, 0, 1, 2, 3
}

/**
 * Apply custom user rules (placeholder)
 * Returns 0 for now
 * @param agent - Agent object
 * @returns Confidence change value (always 0 for now)
 */
function applyCustomUserRules(agent: Agent): number {
  // Placeholder: return 0
  return 0;
}

/**
 * Run one confidence update cycle for an agent
 * Determines agent role and applies appropriate confidence change
 * @param agent - Agent object
 * @returns Updated confidence value (clamped to [-100, 100])
 */
function tick(agent: Agent): number {
  if (!agent) {
    return 0;
  }

  // Get current confidence (default to 0 if not set)
  const currentConfidence = typeof agent.confidence === 'number' 
    ? agent.confidence 
    : 0;

  // Determine agent role (case-insensitive)
  const role = (agent.role || '').toLowerCase();
  let confidenceChange = 0;

  // Apply role-based confidence change
  if (role.includes('research') || role === 'researcher') {
    confidenceChange = calculateResearcherConfidence(agent);
  } else if (role.includes('analyst') || role === 'analyst') {
    confidenceChange = calculateAnalystConfidence(agent);
  }

  // Apply custom user rules (placeholder)
  const customRulesChange = applyCustomUserRules(agent);
  confidenceChange += customRulesChange;

  // Calculate new confidence
  let newConfidence = currentConfidence + confidenceChange;

  // Clamp to [-100, 100]
  newConfidence = Math.max(-100, Math.min(100, newConfidence));

  return newConfidence;
}

/**
 * Update agent confidence
 * Main exported function that runs one confidence update cycle
 * @param agent - Agent object with id, role, confidence, etc.
 * @returns Updated confidence value (clamped to [-100, 100])
 */
export function updateAgentConfidence(agent: Agent): number {
  if (!agent) {
    return 0;
  }

  return tick(agent);
}

