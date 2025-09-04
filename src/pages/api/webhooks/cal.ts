import type { APIRoute } from 'astro';
import { supabaseService } from '../../lib/supabase';

export const POST: APIRoute = async ({ request }) => {
  // Verify signature if you configure it (Cal.com sends headers)
  const payload = await request.json();
  const evt = payload?.event || 'unknown';
  const appt = payload?.payload || {};
  await supabaseService.from('appointments').insert({
    lead_id: null,
    cal_event_id: appt?.id || '',
    start: appt?.start_time,
    end: appt?.end_time,
    status: appt?.status || evt
  });
  return new Response('ok');
};