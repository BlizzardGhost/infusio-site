import type { APIRoute } from 'astro';
import { supabase } from '../../../lib/supabase';

export const post: APIRoute = async ({ request }) => {
  try {
    const data = await request.json();
    console.log('Webhook received:', data);

    // Example: insert into Supabase
    const { error } = await supabase.from('webhooks').insert({ payload: data });
    if (error) throw error;

    return new Response(JSON.stringify({ ok: true }), { status: 200 });
  } catch (err: any) {
    console.error(err);
    return new Response(JSON.stringify({ error: err.message }), { status: 500 });
  }
};