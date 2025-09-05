import type { APIRoute } from 'astro';
import { sendEmail } from '../../lib/email';

export const prerender = false;

export const POST: APIRoute = async () => {
  await sendEmail({
    to: import.meta.env.ALERT_TO,
    subject: 'Resend ✅ from Infusio',
    html: '<p>Hello from <b>Infusio</b>.</p>',
    text: 'Hello from Infusio.',
  });
  return new Response('ok');
};