const { callLLM, isLlmEnabled } = require('./llmClient');

const ROLE_OPTIONS = ['general', 'macro', 'risk', 'sentiment', 'technical'];
const STYLE_OPTIONS = ['Aggressive', 'Balanced', 'Defensive'];
const RISK_OPTIONS = ['low', 'medium', 'high'];

function clampInitialConfidence(value) {
  if (typeof value !== 'number' || Number.isNaN(value)) {
    return 50;
  }
  return Math.min(100, Math.max(0, value));
}

function normalizeRole(value) {
  if (typeof value !== 'string') return 'general';
  const normalized = value.trim().toLowerCase();
  return ROLE_OPTIONS.includes(normalized) ? normalized : 'general';
}

function normalizeStyle(value) {
  if (typeof value !== 'string') return 'Balanced';
  const normalized = value.trim();
  const titleCased = normalized.charAt(0).toUpperCase() + normalized.slice(1).toLowerCase();
  return STYLE_OPTIONS.includes(titleCased) ? titleCased : 'Balanced';
}

function normalizeRisk(value) {
  if (typeof value !== 'string') return 'medium';
  const normalized = value.trim().toLowerCase();
  return RISK_OPTIONS.includes(normalized) ? normalized : 'medium';
}

function buildFallbackProfile(userProvidedName) {
  const safeName = (userProvidedName && String(userProvidedName).trim()) || 'New Agent';
  return {
    displayName: safeName,
    role: 'general',
    style: 'Balanced',
    riskTolerance: 'medium',
    shortBio: '',
    initialConfidence: 50
  };
}

function validateProfile(raw, fallback) {
  if (!raw || typeof raw !== 'object') {
    return fallback;
  }

  const displayName =
    typeof raw.displayName === 'string' && raw.displayName.trim().length > 0
      ? raw.displayName.trim()
      : fallback.displayName;

  const role = normalizeRole(raw.role);
  const style = normalizeStyle(raw.style);
  const riskTolerance = normalizeRisk(raw.riskTolerance);
  const shortBio = typeof raw.shortBio === 'string' ? raw.shortBio.trim() : '';
  const initialConfidence = clampInitialConfidence(
    raw.initialConfidence ?? raw.confidence ?? fallback.initialConfidence
  );

  return {
    displayName,
    role,
    style,
    riskTolerance,
    shortBio,
    initialConfidence
  };
}

function buildSystemPrompt() {
  return [
    'You are generating a worker agent profile for MAX (Multi-Agent eXecution).',
    'Output STRICT JSON only. No prose, no markdown.',
    'Return exactly these fields:',
    '- displayName (string),',
    '- role (general | macro | risk | sentiment | technical),',
    '- style (Aggressive | Balanced | Defensive),',
    '- riskTolerance (low | medium | high),',
    '- shortBio (string),',
    '- initialConfidence (number 0-100).',
    'Do not include any extra keys.'
  ].join('\n');
}

function buildUserPrompt(sectorName, userDescription) {
  return [
    `Sector: ${sectorName || 'General'}`,
    `User description: "${userDescription}"`,
    'Design an agent profile that matches the description and sector context.',
    'Ensure the JSON is valid and follows the allowed enums.'
  ].join('\n');
}

async function generateAgentProfileFromDescription(params) {
  const { sectorName = 'General', userDescription, userProvidedName } = params || {};
  const fallback = buildFallbackProfile(userProvidedName || userDescription || 'Agent');

  if (!isLlmEnabled) {
    return fallback;
  }

  try {
    const rawResponse = await callLLM({
      systemPrompt: buildSystemPrompt(),
      userPrompt: buildUserPrompt(sectorName, userDescription),
      jsonMode: true
    });

    const parsed = JSON.parse(rawResponse);
    return validateProfile(parsed, fallback);
  } catch (error) {
    console.warn('generateAgentProfileFromDescription fallback:', error);
    return fallback;
  }
}

module.exports = {
  generateAgentProfileFromDescription,
  AgentProfileEnums: {
    ROLE_OPTIONS,
    STYLE_OPTIONS,
    RISK_OPTIONS
  }
};

