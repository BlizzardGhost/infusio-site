// /src/pages/api/chat.ts
// -----------------------------------------------------------------------------
// Server-owned AI Receptionist endpoint (POST /api/chat).
// Specs:
//   - specs/001-voice-receptionist-reliability/spec.md (FR-012)
//   - specs/002-natural-low-latency-conversation/spec.md (FR-201, FR-202, FR-204, FR-205)
//
// SECURITY & CONVERSATION FLOW (for debug operators):
//   1. The server owns the system persona (`SYSTEM`). Any `system` role sent by
//      the browser is stripped (FR-012) so a client can never override instructions.
//   2. `visitor` metadata (`{ name, email, phone }`) captured by the voice or text
//      UI is sanitized here (stripped of control chars and length-capped) and
//      injected as a server-authored context note (FR-204). This lets the LLM greet
//      the visitor by name once and avoid re-asking for details already known.
//   3. Voice mode (`mode === 'voice'`) uses a tighter 120-token ceiling (FR-205)
//      and spoken-contraction rules so replies finish streaming in ~650–850 ms.
// -----------------------------------------------------------------------------
import type { APIRoute } from 'astro';
import { streamOpenRouterResponse } from '../../lib/openrouter';
import { SYSTEM, FEWSHOT } from '../../config/receptionist';

export const prerender = false;

/** Strip control characters/newlines and bound length on untrusted visitor fields (FR-204). */
function cleanVisitorField(val: unknown, maxLen: number): string {
  if (typeof val !== 'string') return '';
  return val.replace(/[\r\n\t<>`{}]/g, ' ').replace(/\s+/g, ' ').trim().slice(0, maxLen);
}

export const POST: APIRoute = async ({ request }) => {
  try {
    const body = await request.json().catch(() => ({}));
    const { message, messages, model, mode, visitor } = body || {};

    if (!message && !Array.isArray(messages)) {
      return new Response(JSON.stringify({ error: 'Message(s) required' }), {
        status: 400,
        headers: { 'Content-Type': 'application/json' },
      });
    }

    // Temporal context anchoring so relative dates ("tomorrow", "next Tuesday") resolve accurately.
    const now = new Date();
    const temporalContext = ` CURRENT DATE/TIME: ${now.toLocaleDateString('en-US', {
      weekday: 'long',
      year: 'numeric',
      month: 'long',
      day: 'numeric',
    })}, ${now.toLocaleTimeString('en-US', {
      hour: '2-digit',
      minute: '2-digit',
      timeZoneName: 'short',
    })}.`;

    // Voice-specific rules (FR-205): natural spoken cadence, contractions, under 30 words.
    const voiceRules =
      mode === 'voice'
        ? " VOICE MODE: Your reply will be spoken aloud by text-to-speech. Sound like a relaxed, friendly human on a phone call. Use natural contractions (I'm, we'll, that's). Keep it to 1 or 2 short sentences (under 30 words total). Never use lists, asterisks, URLs, or emojis."
        : '';

    // FR-204: Server-sanitized visitor context (replaces the old client-side `system` message hack).
    const vName = cleanVisitorField(visitor?.name, 60);
    const vEmail = cleanVisitorField(visitor?.email, 120);
    const vPhone = cleanVisitorField(visitor?.phone, 30);
    const knownParts: string[] = [];
    if (vName) knownParts.push(`name="${vName}"`);
    if (vEmail) knownParts.push(`email="${vEmail}"`);
    if (vPhone) knownParts.push(`phone="${vPhone}"`);
    const visitorContext = knownParts.length
      ? ` KNOWN VISITOR DETAILS: ${knownParts.join(', ')}. Use their name naturally if you haven't yet; do NOT ask for any detail already listed here, and do NOT launch into a sales pitch just because you know their name.`
      : '';

    const enrichedSystem = SYSTEM + temporalContext + voiceRules + visitorContext;

    // Anchor with server-owned persona. FEWSHOT is empty (FR-202) so fake turns never pollute state.
    const base = [{ role: 'system' as const, content: enrichedSystem }, ...FEWSHOT];

    // Normalize incoming conversation:
    const rawIncoming =
      Array.isArray(messages) && messages.length
        ? messages
        : [{ role: 'user', content: String(message ?? '') }];

    // Spec 001 / FR-012 (RC-7): the server owns the persona.
    // 1) Drop ANY client-sent `system` message BEFORE mapping roles.
    // 2) Keep only the last 10 user/assistant turns and cap each at 1500 chars (DoS guard).
    const incoming = rawIncoming
      .filter((msg: any) => msg && (msg.role === 'user' || msg.role === 'assistant'))
      .slice(-10)
      .map((msg: any) => ({
        role: msg.role as 'assistant' | 'user',
        content: String(msg.content ?? '').slice(0, 1500),
      }))
      .filter((msg) => msg.content.trim().length > 0);

    const composed = [...base, ...incoming];

    // FR-205: Voice mode uses a tight 120-token ceiling for fast TTS turnaround (~650–850 ms).
    const maxTokens = mode === 'voice' ? 120 : 260;

    return await streamOpenRouterResponse(null, model ?? null, composed, {
      maxTokens,
      temperature: 0.65,
    });
  } catch (err: any) {
    console.error('[api/chat] error handling request:', err);
    return new Response(
      JSON.stringify({
        error: 'AI service unavailable',
        details: err?.message || 'Upstream error',
      }),
      {
        status: 503,
        headers: { 'Content-Type': 'application/json' },
      }
    );
  }
};
