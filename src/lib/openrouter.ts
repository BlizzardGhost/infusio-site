// /src/lib/openrouter.ts
export async function streamOpenRouter(
  message: string | null,
  model?: string | null,
  messages?: { role:'system'|'user'|'assistant', content:string }[] | null
) {
  const apiKey = import.meta.env.OPENROUTER_API_KEY!;
  const chosen  = model || import.meta.env.OPENROUTER_MODEL || 'deepseek/deepseek-chat-v3.1:free';

  // Build messages: use provided list if present; otherwise use default system + single user
  const chat = Array.isArray(messages) && messages.length
    ? messages
    : [
        {
          role: 'system',
          content:
            'You are Infusio Receptionist: human-first, concise, bilingual (EN/ES). ' +
            'No medical/legal advice. Never collect sensitive PII. When appropriate, ' +
            'politely ask for name, email, and consent to contact the user to schedule. ' +
            'Keep answers brief; one question at a time.'
        },
        { role: 'user', content: String(message ?? '') }
      ];

  const res = await fetch('https://openrouter.ai/api/v1/chat/completions', {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${apiKey}`,
      'Content-Type': 'application/json',
      'HTTP-Referer': 'https://infusio.pro',
      'X-Title': 'Infusio Receptionist'
    },
    body: JSON.stringify({ model: chosen, stream: true, messages: chat })
  });

  if (!res.ok || !res.body) throw new Error(`OpenRouter error: ${res.status}`);
  return res.body;
}

export async function streamOpenRouterResponse(
  message: string | null,
  model?: string | null,
  messages?: { role:'system'|'user'|'assistant', content:string }[] | null
): Promise<Response> {
  const stream = await streamOpenRouter(message, model, messages);
  return new Response(stream, { headers: { 'Content-Type': 'text/event-stream' } });
}