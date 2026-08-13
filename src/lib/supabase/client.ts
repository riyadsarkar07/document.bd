import { createClient } from '@supabase/supabase-js';

/**
 * Supabase client — credentials preserved from the original application.
 * Values can be overridden via environment variables.
 */
const SUPABASE_URL =
  process.env.NEXT_PUBLIC_SUPABASE_URL || 'https://jlxccewipidsnjdzirtf.supabase.co';
const SUPABASE_ANON_KEY =
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY ||
  'sb_publishable_ozaVEDyu9IqtKRU1r_b3HA_PPlVPJyQ';

export const supabase = createClient(SUPABASE_URL, SUPABASE_ANON_KEY);

export const isSupabaseConfigured = Boolean(
  process.env.NEXT_PUBLIC_SUPABASE_URL && process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY,
);
