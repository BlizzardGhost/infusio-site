// /src/pages/api/chat.ts
import type { APIRoute } from 'astro';
import { streamOpenRouterResponse } from '../../lib/openrouter';
import { SYSTEM, FEWSHOT } from '../../config/receptionist';

export const prerender = false;

export const POST: APIRoute = async ({ request }) => {
  try {
    const body = await request.json().catch(() => ({}));
    const { message, messages, model, mode } = body || {};

    if (!message && !Array.isArray(messages)) {
      return new Response(JSON.stringify({ error: 'Message(s) required' }), {
        status: 400,
        headers: { 'Content-Type': 'application/json' }
      });
    }

    // Temporal context anchoring (inspired by codewithmuh/ai-voice-agent)
    const now = new Date();
    const temporalContext = ` CURRENT CONTEXT: Today is ${now.toLocaleDateString('en-US', {
      weekday: 'long',
      year: 'numeric',
      month: 'long',
      day: 'numeric'
    })}. Current time is ${now.toLocaleTimeString('en-US', {
      hour: '2-digit',
      minute: '2-digit',
      timeZoneName: 'short'
    })}. Use this to resolve relative dates like 'tomorrow', 'next week', etc.`;

    const voiceRules = mode === 'voice'
      ? ' VOICE RULES: Keep replies strictly under 2 short sentences. Never use markdown, asterisks, bullet points, or emojis. Use contractions (I\'ll, we\'re, can\'t) to sound natural.'
      : '';

    const enrichedSystem = SYSTEM + temporalContext + voiceRules;

    // --- Always anchor with server-owned personality ---
    const base = [{ role: 'system' as const, content: enrichedSystem }, ...FEWSHOT];

    // Normalize incoming conversation:
    const rawIncoming =
      Array.isArray(messages) && messages.length
        ? messages
        : [{ role: 'user', content: String(message ?? '') }];

    // Spec 001 / FR-012 (RC-7): the server owns the persona.
    // 1) Drop ANY client-sent `system` message BEFORE mapping roles. Previously system/persona
    //    text from the browser was re-labelled as a `user` turn, confusing the model and
    //    allowing prompt injection via a fake "system" role.
    // 2) Keep only the last 10 user/assistant turns and cap each at 1500 chars (DoS guard).
    const incoming = rawIncoming
      .filter((msg: any) => msg && (msg.role === 'user' || msg.role === 'assistant'))
      .slice(-10)
      .map((msg: any) => ({
        role: msg.role as 'assistant' | 'user',
        content: String(msg.content ?? '').slice(0, 1500)
      }))
      // Drop empty turns (e.g. a failed stream that pushed '').
      .filter((msg) => msg.content.trim().length > 0);

    // Final conversation sent to OpenRouter: server persona + few-shots + sanitized turns.
    const composed = [...base, ...incoming];

    return await streamOpenRouterResponse(null, model ?? null, composed);
  } catch (err: any) {
    console.error('[api/chat] error handling request:', err);
    return new Response(
      JSON.stringify({
        error: 'AI service unavailable',
        details: err?.message || 'Upstream error'
      }),
      {
        status: 503,
        headers: { 'Content-Type': 'application/json' }
      }
    );
  }
};
