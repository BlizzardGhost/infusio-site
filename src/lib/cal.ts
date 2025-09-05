// src/lib/cal.ts
import { Webhook } from 'svix';

export function verifyCalSignature({
  payload, headers
}: { payload: string; headers: Headers }) {
  const secret = import.meta.env.CAL_WEBHOOK_SECRET!;
  const wh = new Webhook(secret);

  // Cal.com / Svix headers
  const id        = headers.get('svix-id') ?? '';
  const timestamp = headers.get('svix-timestamp') ?? '';
  const signature = headers.get('svix-signature') ?? '';

  // throws on invalid signature
  return wh.verify(payload, { 'svix-id': id, 'svix-timestamp': timestamp, 'svix-signature': signature });
}