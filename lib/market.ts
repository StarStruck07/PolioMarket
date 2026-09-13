import { prices } from "@/src/lmsr";

/**
 * Row shapes. Supabase returns NUMERIC columns as strings, so numeric fields
 * are typed as string and coerced with Number() at the edges.
 *
 * This module is client-safe (no server-only imports): getProfile lives in
 * lib/profile.ts.
 */
export interface Market {
  id: string;
  question: string;
  team_a: string | null;
  team_b: string | null;
  team_a_logo: string | null;
  team_b_logo: string | null;
  sport: string | null;
  round: string | null;
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

export interface AdminUser {
  id: string;
  name: string;
  balance: string;
  is_admin: boolean;
}

export interface PricePoint {
  t: string;
  price_yes: string;
  price_no: string;
}

export interface LeaderRow {
  rank: number;
  name: string;
  balance: string;
}

/** Marginal prices for a market, via the shared LMSR module. */
export function marketPrices(m: Pick<Market, "b_param" | "q_yes" | "q_no">) {
  return prices(Number(m.b_param), Number(m.q_yes), Number(m.q_no));
}

/** "Team A" / "Team B" if this market is a match, else split the question. */
export function sides(m: Pick<Market, "team_a" | "team_b" | "question">): {
  a: string;
  b: string | null;
} {
  if (m.team_a && m.team_b) return { a: m.team_a, b: m.team_b };
  const parts = m.question.split(/\s+vs\.?\s+/i);
  if (parts.length === 2) return { a: parts[0]!.trim(), b: parts[1]!.trim() };
  return { a: m.question, b: null };
}

/**
 * Labels for the two outcomes. Convention: YES = Team A wins, NO = Team B wins.
 * Falls back to "Yes"/"No" when the market has no teams.
 */
export function outcomeLabels(m: Pick<Market, "team_a" | "team_b" | "question">): {
  yes: string;
  no: string;
} {
  const { a, b } = sides(m);
  if (b) return { yes: a, no: b };
  return { yes: "Yes", no: "No" };
}
