// /src/lib/openrouter.ts
// -----------------------------------------------------------------------------
// OpenRouter streaming client with automatic multi-model fallback cascade.
// Specs:
//   - specs/001-voice-receptionist-reliability/spec.md
//   - specs/002-natural-low-latency-conversation/spec.md (FR-205)
//
// WHY THESE PARAMETERS EXIST (for debug operators):
//   - `reasoning: { effort: 'none' }`: prevents reasoning-capable models (such as
//     nvidia/nemotron-3.5-lightning:free) from spending their token budget on
//     hidden chain-of-thought tokens, which previously caused 30–40 s hangs and
//     empty `content: null` responses.
//   - `max_tokens` (FR-205): Voice replies must be 1–2 short spoken sentences, so
//     capping voice mode at 120 tokens cuts total stream time to ~650–850 ms while
//     preventing long monologues. Text mode uses 260 tokens.
// -----------------------------------------------------------------------------
import { SYSTEM, FEWSHOT } from '../config/receptionist';

type Role = 'system' | 'user' | 'assistant';
type Msg = { role: Role; content: string };

export interface StreamOptions {
  maxTokens?: number;
  temperature?: number;
}

// Ordered by lowest TTFT (time-to-first-token) and conversational quality on OpenRouter.
const FALLBACK_MODELS = [
  'nvidia/nemotron-3.5-lightning:free',
  'liquid/lfm-2.5-2.6b:free',
  'google/gemma-4-26b-a4b-it:free',
  'thinkingmachines/inkling:free',
];

export async function streamOpenRouter(
  message: string | null,
  model?: string | null,
  messages?: Msg[] | null,
  opts?: StreamOptions
): Promise<ReadableStream<Uint8Array>> {
  const apiKey = import.meta.env.OPENROUTER_API_KEY!;
  const envModel = import.meta.env.OPENROUTER_MODEL;

  // Build ordered de-duplicated candidate model list: explicit request → env → fallbacks.
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

  const maxTokens = opts?.maxTokens ?? 260;
  const temperature = opts?.temperature ?? 0.65;

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
          temperature,
          max_tokens: maxTokens,
          reasoning: { effort: 'none' },
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
  messages?: Msg[] | null,
  opts?: StreamOptions
): Promise<Response> {
  const stream = await streamOpenRouter(message, model, messages, opts);
  return new Response(stream, {
    headers: {
      'Content-Type': 'text/event-stream; charset=utf-8',
      'Cache-Control': 'no-cache, no-transform',
      'Connection': 'keep-alive',
      'X-Accel-Buffering': 'no', // Prevents intermediate proxy buffering on SSE streams
    },
  });
}
