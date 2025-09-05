// src/lib/telegram.ts
export async function sendTelegram(message: string) {
  const token = import.meta.env.TELEGRAM_BOT_TOKEN!;
  const chat  = import.meta.env.TELEGRAM_CHAT_ID!;
  const url   = `https://api.telegram.org/bot${token}/sendMessage`;

  const res = await fetch(url, {
    method: 'POST',
    headers: {'Content-Type': 'application/json'},
    body: JSON.stringify({ chat_id: chat, text: message, parse_mode: 'HTML' })
  });

  if (!res.ok) {
    const msg = await res.text().catch(() => res.statusText);
    throw new Error(`Telegram error: ${res.status} ${msg}`);
  }
  return res.json();
}