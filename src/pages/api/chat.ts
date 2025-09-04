import type { APIRoute } from 'astro';
import { streamOpenRouter } from '../../lib/openrouter';

export const POST: APIRoute = async ({ request }) => {
  try {
    const { message } = await request.json();
    if (!message || typeof message !== 'string') return new Response('Bad request', { status: 400 });

    const body = await streamOpenRouter(message);
    return new Response(body, {
      headers: { 'Content-Type': 'text/plain; charset=utf-8', 'Cache-Control': 'no-store' }
    });
  } catch (e:any) {
    return new Response(e?.message ?? 'Server error', { status: 500 });
  }
};