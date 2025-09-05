/// <reference types="astro/client" />

interface ImportMetaEnv {
  readonly PUBLIC_SUPABASE_URL: string;
  readonly PUBLIC_SUPABASE_ANON_KEY: string;
  readonly SUPABASE_SERVICE_ROLE?: string;
  readonly SUPABASE_SERVICE_KEY?: string;

  readonly TELEGRAM_BOT_TOKEN?: string;
  readonly TELEGRAM_CHAT_ID?: string;

  readonly OPENROUTER_API_KEY: string;
  readonly OPENROUTER_MODEL: string;

  readonly RESEND_API_KEY: string;
  readonly RESEND_FROM: string;
  readonly ALERT_TO: string;

  readonly CAL_HANDLE: string;
  readonly CAL_WEBHOOK_SECRET: string;

  readonly EMAIL_VERIFY_URL: string;
  readonly EMAIL_VERIFY_KEY: string;
}

interface ImportMeta {
  readonly env: ImportMetaEnv;
}