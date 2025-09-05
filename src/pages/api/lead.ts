// /src/pages/api/lead.ts
import type { APIRoute } from 'astro';
import { supabaseService } from '../../lib/supabase';
import { isEmail } from '../../lib/verify';
import { sendLeadEmail } from '../../lib/mailer';

// ---------------- Telegram notify ----------------
async function notifyTelegram(text: string) {
  const token = import.meta.env.TELEGRAM_BOT_TOKEN;
  const chatId = import.meta.env.TELEGRAM_CHAT_ID;
  if (!token || !chatId) return;
  try {
    const url = `https://api.telegram.org/bot${token}/sendMessage`;
    await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ chat_id: chatId, text, parse_mode: 'Markdown' })
    });
  } catch { /* noop */ }
}

// --------------- Disposable check ----------------
const DISPOSABLE_DOMAINS = new Set([
  'mailinator.com','tempmail.com','10minutemail.com','yopmail.com','guerrillamail.com',
  'trashmail.com','getnada.com','dispostable.com','fakeinbox.com','sharklasers.com',
  'throwawaymail.com','maildrop.cc','moakt.cc','mytemp.email','temp-mail.org'
]);

function isDisposable(email: string) {
  const domain = email.toLowerCase().split('@')[1] || '';
  if (!domain) return true;
  if (DISPOSABLE_DOMAINS.has(domain)) return true;
  // allow simple subdomain match e.g., foo.mailinator.com
  return Array.from(DISPOSABLE_DOMAINS).some(d => domain.endsWith(`.${d}`));
}

// Optional: remote verifier via apivault/dev proxy (if configured)
async function verifyEmailRemote(email: string) {
  const url = import.meta.env.EMAIL_VERIFY_URL;     // e.g. your apivault.dev proxy
  const key = import.meta.env.EMAIL_VERIFY_KEY;     // bearer or api-key header
  if (!url || !key) return { ok: true };            // skip if not configured
  try {
    const res = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${key}` },
      body: JSON.stringify({ email })
    });
    if (!res.ok) return { ok: true }; // fail-open
    const data = await res.json();
    // expect a shape like { deliverable: boolean } but tolerate variations
    const deliverable = Boolean(
      data?.deliverable ?? data?.result?.deliverable ?? data?.data?.deliverable ?? true
    );
    return { ok: deliverable };
  } catch {
    return { ok: true }; // fail-open
  }
}

// ------------------ Body parsing ------------------
async function parseBody(req: Request) {
  const ct = req.headers.get('content-type') || '';
  if (ct.includes('application/json')) {
    return await req.json();
  }
  if (ct.includes('application/x-www-form-urlencoded') || ct.includes('multipart/form-data')) {
    const fd = await req.formData();
    const obj: Record<string, any> = {};
    fd.forEach((v, k) => { obj[k] = typeof v === 'string' ? v : (v as File).name; });
    return obj;
  }
  // Last resort
  try { return await req.json(); } catch { return {}; }
}

// --------------------- Route ----------------------
export const POST: APIRoute = async ({ request }) => {
  try {
    const body = await parseBody(request);

    // Honeypot: if bots fill hidden field "hp", do nothing
    if ((body.hp ?? '').toString().trim() !== '') {
      return new Response(null, { status: 204 });
    }

    // Normalize inputs
    const name     = (body.name ?? '').toString().trim();
    const email    = (body.email ?? '').toString().trim().toLowerCase();
    const phone    = (body.phone ?? '').toString().trim();
    const message  = (body.message ?? body.messagePreview ?? '').toString().trim();
    const company  = (body.company ?? '').toString().trim();
    const website  = (body.website ?? body.site ?? '').toString().trim();
    const industry = (body.industry ?? '').toString().trim();
    const channel  = (body.channel ?? 'receptionist').toString();
    const mode     = (body.mode ?? 'lead').toString();
    const utm      = typeof body.utm === 'object' && body.utm ? body.utm : {};
    const tz       = (body.tz ?? '').toString();
    const ua       = (body.ua ?? '').toString();

    if (!name || !isEmail(email)) {
      return new Response('Invalid', { status: 400 });
    }
    if (isDisposable(email)) {
      return new Response('Disposable email not allowed', { status: 400 });
    }
    const { ok: deliverable } = await verifyEmailRemote(email);
    if (!deliverable) {
      return new Response('Undeliverable email', { status: 400 });
    }

    // Insert: keep your original columns, tuck extras into meta JSON
    const meta = { company, website, industry, tz, ua, mode, source: body.source ?? 'infusio-site' };

    const { data, error } = await supabaseService
      .from('leads')
      .insert({
        name, email, phone,
        message,
        channel,
        utm,
        status: 'new',
        meta
      })
      .select()
      .single();

    if (error) throw error;

    // Notify
    await sendLeadEmail({ name, email, message });
    await notifyTelegram(
      `🆕 *Lead*\n• Name: *${name}*\n• Email: ${email}\n• Phone: ${phone || '—'}\n• Channel: ${channel}\n• Msg: ${message || '—'}\n• Company: ${company || '—'}`
    );

    return new Response(JSON.stringify({ ok: true, id: data.id }), { status: 200 });
  } catch (e: any) {
    return new Response(e?.message ?? 'Server error', { status: 500 });
  }
};