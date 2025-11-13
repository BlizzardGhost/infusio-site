// backend/src/lib/supabase.ts
import { createClient } from '@supabase/supabase-js';

// These must exist server-side
const url  = process.env.SUPABASE_URL;
const anon = process.env.SUPABASE_KEY;            // anon/public key (safe for client)
const svc  = process.env.SUPABASE_SERVICE_ROLE;   // service role (SERVER ONLY)

// Guardrails
if (!url)  console.error('Missing SUPABASE_URL');
if (!anon) console.error('Missing SUPABASE_KEY (anon/public)');
if (!svc)  console.warn('Missing SUPABASE_SERVICE_ROLE (server inserts will fail under RLS)');

// Public client (use in pages/components or any place that might run client-side)
export const supabase = createClient(url!, anon!, {
  auth: { persistSession: true, autoRefreshToken: true }
});

// Service client (server-only, never import in browser code)
export const supabaseService = createClient(url!, (svc || anon)!, {
  auth: { persistSession: false, autoRefreshToken: false }
});