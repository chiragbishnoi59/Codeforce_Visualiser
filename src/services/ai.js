const GEMINI_MODEL = 'gemini-1.5-flash';
const GROQ_MODEL = 'llama-3.1-8b-instant';

const normalizeApiKey = (apiKey) =>
  (apiKey || '')
    .trim()
    .replace(/^"|"$/g, '')
    .replace(/^'|'$/g, '');

const sanitizeJson = (rawText) => {
  const withoutFence = rawText
    .replace(/```json/gi, '')
    .replace(/```/g, '')
    .trim();

  return JSON.parse(withoutFence);
};

const buildPrompt = ({ weakTopics, dailyProblems, targetRating }) => `You are an algorithmic competitive programming coach. Return only compact JSON with this shape:
{
  "weeklyFocus": "string up to 140 chars",
  "weakTopics": [{"topic": "string", "tip": "string up to 90 chars"}],
  "problemReasons": [{"key": "contestId-index", "reason": "string up to 90 chars"}]
}

Data:
- targetRating: ${targetRating}
- weakTopics: ${JSON.stringify(weakTopics.map((item) => ({ topic: item.topic, solvedCount: item.solvedCount })))}
- dailyProblems: ${JSON.stringify(
    dailyProblems.map((problem) => ({
      key: `${problem.contestId}-${problem.index}`,
      name: problem.name,
      rating: problem.rating,
      tags: problem.tags
    }))
  )}`;

const parseErrorMessage = async (response) => {
  if (response.status === 401) {
    return 'Groq API unauthorized (401). Check your API key value.';
  }

  if (response.status === 403) {
    return 'Groq API access denied (403). Check that the key is valid for the Groq OpenAI-compatible API.';
  }

  try {
    const data = await response.json();
    return data?.error?.message || `HTTP ${response.status} ${response.statusText}`;
  } catch {
    return `HTTP ${response.status} ${response.statusText}`;
  }
};

const extractResponseText = async (response) => {
  const data = await response.json();
  const text = data?.choices?.[0]?.message?.content;
  if (!text) {
    throw new Error('Groq returned an empty response');
  }

  return sanitizeJson(text);
};

const extractResponsesApiText = async (response) => {
  const data = await response.json();
  const output = data?.output || [];

  const messageBlock = output.find((item) => item?.type === 'message');
  const content = messageBlock?.content || [];
  const textPart = content.find((item) => item?.type === 'output_text');

  if (!textPart?.text) {
    throw new Error('Groq responses endpoint returned empty output');
  }

  return sanitizeJson(textPart.text);
};

const getGroqBaseUrl = () =>
  (process.env.REACT_APP_GROQ_BASE_URL || 'https://api.groq.com/openai/v1').replace(/\/$/, '');

const tryChatCompletions = async ({ prompt, apiKey, model }) => {
  const response = await fetch(`${getGroqBaseUrl()}/chat/completions`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${apiKey}`
    },
    body: JSON.stringify({
      model,
      temperature: 0.4,
      max_tokens: 400,
      response_format: { type: 'json_object' },
      messages: [
        {
          role: 'system',
          content: 'You are a strict JSON generator for competitive programming coaching.'
        },
        {
          role: 'user',
          content: prompt
        }
      ]
    })
  });

  if (!response.ok) {
    const message = await parseErrorMessage(response);
    throw new Error(message);
  }

  return extractResponseText(response);
};

const tryResponsesApi = async ({ prompt, apiKey, model }) => {
  const response = await fetch(`${getGroqBaseUrl()}/responses`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${apiKey}`
    },
    body: JSON.stringify({
      model,
      input: `${prompt}\n\nReturn valid JSON only.`,
      text: { format: { type: 'json_object' } },
      temperature: 0.4,
      max_output_tokens: 400
    })
  });

  if (!response.ok) {
    const message = await parseErrorMessage(response);
    throw new Error(message);
  }

  return extractResponsesApiText(response);
};

const fetchFromGrok = async ({ prompt, apiKey }) => {
  const configuredModel = process.env.REACT_APP_GROK_MODEL || GROK_MODEL;
  const modelsToTry = [configuredModel, 'grok-4-0709', 'grok-3-latest'];
  const uniqueModels = [...new Set(modelsToTry.filter(Boolean))];

  let lastError = null;

  for (const model of uniqueModels) {
    try {
      return await tryChatCompletions({ prompt, apiKey, model });
    } catch (err) {
      lastError = err;
    }

    try {
      return await tryResponsesApi({ prompt, apiKey, model });
    } catch (err) {
      lastError = err;
    }
  }

  throw new Error(lastError?.message || 'Grok request failed');
};

const fetchFromGemini = async ({ prompt, apiKey }) => {
  const url = `https://generativelanguage.googleapis.com/v1beta/models/${GEMINI_MODEL}:generateContent?key=${apiKey}`;

  const response = await fetch(url, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json'
    },
    body: JSON.stringify({
      contents: [{ parts: [{ text: prompt }] }],
      generationConfig: {
        temperature: 0.4,
        maxOutputTokens: 400
      }
    })
  });

  const data = await response.json();

  if (!response.ok) {
    const message = data?.error?.message || 'Gemini request failed';
    throw new Error(message);
  }

  const text = data?.candidates?.[0]?.content?.parts?.[0]?.text;
  if (!text) {
    throw new Error('Gemini returned an empty response');
  }

  return sanitizeJson(text);
};

export const getAiInsights = async ({ weakTopics, dailyProblems, targetRating }) => {
  const groqApiKey = normalizeApiKey(process.env.REACT_APP_GROQ_API_KEY || process.env.REACT_APP_GROK_API_KEY);
  const geminiApiKey = normalizeApiKey(process.env.REACT_APP_GEMINI_API_KEY);
  if (!groqApiKey && !geminiApiKey) {
    return null;
  }

  const prompt = buildPrompt({ weakTopics, dailyProblems, targetRating });

  if (groqApiKey) {
    return fetchFromGrok({ prompt, apiKey: groqApiKey });
  }

  return fetchFromGemini({ prompt, apiKey: geminiApiKey });
};
