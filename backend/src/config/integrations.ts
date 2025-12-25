// Feature toggles + env-var names (no secrets here)
export const INTEGRATIONS = {
  supabase: { enabled: true, envUrl: 'PUBLIC_SUPABASE_URL', envKey: 'PUBLIC_SUPABASE_ANON_KEY' },
  telegram: { enabled: true, envBot: 'TELEGRAM_BOT_TOKEN', envChat: 'TELEGRAM_CHAT_ID' },
  email:    { enabled: false, from: 'Infusio <hello@infusio.pro>' },  // uses lib/email.ts
  emailable:{ enabled: true, envKey: 'EMAIL_VERIFY_KEY', envUrl: 'EMAIL_VERIFY_URL' },
  calcom:   { enabled: true, handleEnv: 'CAL_HANDLE' },               // deep link for now
} as const;