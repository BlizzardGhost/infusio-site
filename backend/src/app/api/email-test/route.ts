// /backend/src/app/api/email-test/route.ts
import { sendEmail } from '@/lib/email';

export async function POST() {
  await sendEmail({
    to: process.env.ALERT_TO!,
    subject: 'Resend ✅ from Infusio',
    html: '<p>Hello from <b>Infusio</b>.</p>',
    text: 'Hello from Infusio.',
  });
  return new Response('ok');
};
