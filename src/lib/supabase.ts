// src/lib/supabase.ts
import { createClient, type SupabaseClient } from '@supabase/supabase-js';

// Public (browser-safe) client
const url  = import.meta.env.PUBLIC_SUPABASE_URL!;
const anon = import.meta.env.PUBLIC_SUPABASE_ANON_KEY!;
export const supabase: SupabaseClient = createClient(url, anon, {
  auth: { persistSession: false }
});

// Server-only service client (used by API routes)
let svc: SupabaseClient;
const serviceKey =
  import.meta.env.SUPABASE_SERVICE_ROLE ||
  import.meta.env.SUPABASE_SERVICE_KEY || ''; // allow either name

// Only instantiate on the server; never ship a service key to the browser bundle.
if (import.meta.env.SSR) {
  // If you haven’t set a service key yet, we fall back to anon so builds don’t crash.
  // Inserts will still work only if your RLS allows it.
  svc = createClient(url, serviceKey || anon, { auth: { persistSession: false } });
}

// Named export expected by src/pages/api/lead.ts
export const supabaseService = svc!;