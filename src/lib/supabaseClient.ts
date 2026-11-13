import { createClient, type SupabaseClient } from '@supabase/supabase-js';

const url = import.meta.env.VITE_SUPABASE_URL as string | undefined;
const key = import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY as string | undefined;

/** Supabase client, or null when the env vars are not set (falls back to localStorage). */
// Tests always use localStorage so they never hit the real project.
export const supabase: SupabaseClient | null =
  url && key && import.meta.env.MODE !== 'test' ? createClient(url, key) : null;
