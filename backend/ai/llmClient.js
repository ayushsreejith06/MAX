const {
  LLM_BASE_URL: rawBaseUrl,
  LLM_MODEL_NAME,
  LLM_API_KEY,
  USE_LLM
} = process.env;

const isLlmEnabled = (USE_LLM || '').toLowerCase() === 'true';
const baseUrl = rawBaseUrl ? rawBaseUrl.replace(/\/$/, '') : '';

function requireConfig() {
  if (!isLlmEnabled) {
    throw new Error('LLM disabled');
  }

  if (!baseUrl) {
    throw new Error('LLM_BASE_URL not configured');
  }

  if (!LLM_MODEL_NAME) {
    throw new Error('LLM_MODEL_NAME not configured');
  }
}

function buildHeaders() {
  const headers = {
    'Content-Type': 'application/json'
  };

  if (LLM_API_KEY) {
    headers.Authorization = `Bearer ${LLM_API_KEY}`;
  }

  return headers;
}

async function callLLM(params) {
  const { systemPrompt, userPrompt, maxTokens, jsonMode } = params;

  requireConfig();

  const payload = {
    model: LLM_MODEL_NAME,
    messages: [
      { role: 'system', content: systemPrompt },
      { role: 'user', content: userPrompt }
    ],
    temperature: 0.3
  };

  if (typeof maxTokens === 'number') {
    payload.max_tokens = maxTokens;
  }

  if (jsonMode) {
    payload.response_format = { type: 'json_object' };
  }

  const url = `${baseUrl}/chat/completions`;

  let response;
  try {
    response = await fetch(url, {
      method: 'POST',
      headers: buildHeaders(),
      body: JSON.stringify(payload)
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Unknown error';
    throw new Error(`LLM request failed: ${message}`);
  }

  let data;
  try {
    data = await response.json();
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Unknown error';
    throw new Error(`LLM response was not valid JSON: ${message}`);
  }

  if (!response.ok) {
    const serverMessage = data?.error?.message || response.statusText || 'Unknown error';
    throw new Error(`LLM request failed (${response.status}): ${serverMessage}`);
  }

  const content = data?.choices?.[0]?.message?.content;
  if (typeof content !== 'string' || content.length === 0) {
    throw new Error('LLM response missing message content');
  }

  return content;
}

async function checkLLMHealth() {
  try {
    await callLLM({
      systemPrompt: 'Health check',
      userPrompt: 'Respond with OK.',
      maxTokens: 10
    });
    return true;
  } catch (error) {
    console.error('LLM health check failed:', error);
    return false;
  }
}

module.exports = {
  callLLM,
  checkLLMHealth,
  isLlmEnabled
};

