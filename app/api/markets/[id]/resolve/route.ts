import { NextResponse } from "next/server";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { statusForPgError } from "@/src/db/trades";

// POST /api/markets/:id/resolve  { winner: "yes" | "no" }  (admin only)
export async function POST(
  req: Request,
  { params }: { params: { id: string } },
) {
  const supabase = createSupabaseServerClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "not authenticated" }, { status: 401 });

  const body = await req.json().catch(() => null);
  const winner: unknown = body?.winner;
  if (winner !== "yes" && winner !== "no") {
    return NextResponse.json({ error: "winner must be 'yes' or 'no'" }, { status: 400 });
  }

  const { error } = await supabase.rpc("resolve_market", {
    p_market_id: params.id,
    p_winner: winner,
  });
  if (error) {
    return NextResponse.json({ error: error.message }, { status: statusForPgError(error.message) });
  }
  return NextResponse.json({ ok: true });
}
