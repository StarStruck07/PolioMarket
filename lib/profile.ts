import { cache } from "react";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import type { Profile } from "@/lib/market";

/**
 * The logged-in user's profile, or null. Wrapped in React cache() so the
 * layout and the page share ONE auth round-trip + query per request instead
 * of each doing their own.
 */
export const getProfile = cache(async (): Promise<Profile | null> => {
  const supabase = createSupabaseServerClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return null;
  const { data } = await supabase
    .from("users")
    .select("id, name, balance, is_admin")
    .eq("id", user.id)
    .maybeSingle();
  return (data as Profile | null) ?? null;
});
