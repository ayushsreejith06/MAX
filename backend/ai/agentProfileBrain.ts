import { callLLM } from './llmClient';

export type AgentProfile = {
  displayName: string;
  role: 'general' | 'macro' | 'risk' | 'sentiment' | 'technical';
  style: 'Aggressive' | 'Balanced' | 'Defensive';
  riskTolerance: 'low' | 'medium' | 'high';
  shortBio: string;
  initialConfidence: number;
};

const ROLE_OPTIONS: AgentProfile['role'][] = [
  'general',
  'macro',
  'risk',
  'sentiment',
  'technical'
];

const STYLE_OPTIONS: AgentProfile['style'][] = ['Aggressive', 'Balanced', 'Defensive'];
const RISK_OPTIONS: AgentProfile['riskTolerance'][] = ['low', 'medium', 'high'];

function clampInitialConfidence(value: any): number {
  if (typeof value !== 'number' || Number.isNaN(value)) {
    return 50;
  }
  return Math.min(100, Math.max(0, value));
}

function normalizeRole(value: any): AgentProfile['role'] {
  if (typeof value !== 'string') return 'general';
  const normalized = value.trim().toLowerCase() as AgentProfile['role'];
  return ROLE_OPTIONS.includes(normalized) ? normalized : 'general';
}

function normalizeStyle(value: any): AgentProfile['style'] {
  if (typeof value !== 'string') return 'Balanced';
  const titleCased = value.trim().toLowerCase().replace(/^\w/, (c) => c.toUpperCase()) as AgentProfile['style'];
  return STYLE_OPTIONS.includes(titleCased) ? titleCased : 'Balanced';
}

function normalizeRisk(value: any): AgentProfile['riskTolerance'] {
  if (typeof value !== 'string') return 'medium';
  const normalized = value.trim().toLowerCase() as AgentProfile['riskTolerance'];
  return RISK_OPTIONS.includes(normalized) ? normalized : 'medium';
}

function buildFallbackProfile(userProvidedName: string): AgentProfile {
  const safeName = userProvidedName?.trim() || 'New Agent';
  return {
    displayName: safeName,
    role: 'general',
    style: 'Balanced',
    riskTolerance: 'medium',
    shortBio: '',
    initialConfidence: 50
  };
}

function validateProfile(raw: any, fallback: AgentProfile): AgentProfile {
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

function buildSystemPrompt(): string {
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

function buildUserPrompt(sectorName: string, userDescription: string): string {
  return [
    `Sector: ${sectorName || 'General'}`,
    `User description: "${userDescription}"`,
    'Design an agent profile that matches the description and sector context.',
    'Ensure the JSON is valid and follows the allowed enums.'
  ].join('\n');
}

export async function generateAgentProfileFromDescription(params: {
  sectorName?: string | null;
  userDescription: string;
  userProvidedName?: string;
}): Promise<AgentProfile> {
  const { sectorName = 'General', userDescription, userProvidedName } = params;
  const fallback = buildFallbackProfile(userProvidedName || userDescription || 'Agent');

  try {
    const rawResponse = await callLLM({
      systemPrompt: buildSystemPrompt(),
      userPrompt: buildUserPrompt(sectorName, userDescription),
      jsonMode: true
    });

    // Extract JSON from response (handles markdown code fences and extra text)
    function extractJsonObject(raw: string): any {
      if (typeof raw !== 'string') {
        throw new Error('Response must be a string');
      }

      const trimmed = raw.trim();
      // Try to extract JSON from markdown code fences
      const fencedMatch = trimmed.match(/```(?:json)?\s*([\s\S]*?)```/i);
      const candidate = fencedMatch ? fencedMatch[1] : trimmed;

      // Try direct parse first
      try {
        return JSON.parse(candidate);
      } catch {
        /* fall through */
      }

      // Try to find JSON object boundaries
      const start = candidate.indexOf('{');
      const end = candidate.lastIndexOf('}');
      if (start === -1 || end === -1 || end <= start) {
        throw new Error('No JSON object found');
      }

      const sliced = candidate.slice(start, end + 1);
      return JSON.parse(sliced);
    }

    const parsed = extractJsonObject(rawResponse);
    return validateProfile(parsed, fallback);
  } catch (error) {
    console.warn('generateAgentProfileFromDescription fallback:', error);
    return fallback;
  }
}

export const AgentProfileEnums = {
  ROLE_OPTIONS,
  STYLE_OPTIONS,
  RISK_OPTIONS
};

