import { defineConfig, loadEnv } from 'vite';

export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, process.cwd(), '');

  return {
    plugins: [
      {
        name: 'local-bargaining-ai-endpoint',
        configureServer(server) {
          server.middlewares.use('/api/bargaining-ai', async (request, response) => {
            if (request.method !== 'POST') {
              response.statusCode = 405;
              response.end(JSON.stringify({ error: 'Method not allowed' }));
              return;
            }

            const apiKey = env.OPENAI_API_KEY;

            if (!apiKey) {
              response.statusCode = 503;
              response.end(JSON.stringify({ error: 'OPENAI_API_KEY is not configured.' }));
              return;
            }

            try {
              const body = await readJsonBody(request);
              const payload = await handleBargainingRequest(body, apiKey, env.OPENAI_MODEL || 'gpt-4.1-mini');

              response.setHeader('Content-Type', 'application/json');
              response.end(JSON.stringify(payload));
            } catch (error) {
              response.statusCode = 500;
              response.setHeader('Content-Type', 'application/json');
              response.end(
                JSON.stringify({
                  error: error instanceof Error ? error.message : 'Bargaining AI request failed.',
                })
              );
            }
          });
        },
      },
    ],
  };
});

async function handleBargainingRequest(body: Record<string, unknown>, apiKey: string, model: string): Promise<unknown> {
  if (body.stage === 'extract_structured_bargain') {
    const content = await callOpenAI(apiKey, model, [
      {
        role: 'system',
        content: `${String(body.system ?? '')}\nReturn JSON only.`,
      },
      {
        role: 'user',
        content: JSON.stringify({
          examples: body.examples,
          message: body.message,
          selectedFactionId: body.selectedFactionId,
          playerInventory: body.playerInventory,
          factionInventories: body.factionInventories,
          factionProfiles: body.factionProfiles,
        }),
      },
    ], true);

    return { structured: JSON.parse(content) };
  }

  if (body.stage === 'persona_chat') {
    return {
      message: await callOpenAI(apiKey, model, [
        {
          role: 'system',
          content:
            'You are writing dialogue for a compact space trading game. Reply in exactly two parts. First sentence starts with "Faction Position:" and states the faction policy/ideology. Remaining sentence(s) start with the vendor name and are the individual merchant response using their role and bio. Stay in character, obey the game facts, and keep the reply under 100 words.',
        },
        {
          role: 'user',
          content: JSON.stringify(body),
        },
      ]),
    };
  }

  if (body.stage === 'final_bargaining_response') {
    return {
      message: await callOpenAI(apiKey, model, [
        {
          role: 'system',
          content:
            'You are writing bargaining dialogue. The computed bargaining result is authoritative. Reply in exactly two parts. First sentence starts with "Faction Position:" and states the faction policy/ideology behind the decision. Remaining sentence(s) start with the vendor name and are the individual merchant response using their role and bio. Do not alter the outcome, inventory, or prices. Keep the reply under 120 words.',
        },
        {
          role: 'user',
          content: JSON.stringify(body),
        },
      ]),
    };
  }

  throw new Error('Unknown bargaining AI stage.');
}

async function callOpenAI(
  apiKey: string,
  model: string,
  messages: { role: 'system' | 'user'; content: string }[],
  jsonOnly = false
): Promise<string> {
  const apiResponse = await fetch('https://api.openai.com/v1/chat/completions', {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${apiKey}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      model,
      messages,
      temperature: jsonOnly ? 0.1 : 0.7,
      response_format: jsonOnly ? { type: 'json_object' } : undefined,
    }),
  });

  if (!apiResponse.ok) {
    throw new Error(`OpenAI request failed: ${apiResponse.status} ${await apiResponse.text()}`);
  }

  const data = (await apiResponse.json()) as {
    choices?: { message?: { content?: string } }[];
  };
  const content = data.choices?.[0]?.message?.content?.trim();

  if (!content) {
    throw new Error('OpenAI response did not include message content.');
  }

  return content;
}

async function readJsonBody(request: { on: (event: string, callback: (chunk?: unknown) => void) => void }): Promise<Record<string, unknown>> {
  const chunks: Buffer[] = [];

  await new Promise<void>((resolve, reject) => {
    request.on('data', (chunk) => {
      chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(String(chunk)));
    });
    request.on('end', () => resolve());
    request.on('error', () => reject(new Error('Could not read request body.')));
  });

  return JSON.parse(Buffer.concat(chunks).toString('utf8')) as Record<string, unknown>;
}
