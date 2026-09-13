import { NextResponse } from "next/server";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { statusForPgError } from "@/src/db/trades";

// PATCH /api/markets/:id/status  { status: "open" | "closed" }  (admin only)
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
  const status: unknown = body?.status;
  if (status !== "open" && status !== "closed") {
    return NextResponse.json({ error: "status must be 'open' or 'closed'" }, { status: 400 });
  }

  const { error } = await supabase.rpc("set_market_status", {
    p_market_id: params.id,
    p_status: status,
  });
  if (error) {
    return NextResponse.json({ error: error.message }, { status: statusForPgError(error.message) });
  }
  return NextResponse.json({ ok: true });
}
