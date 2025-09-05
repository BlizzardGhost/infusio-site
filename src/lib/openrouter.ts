// src/lib/openrouter.ts
export async function streamOpenRouter(
  message: string,
  model?: string // 👈 allow override
) {
  const apiKey = import.meta.env.OPENROUTER_API_KEY!;
  const useModel = model || import.meta.env.OPENROUTER_MODEL || 'meta-llama/llama-3.1-8b-instruct:free';

  const res = await fetch('https://openrouter.ai/api/v1/chat/completions', {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${apiKey}`,
      'Content-Type': 'application/json',
      // recommended by OpenRouter:
      'HTTP-Referer': 'https://infusio.pro',
      'X-Title': 'Infusio Receptionist'
    },
    body: JSON.stringify({
      model: useModel,
      stream: true,
      messages: [
        {
          role: 'system',
          content:
            'You are Infusio Receptionist: human-first, concise, bilingual (EN/ES), no medical/legal advice, never collect sensitive PII. Offer booking link (/book) if relevant.'
        },
        { role: 'user', content: message }
      ]
    })
  });

  if (!res.ok || !res.body) throw new Error(`OpenRouter error: ${res.status}`);
  return res.body; // ReadableStream
}

// Optional: wrap as a Response for /api/chat
export async function streamOpenRouterResponse(
  message: string,
  model?: string
): Promise<Response> {
  const stream = await streamOpenRouter(message, model);
  return new Response(stream, {
    headers: { 'Content-Type': 'text/event-stream' }
  });
}