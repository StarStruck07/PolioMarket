/**
 * Example Next.js App Router handler: POST /api/trade
 *
 * Reference only — it is not wired into a Next.js app yet (no app scaffolded).
 * Copy to app/api/trade/route.ts once the Next.js project exists.
 *
 * Auth model: build a request-scoped Supabase client from the caller's session
 * (cookies), so auth.uid() inside execute_trade is the logged-in user. The RPC
 * does all validation and money movement atomically; this route just shuttles
 * input in and maps errors to status codes.
 */
import { createServerClient } from "@supabase/ssr";
import { cookies } from "next/headers";
import { NextResponse } from "next/server";
import { executeTrade, TradeError } from "../db/trades.js";

export async function POST(req: Request): Promise<Response> {
  const body = await req.json().catch(() => null);
  const marketId = body?.marketId;
  const outcome = body?.outcome;
  const shares = Number(body?.shares);

  if (typeof marketId !== "string" || (outcome !== "yes" && outcome !== "no")) {
    return NextResponse.json({ error: "marketId and outcome are required" }, { status: 400 });
  }
  if (!Number.isFinite(shares) || shares === 0) {
    return NextResponse.json({ error: "shares must be a non-zero number" }, { status: 400 });
  }

  const cookieStore = await cookies();
  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll: () => cookieStore.getAll(),
        setAll: (all) => all.forEach(({ name, value, options }) => cookieStore.set(name, value, options)),
      },
    },
  );

  const { data: auth } = await supabase.auth.getUser();
  if (!auth.user) {
    return NextResponse.json({ error: "not authenticated" }, { status: 401 });
  }

  try {
    const result = await executeTrade(supabase, { marketId, outcome, shares });
    return NextResponse.json(result, { status: 200 });
  } catch (e) {
    if (e instanceof TradeError) {
      return NextResponse.json({ error: e.message }, { status: e.status });
    }
    return NextResponse.json({ error: "internal error" }, { status: 500 });
  }
}
