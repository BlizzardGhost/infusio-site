// /src/pages/api/chat.ts
import type { APIRoute } from 'astro';
import { streamOpenRouterResponse } from '../../lib/openrouter';
import { SYSTEM, FEWSHOT } from '../../config/receptionist';

export const prerender = false;

export const POST: APIRoute = async ({ request }) => {
  const body = await request.json().catch(() => ({}));
  const { message, messages, model } = body || {};

  if (!message && !Array.isArray(messages)) {
    return new Response('Message(s) required', { status: 400 });
  }

  // --- Always anchor with server-owned personality ---
  const base = [{ role: 'system', content: SYSTEM }, ...FEWSHOT];

  // Normalize incoming conversation:
  // - If client sent a full messages array, use it
  // - Else wrap the single message as a user turn
  const incoming =
    Array.isArray(messages) && messages.length
      ? messages
      : [{ role: 'user', content: String(message ?? '') }];

  // If the first incoming turn is a system message, drop it to avoid duplicate/competing system prompts
  const trimmed =
    incoming.length && incoming[0]?.role === 'system'
      ? incoming.slice(1)
      : incoming;

  // Final conversation sent to OpenRouter
  const composed = [...base, ...trimmed];

  // Important: pass ONLY `messages` (full chat); no separate `message` param
  return streamOpenRouterResponse(null, model ?? null, composed);
};