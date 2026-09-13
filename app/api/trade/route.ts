import { NextResponse } from "next/server";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { executeTrade, TradeError } from "@/src/db/trades";

// POST /api/trade  { marketId, outcome: "yes"|"no", shares: number (signed) }
export async function POST(req: Request) {
  const supabase = createSupabaseServerClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "not authenticated" }, { status: 401 });

  const body = await req.json().catch(() => null);
  const marketId: unknown = body?.marketId ?? body?.market_id;
  const outcome: unknown = body?.outcome;
  const shares = Number(body?.shares);

  if (typeof marketId !== "string" || (outcome !== "yes" && outcome !== "no")) {
    return NextResponse.json({ error: "marketId and outcome are required" }, { status: 400 });
  }
  if (!Number.isFinite(shares) || shares === 0) {
    return NextResponse.json({ error: "shares must be a non-zero number" }, { status: 400 });
  }

  try {
    const result = await executeTrade(supabase, { marketId, outcome, shares });
    return NextResponse.json(result);
  } catch (e) {
    if (e instanceof TradeError) {
      return NextResponse.json({ error: e.message }, { status: e.status });
    }
    return NextResponse.json({ error: "internal error" }, { status: 500 });
  }
}
