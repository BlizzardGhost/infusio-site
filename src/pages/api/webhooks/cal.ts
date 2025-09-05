// src/pages/api/webhooks/cal.ts
import type { APIRoute } from 'astro';
import { verifyCalSignature } from '../../../lib/cal';
import { sendEmail } from '../../../lib/email';

export const prerender = false; // this must run on the server

export const POST: APIRoute = async ({ request }) => {
  const payload = await request.text();

  let event: any;
  try {
    event = verifyCalSignature({ payload, headers: request.headers });
  } catch (err) {
    return new Response('Invalid signature', { status: 400 });
  }

  // Example: email the booking
  await sendEmail({
    subject: `New Cal.com event: ${event?.type}`,
    text: JSON.stringify(event, null, 2)
  });

  return new Response('ok');
};