// /backend/src/app/api/webhooks/cal/route.ts
import { verifyCalSignature } from '@/lib/cal';
import { sendEmail } from '@/lib/email';

export async function POST(request: Request) {
  const payload = await request.text();

  let event: any;
  try {
    event = verifyCalSignature({ payload, headers: request.headers });
  } catch (err) {
    return new Response('Invalid signature', { status: 400 });
  }

  // Example: email the booking
  await sendEmail({
    to: process.env.ALERT_TO!,
    subject: `New Cal.com event: ${event?.type}`,
    text: JSON.stringify(event, null, 2)
  });

  return new Response('ok');
};
