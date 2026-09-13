import { NextResponse } from "next/server";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { statusForPgError } from "@/src/db/trades";

// PATCH /api/markets/:id — edit market metadata (admin only)
// { question?, team_a?, team_b?, sport?, round?, b_param? }
export async function PATCH(
  req: Request,
  { params }: { params: { id: string } },
) {
  const supabase = createSupabaseServerClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "not authenticated" }, { status: 401 });

  const body = await req.json().catch(() => null);
  const str = (v: unknown) => (typeof v === "string" && v.trim() ? v.trim() : null);
  const bParam = body?.b_param == null || body.b_param === "" ? null : Number(body.b_param);
  if (bParam != null && (!Number.isFinite(bParam) || bParam <= 0)) {
    return NextResponse.json({ error: "b_param must be > 0" }, { status: 400 });
  }

  const { error } = await supabase.rpc("update_market", {
    p_market_id: params.id,
    p_question: str(body?.question),
    p_team_a: str(body?.team_a),
    p_team_b: str(body?.team_b),
    p_sport: str(body?.sport),
    p_round: str(body?.round),
    p_b_param: bParam,
    p_team_a_logo: str(body?.team_a_logo),
    p_team_b_logo: str(body?.team_b_logo),
  });
  if (error) {
    return NextResponse.json({ error: error.message }, { status: statusForPgError(error.message) });
  }
  return NextResponse.json({ ok: true });
}

// DELETE /api/markets/:id — delete an untraded market (admin only)
export async function DELETE(
  _req: Request,
  { params }: { params: { id: string } },
) {
  const supabase = createSupabaseServerClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "not authenticated" }, { status: 401 });

  const { error } = await supabase.rpc("delete_market", { p_market_id: params.id });
  if (error) {
    return NextResponse.json({ error: error.message }, { status: statusForPgError(error.message) });
  }
  return NextResponse.json({ ok: true });
}
