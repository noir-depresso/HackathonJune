import { defineConfig, loadEnv, type Plugin } from 'vite';

type BargainingRequest = {
  stage?: string;
  system?: string;
  examples?: unknown;
  message?: string;
  instruction?: string;
  [key: string]: unknown;
};

const apiPath = '/api/bargaining-ai';

export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, process.cwd(), '');

  return {
    plugins: [bargainingAiApi(env)],
  };
});

function bargainingAiApi(env: Record<string, string>): Plugin {
  return {
    name: 'star-trader-bargaining-ai-api',
    configureServer(server) {
      server.middlewares.use(apiPath, async (request, response) => {
        await handleBargainingAiRequest(request, response, env);
      });
    },
    configurePreviewServer(server) {
      server.middlewares.use(apiPath, async (request, response) => {
        await handleBargainingAiRequest(request, response, env);
      });
    },
  };
}

async function handleBargainingAiRequest(
  request: import('node:http').IncomingMessage,
  response: import('node:http').ServerResponse,
  env: Record<string, string>
): Promise<void> {
  if (request.method !== 'POST') {
    sendJson(response, 405, { error: 'Method not allowed' });
    return;
  }

  const apiKey = env.DEEPSEEK_API_KEY || env.AI_API_KEY || env.OPENAI_API_KEY;

  if (!apiKey || apiKey.includes('your-key-here')) {
    sendJson(response, 500, { error: 'DEEPSEEK_API_KEY is missing from .env' });
    return;
  }

  try {
    const payload = (await readJson(request)) as BargainingRequest;

    if (payload.stage === 'extract_structured_bargain') {
      const structured = await requestStructuredBargain(payload, apiKey, env);
      sendJson(response, 200, { structured });
      return;
    }

    if (payload.stage === 'persona_chat' || payload.stage === 'final_bargaining_response') {
      const message = await requestPersonaMessage(payload, apiKey, env);
      sendJson(response, 200, { message });
      return;
    }

    sendJson(response, 400, { error: 'Unknown bargaining AI stage' });
  } catch (error) {
    sendJson(response, 500, {
      error: error instanceof Error ? error.message : 'Bargaining AI request failed',
    });
  }
}

async function requestStructuredBargain(
  payload: BargainingRequest,
  apiKey: string,
  env: Record<string, string>
): Promise<unknown> {
  const text = await createDeepSeekText(apiKey, env, {
    instructions: [
      payload.system,
      'Return one JSON object only. Do not include markdown, commentary, code fences, or extra text.',
    ]
      .filter(Boolean)
      .join('\n\n'),
    input: JSON.stringify({
      examples: payload.examples,
      message: payload.message,
      selectedFactionId: payload.selectedFactionId,
      playerInventory: payload.playerInventory,
      factionInventories: payload.factionInventories,
      factionProfiles: payload.factionProfiles,
    }),
    jsonMode: true,
  });

  return parseJsonObject(text);
}

async function requestPersonaMessage(
  payload: BargainingRequest,
  apiKey: string,
  env: Record<string, string>
): Promise<string> {
  const text = await createDeepSeekText(apiKey, env, {
    instructions: [
      payload.instruction,
      'Write one in-character faction response. Do not mention prompts, JSON, game code, hidden rules, probabilities, or API mechanics.',
      'Keep it concise: one to three sentences. Start with the faction name if appropriate.',
    ]
      .filter(Boolean)
      .join('\n\n'),
    input: JSON.stringify(payload),
    jsonMode: false,
  });

  return text.trim();
}

async function createDeepSeekText(
  apiKey: string,
  env: Record<string, string>,
  body: { instructions: string; input: string; jsonMode: boolean }
): Promise<string> {
  const baseUrl = trimTrailingSlash(env.DEEPSEEK_BASE_URL || env.AI_BASE_URL || 'https://api.deepseek.com');
  const model = env.DEEPSEEK_MODEL || env.AI_MODEL || 'deepseek-v4-flash';
  const requestBody: Record<string, unknown> = {
    model,
    messages: [
      {
        role: 'system',
        content: body.instructions,
      },
      {
        role: 'user',
        content: body.input,
      },
    ],
    max_tokens: 700,
    temperature: body.jsonMode ? 0.1 : 0.9,
  };

  if (body.jsonMode) {
    requestBody.response_format = { type: 'json_object' };
  }

  const response = await fetch(`${baseUrl}/chat/completions`, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${apiKey}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(requestBody),
  });

  const data = (await response.json()) as Record<string, unknown>;

  if (!response.ok) {
    const message = readNestedMessage(data) || `OpenAI request failed with ${response.status}`;
    throw new Error(message);
  }

  return extractResponseText(data);
}

function extractResponseText(data: Record<string, unknown>): string {
  const choices = Array.isArray(data.choices) ? data.choices : [];
  const firstChoice = choices[0] as { message?: { content?: unknown } } | undefined;
  const content = firstChoice?.message?.content;
  const text = typeof content === 'string' ? content.trim() : '';

  if (!text) {
    throw new Error('OpenAI response did not include text output');
  }

  return text;
}

function trimTrailingSlash(value: string): string {
  return value.replace(/\/+$/, '');
}

function parseJsonObject(text: string): unknown {
  try {
    return JSON.parse(text);
  } catch {
    const match = text.match(/\{[\s\S]*\}/);

    if (!match) {
      throw new Error('AI did not return JSON');
    }

    return JSON.parse(match[0]);
  }
}

function readNestedMessage(data: Record<string, unknown>): string {
  const error = data.error as { message?: unknown } | undefined;
  return typeof error?.message === 'string' ? error.message : '';
}

function readJson(request: import('node:http').IncomingMessage): Promise<unknown> {
  return new Promise((resolve, reject) => {
    let body = '';

    request.on('data', (chunk) => {
      body += String(chunk);
    });
    request.on('end', () => {
      try {
        resolve(JSON.parse(body || '{}'));
      } catch (error) {
        reject(error);
      }
    });
    request.on('error', reject);
  });
}

function sendJson(
  response: import('node:http').ServerResponse,
  status: number,
  payload: Record<string, unknown>
): void {
  response.statusCode = status;
  response.setHeader('Content-Type', 'application/json');
  response.end(JSON.stringify(payload));
}
