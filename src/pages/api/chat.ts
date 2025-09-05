// src/pages/api/chat.ts
import type { APIRoute } from 'astro';
import { streamOpenRouterResponse } from '../../lib/openrouter';

const defaultModel =
  import.meta.env.OPENROUTER_MODEL || 'meta-llama/llama-3.1-8b-instruct:free';

export const prerender = false;

export const POST: APIRoute = async ({ request }) => {
  const { message } = await request.json();
  if (!message) {
    return new Response('Message required', { status: 400 });
  }

  return streamOpenRouterResponse(message, defaultModel);
};