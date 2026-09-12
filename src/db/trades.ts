import type { SupabaseClient } from "@supabase/supabase-js";
import type { Side } from "../lmsr.js";

/** Result row returned by the execute_trade RPC. */
export interface TradeResult {
  trade_cost: number;
  new_balance: number;
  new_q_yes: number;
  new_q_no: number;
  price_yes: number;
  price_no: number;
  new_position: number;
}

/** A trade rejection carrying the HTTP status the API route should return. */
export class TradeError extends Error {
  constructor(
    public readonly status: number,
    message: string,
  ) {
    super(message);
    this.name = "TradeError";
  }
}

/**
 * Execute a buy (shares > 0) or sell (shares < 0) via the atomic RPC.
 *
 * `supabase` must be a request-scoped client carrying the caller's auth session,
 * so auth.uid() inside the function resolves to this user.
 *
 * Raised plpgsql exceptions are mapped to HTTP status codes per the spec:
 *   400 bad input / insufficient balance / market closed
 *   403 not admin (n/a here, but kept for symmetry)
 *   404 missing market/user
 *   409 conflict (already resolved — n/a here)
 */
export async function executeTrade(
  supabase: SupabaseClient,
  args: { marketId: string; outcome: Side; shares: number },
): Promise<TradeResult> {
  const { data, error } = await supabase
    .rpc("execute_trade", {
      p_market_id: args.marketId,
      p_outcome: args.outcome,
      p_shares: args.shares,
    })
    .single<TradeResult>();

  if (error) throw new TradeError(statusForPgError(error.message), error.message);
  if (!data) throw new TradeError(500, "execute_trade returned no row");
  return data;
}

/**
 * Map a plpgsql `raise exception 'prefix: detail'` message to an HTTP status.
 * Prefixes are defined by the SQL functions (see the spec's Conventions table).
 */
function statusForPgError(message: string): number {
  if (message.startsWith("not_authenticated")) return 401;
  if (message.startsWith("admin_only")) return 403;
  if (
    message.startsWith("market_not_found") ||
    message.startsWith("user_not_found") ||
    message.startsWith("market_not_found_or_resolved")
  ) {
    return 404;
  }
  if (message.startsWith("already_resolved")) return 409;
  // invalid_shares, invalid_input, market_not_open,
  // insufficient_position, insufficient_balance, use_resolve_market, ...
  return 400;
}
