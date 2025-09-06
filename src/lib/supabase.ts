// /src/lib/supabase.ts
import { createClient } from '@supabase/supabase-js';

const url  = import.meta.env.PUBLIC_SUPABASE_URL;
const anon = import.meta.env.PUBLIC_SUPABASE_ANON_KEY;
const svc  = import.meta.env.SUPABASE_SERVICE_ROLE;

// Helpful guardrails in dev
if (!url)  console.error('Missing PUBLIC_SUPABASE_URL');
if (!anon) console.error('Missing PUBLIC_SUPABASE_ANON_KEY');

export const supabase = createClient(url!, anon!, {
  auth: { persistSession: false },
});

// For API routes / server use. Falls back to public client if no service key (dev-safe).
export const supabaseService = svc
  ? createClient(url!, svc)
  : supabase;