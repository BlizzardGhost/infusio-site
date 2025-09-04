export async function streamOpenRouter(message: string) {
  const model = import.meta.env.OPENROUTER_MODEL || 'openai/gpt-4o-mini';
  const res = await fetch('https://openrouter.ai/api/v1/chat/completions', {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${import.meta.env.OPENROUTER_API_KEY}`,
      'Content-Type': 'application/json'
    },
    body: JSON.stringify({
      model,
      stream: true,
      messages: [
        { role: 'system', content: 'You are Infusio Receptionist: human-first, concise, bilingual (EN/ES), no medical/legal advice, never collect sensitive PII. Offer booking link (/book) if relevant.'},
        { role: 'user', content: message }
      ]
    })
  });
  if (!res.ok || !res.body) throw new Error('OpenRouter error');
  return res.body; // ReadableStream
}