// src/lib/integrations/router.ts
import type { Lead } from '../../types/receptionist';
import { INTEGRATIONS } from '../../config/integrations';
import { isEmail } from '../verify';
import { supabaseService } from '../supabase';
import { sendEmail } from '../email';

// Telegram (fire-and-forget)
async function notifyTelegram(text: string) {
  if (!INTEGRATIONS.telegram.enabled) return;
  const token = import.meta.env.TELEGRAM_BOT_TOKEN;
  const chatId = import.meta.env.TELEGRAM_CHAT_ID;
  if (!token || !chatId) return;
  try {
    await fetch(`https://api.telegram.org/bot${token}/sendMessage`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ chat_id: chatId, text, parse_mode: 'Markdown' })
    });
  } catch {}
}

// Optional remote verification (fail-open)
async function verifyEmailRemote(email: string) {
  if (!INTEGRATIONS.emailable.enabled) return { ok: true };
  const url = import.meta.env.EMAIL_VERIFY_URL;
  const key = import.meta.env.EMAIL_VERIFY_KEY;
  if (!url || !key) return { ok: true };
  try {
    const res = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${key}` },
      body: JSON.stringify({ email })
    });
    if (!res.ok) return { ok: true };
    const data = await res.json();
    const deliverable = Boolean(
      data?.deliverable ?? data?.result?.deliverable ?? data?.data?.deliverable ?? true
    );
    return { ok: deliverable };
  } catch {
    return { ok: true };
  }
}

export async function runIntegrations(lead: Lead & { wantsBooking?: boolean }) {
  // 0) email sanity
  if (!lead.email || !isEmail(lead.email)) {
    return { status: 'invalid_email' as const };
  }

  // 0.1) Consent-only update: do not touch DB unless you added a consent column.
  if (lead.mode === 'consent-update') {
    // Optional FYI ping
    const safeName = lead.name || '—';
    notifyTelegram(`*Consent update*\n• Name: *${safeName}*\n• Email: ${lead.email}`).catch(() => {});
    return { status: 'ok' as const, id: undefined, bookingUrl: undefined };
  }

  // 1) remote verify (soft)
  const { ok } = await verifyEmailRemote(lead.email);
  if (!ok) return { status: 'need_valid_email' as const };

  // 2) DB (source of truth)
  let rec: { id?: string } | null = null;
  if (INTEGRATIONS.supabase.enabled) {
    try {
      const insertPayload = {
        name:    lead.name || '—',
        email:   lead.email,
        phone:   lead.phone || null,
        message: lead.transcript || lead.mode || 'Website request via AI receptionist',
        channel: lead.channel || 'receptionist',
        utm:     lead.utm || {},
        status:  'new',
        // IMPORTANT: no 'consent' and no 'meta' here, since your table doesn't have them
      };

      const { data, error } = await supabaseService
        .from('leads')
        .insert(insertPayload)
        .select()
        .single();

      if (error) console.error('[supabase] insert error', error);
      rec = data ?? null;
    } catch (e) {
      console.error('[supabase] insert exception', e);
    }
  }

  // 3) Telegram (fire-and-forget)
  const safeName = lead.name || '—';
  const safeMsg  = lead.transcript || 'Website request via AI receptionist';
  notifyTelegram(
    `*Lead*\n• Name: *${safeName}*\n• Email: ${lead.email}\n• Phone: ${lead.phone || '—'}\n• Channel: ${lead.channel || 'receptionist'}\n• Msg: ${safeMsg}\n• Company: ${lead.company || '—'}`
  ).catch(() => {});

  // 4) Email to lead (transcript/thanks) — ensure required fields
  if (INTEGRATIONS.email.enabled && lead.email) {
    const subject = 'Thanks for reaching out to Infusio';
    const text =
      `Hi${safeName !== '—' ? ` ${safeName}` : ''},\n\n` +
      `Thanks for getting in touch via our AI receptionist.\n\n` +
      `Your message:\n${safeMsg}\n\n` +
      `We’ll get back to you shortly.\n— Infusio`;
    sendEmail({
      to: lead.email,
      subject,
      text
    }).catch((err: any) => {
      console.error('[email] send failed', err);
    });
  }

  // 5) Booking deep link
  let bookingUrl: string | undefined;
  if (INTEGRATIONS.calcom.enabled && lead.wantsBooking) {
    const handle = import.meta.env.CAL_HANDLE || 'infusio';
    bookingUrl = `https://cal.com/${handle}/intro`;
  }

  return { status: 'ok' as const, id: rec?.id, bookingUrl };
}