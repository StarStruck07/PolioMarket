import type { SupabaseClient } from "@supabase/supabase-js";
import { prices } from "@/src/lmsr";

/**
 * Row shapes. Supabase returns NUMERIC columns as strings, so numeric fields
 * are typed as string and coerced with Number() at the edges.
 */
export interface Market {
  id: string;
  question: string;
  q_yes: string;
  q_no: string;
  b_param: string;
  status: "open" | "closed" | "resolved";
  winning_outcome: "yes" | "no" | null;
  created_at: string;
  resolved_at: string | null;
}

export interface Profile {
  id: string;
  name: string;
  balance: string;
  is_admin: boolean;
}

export interface Position {
  outcome: "yes" | "no";
  shares: string;
}

/** Marginal yes/no prices for a market, via the shared LMSR module. */
export function marketPrices(m: Pick<Market, "b_param" | "q_yes" | "q_no">) {
  return prices(Number(m.b_param), Number(m.q_yes), Number(m.q_no));
}

/** The logged-in user's profile (or null if not signed in / no row). */
export async function getProfile(
  supabase: SupabaseClient,
): Promise<Profile | null> {
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
}
