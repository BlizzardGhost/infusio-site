// /src/lib/openrouter.ts
import { SYSTEM, FEWSHOT } from '../config/receptionist';

type Role = 'system' | 'user' | 'assistant';
type Msg = { role: Role; content: string };

const FALLBACK_MODELS = [
  'nvidia/nemotron-3.5-lightning:free',
  'liquid/lfm-2.5-2.6b:free',
  'google/gemma-4-26b-a4b-it:free',
  'thinkingmachines/inkling:free'
];

export async function streamOpenRouter(
  message: string | null,
  model?: string | null,
  messages?: Msg[] | null
): Promise<ReadableStream<Uint8Array>> {
  const apiKey = import.meta.env.OPENROUTER_API_KEY!;
  const envModel = import.meta.env.OPENROUTER_MODEL;

  const candidateModels: string[] = [];
  if (model) candidateModels.push(model);
  if (envModel && !candidateModels.includes(envModel)) candidateModels.push(envModel);
  for (const m of FALLBACK_MODELS) {
    if (!candidateModels.includes(m)) candidateModels.push(m);
  }

  // If caller provided a full message array, use it; otherwise compose from config.
  const chat: Msg[] =
    Array.isArray(messages) && messages.length
      ? messages
      : [{ role: 'system', content: SYSTEM }, ...FEWSHOT, { role: 'user', content: String(message ?? '') }];

  let lastError: any = null;

  for (const candidate of candidateModels) {
    try {
      const res = await fetch('https://openrouter.ai/api/v1/chat/completions', {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${apiKey}`,
          'Content-Type': 'application/json',
          'HTTP-Referer': 'https://infusio.pro',
          'X-Title': 'Infusio Receptionist',
        },
        body: JSON.stringify({
          model: candidate,
          stream: true,
          messages: chat,
          temperature: 0.6,
          max_tokens: 500,
          reasoning: { effort: 'none' }
        }),
      });

      if (res.ok && res.body) {
        return res.body;
      }

      const errText = await res.text().catch(() => '');
      console.warn(`[openrouter] model ${candidate} failed (${res.status}): ${errText}`);
      lastError = new Error(`OpenRouter ${candidate} error ${res.status}: ${errText}`);
    } catch (err) {
      console.warn(`[openrouter] network/fetch exception with ${candidate}:`, err);
      lastError = err;
    }
  }

  throw lastError || new Error('All OpenRouter candidate models failed');
}

export async function streamOpenRouterResponse(
  message: string | null,
  model?: string | null,
  messages?: Msg[] | null
): Promise<Response> {
  const stream = await streamOpenRouter(message, model, messages);
  return new Response(stream, {
    headers: {
      'Content-Type': 'text/event-stream',
      'Cache-Control': 'no-cache',
      'Connection': 'keep-alive'
    }
  });
}
