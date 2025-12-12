import { callLLM } from '../ai/llmClient';

export type AgentFactoryRequest = {
  userDescription: string;
  sectorName?: string;
};

export type AgentIdentity = {
  id: string;
  purpose: string;
};

export async function buildAgentIdentity(
  request: AgentFactoryRequest
): Promise<AgentIdentity> {
  const userDescription = (request?.userDescription ?? '').trim();
  const sectorName = (request?.sectorName ?? '').trim();

  if (!userDescription) {
    throw new Error('Agent description is required to generate identity.');
  }

  const result = await callLLM({
    systemPrompt: `
You are MAX System LLM. You classify agents.
ALWAYS output JSON. Never output text outside JSON.
`,
    userPrompt: `
Given this description: "${userDescription}",
sector: "${sectorName}".

Return a compact agent definition:

{
  "id": "TECH_ANALYST",
  "purpose": "Analyze Nvidia stock trends and generate buy/sell signals."
}

Rules:
- "id" MUST be 1-3 words, UPPERCASE, NO SPACES, underscores allowed.
- "purpose" MUST be one short sentence.
- Never repeat user text. Rewrite intelligently.
- Never exceed 200 characters.
`,
    jsonMode: true
  });

  let parsed: any;
  try {
    parsed = JSON.parse(result);
  } catch {
    throw new Error('LLM did not return valid JSON.');
  }

  const id = typeof parsed?.id === 'string' ? parsed.id.trim() : '';
  const purpose = typeof parsed?.purpose === 'string' ? parsed.purpose.trim() : '';

  if (!id || !purpose) {
    throw new Error('LLM response missing required id or purpose.');
  }

  return { id, purpose };
}


