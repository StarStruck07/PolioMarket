/**
 * Resolve the Supabase URL + client key from env, accepting both the current
 * key name (PUBLISHABLE_KEY, value `sb_publishable_…`) and the legacy one
 * (ANON_KEY). Either works as the browser/anon client key.
 */
export const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL!;

export const SUPABASE_KEY =
  process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY ??
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!;
