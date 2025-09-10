// /src/lib/openrouter.ts
import { SYSTEM, FEWSHOT } from '../config/receptionist';

type Role = 'system' | 'user' | 'assistant';
type Msg = { role: Role; content: string };

export async function streamOpenRouter(
  message: string | null,
  model?: string | null,
  messages?: Msg[] | null
) {
  const apiKey = import.meta.env.OPENROUTER_API_KEY!;
  const chosen = model || import.meta.env.OPENROUTER_MODEL || 'deepseek/deepseek-chat-v3.1:free';

  // If caller provided a full message array, use it; otherwise compose from config.
  const chat: Msg[] =
    Array.isArray(messages) && messages.length
      ? messages
      : [{ role: 'system', content: SYSTEM }, ...FEWSHOT, { role: 'user', content: String(message ?? '') }];

  const res = await fetch('https://openrouter.ai/api/v1/chat/completions', {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${apiKey}`,
      'Content-Type': 'application/json',
      'HTTP-Referer': 'https://infusio.pro',
      'X-Title': 'Infusio Receptionist',
    },
    body: JSON.stringify({ model: chosen, stream: true, messages: chat }),
  });

  if (!res.ok || !res.body) throw new Error(`OpenRouter error: ${res.status}`);
  return res.body;
}

export async function streamOpenRouterResponse(
  message: string | null,
  model?: string | null,
  messages?: Msg[] | null
): Promise<Response> {
  const stream = await streamOpenRouter(message, model, messages);
  return new Response(stream, { headers: { 'Content-Type': 'text/event-stream' } });
}