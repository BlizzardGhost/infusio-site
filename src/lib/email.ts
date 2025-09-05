// src/lib/email.ts
type SendArgs = {
  to: string | string[];
  subject: string;
  html: string;
  text?: string;
  from?: string;
};

const RESEND_API = 'https://api.resend.com/emails';

export async function sendEmail({ to, subject, html, text, from }: SendArgs) {
  const apiKey = import.meta.env.RESEND_API_KEY;
  const fromAddr = from ?? import.meta.env.RESEND_FROM;
  if (!apiKey || !fromAddr) throw new Error('Resend env vars missing');

  const res = await fetch(RESEND_API, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${apiKey}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({ from: fromAddr, to, subject, html, text }),
  });

  if (!res.ok) {
    const body = await res.text().catch(() => '');
    throw new Error(`Resend error ${res.status}: ${body}`);
  }
  return res.json(); // { id: "..." }
}

// Convenience alert for receptionist leads
export async function sendLeadAlert(lead: {
  name?: string;
  email?: string;
  phone?: string;
  message?: string;
  source?: string; // e.g. "voice", "form", etc.
}) {
  const to = import.meta.env.ALERT_TO;
  if (!to) throw new Error('ALERT_TO not set');

  const subject = `🫖 New Infusio lead${lead.name ? `: ${lead.name}` : ''}`;
  const html = `
    <h2>New Lead</h2>
    <ul>
      <li><b>Name:</b> ${lead.name ?? '—'}</li>
      <li><b>Email:</b> ${lead.email ?? '—'}</li>
      <li><b>Phone:</b> ${lead.phone ?? '—'}</li>
      <li><b>Source:</b> ${lead.source ?? '—'}</li>
    </ul>
    <p style="white-space:pre-wrap"><b>Message</b><br>${(lead.message ?? '').replace(/</g,'&lt;')}</p>
  `;
  const text =
    `New Lead\n` +
    `Name: ${lead.name ?? '-'}\nEmail: ${lead.email ?? '-'}\nPhone: ${lead.phone ?? '-'}\nSource: ${lead.source ?? '-'}\n\nMessage:\n${lead.message ?? '-'}`;

  return sendEmail({ to, subject, html, text });
}