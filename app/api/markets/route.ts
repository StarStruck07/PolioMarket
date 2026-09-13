import { NextResponse } from "next/server";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { statusForPgError } from "@/src/db/trades";

// GET /api/markets — list all markets (public)
export async function GET() {
  const supabase = createSupabaseServerClient();
  const { data, error } = await supabase
    .from("markets")
    .select("*")
    .order("created_at", { ascending: false });
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json(data);
}

// POST /api/markets — create a market (admin only)
// { question?, b_param?, team_a?, team_b?, sport?, round? }
export async function POST(req: Request) {
  const supabase = createSupabaseServerClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "not authenticated" }, { status: 401 });

  const body = await req.json().catch(() => null);
  const str = (v: unknown) => (typeof v === "string" && v.trim() ? v.trim() : null);
  const bParam = body?.b_param == null ? 100 : Number(body.b_param);
  if (!Number.isFinite(bParam) || bParam <= 0) {
    return NextResponse.json({ error: "b_param must be > 0" }, { status: 400 });
  }

  const { data, error } = await supabase.rpc("create_market", {
    p_question: str(body?.question),
    p_b_param: bParam,
    p_team_a: str(body?.team_a),
    p_team_b: str(body?.team_b),
    p_sport: str(body?.sport),
    p_round: str(body?.round),
  });
  if (error) {
    return NextResponse.json({ error: error.message }, { status: statusForPgError(error.message) });
  }
  return NextResponse.json({ id: data }, { status: 201 });
}
