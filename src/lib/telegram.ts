// Lightweight Telegram notifier
// Requires env: TELEGRAM_BOT_TOKEN, TELEGRAM_CHAT_ID

const BOT_TOKEN = import.meta.env.TELEGRAM_BOT_TOKEN;
const CHAT_ID   = import.meta.env.TELEGRAM_CHAT_ID;

// Telegram supports MarkdownV2/HTML; we use MarkdownV2 for safety.
function escapeMdV2(s: string) {
  // Escape special MarkdownV2 chars
  return s.replace(/([_*\[\]()~`>#+\-=|{}.!\\])/g, '\\$1');
}

export async function notifyTelegram(
  text: string,
  opts: { silent?: boolean; parseMode?: 'MarkdownV2'|'HTML' } = {},
) {
  if (!BOT_TOKEN || !CHAT_ID) {
    console.warn('[telegram] Missing TELEGRAM_BOT_TOKEN or TELEGRAM_CHAT_ID.');
    return;
  }

  // Telegram limit is ~4096 chars
  let bodyText = text ?? '';
  if (opts.parseMode !== 'HTML') bodyText = escapeMdV2(bodyText);
  if (bodyText.length > 3900) bodyText = bodyText.slice(0, 3900) + '…';

  const payload = {
    chat_id: CHAT_ID,
    text: bodyText,
    parse_mode: opts.parseMode ?? 'MarkdownV2',
    disable_notification: !!opts.silent,
  };

  try {
    const res = await fetch(`https://api.telegram.org/bot${BOT_TOKEN}/sendMessage`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify(payload),
    });
    if (!res.ok) {
      const t = await res.text().catch(() => '');
      console.warn('[telegram] sendMessage failed:', res.status, t);
    }
  } catch (err) {
    console.warn('[telegram] network error:', err);
  }
}