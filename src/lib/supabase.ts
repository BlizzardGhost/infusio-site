import { createClient } from '@supabase/supabase-js';

export const supabaseAnon = createClient(
  import.meta.env.SUPABASE_URL!,
  import.meta.env.SUPABASE_ANON_KEY!
);

export const supabaseService = createClient(
  import.meta.env.SUPABASE_URL!,
  import.meta.env.SUPABASE_SERVICE_ROLE!,
  { auth: { persistSession: false }, global: { headers: { 'X-Client-Info': 'infusio-site' } } }
);