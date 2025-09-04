import type { APIRoute } from 'astro';
export const GET: APIRoute = () => new Response('ok ' + new Date().toISOString());