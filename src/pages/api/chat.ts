// /src/pages/api/chat.ts
import type { APIRoute } from 'astro';
import { streamOpenRouterResponse } from '../../lib/openrouter';

export const prerender = false;

// Accepts: { message?: string, messages?: {role:'system'|'user'|'assistant', content:string}[], model?: string }
export const POST: APIRoute = async ({ request }) => {
  const body = await request.json().catch(() => ({}));
  const { message, messages, model } = body || {};
  if (!message && !Array.isArray(messages)) {
    return new Response('Message(s) required', { status: 400 });
  }
  return streamOpenRouterResponse(message ?? null, model ?? null, messages ?? null);
};