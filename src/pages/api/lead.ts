// /src/pages/api/lead.ts
import type { APIRoute } from 'astro';
import type { Lead } from '../../types/receptionist';
import { runIntegrations } from '../../lib/integrations/router';

// Parse helpers (keep your flexible body parsing)
async function parseBody(req: Request) {
  const ct = req.headers.get('content-type') || '';
  if (ct.includes('application/json')) return await req.json();
  if (ct.includes('application/x-www-form-urlencoded') || ct.includes('multipart/form-data')) {
    const fd = await req.formData();
    const obj: Record<string, any> = {};
    fd.forEach((v, k) => { obj[k] = typeof v === 'string' ? v : (v as File).name; });
    return obj;
  }
  try { return await req.json(); } catch { return {}; }
}

export const prerender = false;

export const POST: APIRoute = async ({ request }) => {
  try {
    const body = await parseBody(request);

    // Honeypot
    if ((body.hp ?? '').toString().trim() !== '') {
      return new Response(null, { status: 204 });
    }

    // Normalize → Lead (plus a couple of optional passthrough fields)
    const mode = (body.mode ?? 'lead').toString();

    const lead: Lead & {
      wantsBooking?: boolean;
      consent?: boolean;
      source?: string;
    } = {
      name:     (body.name ?? '').toString().trim(),
      email:    (body.email ?? '').toString().trim().toLowerCase(),
      phone:    (body.phone ?? '').toString().trim(),
      company:  (body.company ?? '').toString().trim(),
      website:  (body.website ?? body.site ?? '').toString().trim(),
      industry: (body.industry ?? '').toString().trim(),
      channel:  (body.channel ?? 'receptionist').toString(),
      mode,
      transcript: (body.message ?? body.messagePreview ?? '').toString().trim()
        || 'Website request via AI receptionist',
      utm:      typeof body.utm === 'object' && body.utm ? body.utm : {},
      tz:       (body.tz ?? '').toString(),
      ua:       (body.ua ?? '').toString(),
      wantsBooking: Boolean(body.wantsBooking || /book|schedule|agendar/i.test(String(body.intent || body.message || ''))),

      // NEW: pass through optional flags used by integrations
      consent: Boolean(body.consent),
      source:  (body.source ?? '').toString().trim(),
    };

    // For explicit consent updates, allow saving even if only email is present
    if (mode === 'consent-update' && !lead.email) {
      return new Response(JSON.stringify({ ok: false, error: 'Email required for consent update' }), {
        status: 400,
        headers: { 'Content-Type': 'application/json' }
      });
    }

    const result = await runIntegrations(lead);

    if (result?.status === 'invalid_email')     return new Response('Invalid email',      { status: 400 });
    if (result?.status === 'need_valid_email')  return new Response('Undeliverable email',{ status: 400 });

    // Tiny server-side breadcrumb for debugging (shows in server logs only)
    console.info('[lead] stored', {
      mode: lead.mode,
      email: lead.email || null,
      phone: lead.phone || null,
      id: result?.id ?? null
    });

    return new Response(JSON.stringify({ ok: true, id: result?.id, bookingUrl: result?.bookingUrl }), {
      status: 200,
      headers: { 'Content-Type': 'application/json' }
    });
  } catch (e: any) {
    return new Response(JSON.stringify({ ok: false, error: e?.message ?? 'Server error' }), {
      status: 500,
      headers: { 'Content-Type': 'application/json' }
    });
  }
};