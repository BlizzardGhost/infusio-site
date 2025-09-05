// src/lib/verify.ts
export type LeadInput = {
  name: string;
  email: string;
  message: string;
  phone?: string;
  source?: string;
};

const emailRx = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

export function validateLead(payload: any): {
  ok: boolean;
  data?: LeadInput;
  errors?: string[];
} {
  const errors: string[] = [];
  const name = String(payload?.name ?? '').trim();
  const email = String(payload?.email ?? '').trim();
  const message = String(payload?.message ?? '').trim();
  const phone = payload?.phone ? String(payload.phone).trim() : undefined;
  const source = payload?.source ? String(payload.source).trim() : undefined;

  if (name.length < 2 || name.length > 80) errors.push('Name must be 2–80 chars.');
  if (!emailRx.test(email)) errors.push('Valid email required.');
  if (message.length < 2 || message.length > 2000) errors.push('Message must be 2–2000 chars.');
  if (phone && phone.length > 30) errors.push('Phone too long.');

  if (errors.length) return { ok: false, errors };
  return { ok: true, data: { name, email, message, phone, source } };
}