import { NextResponse } from "next/server";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { statusForPgError } from "@/src/db/trades";

// PATCH /api/admin/users  { user_id, balance }  (admin only)
export async function PATCH(req: Request) {
  const supabase = createSupabaseServerClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "not authenticated" }, { status: 401 });

  const body = await req.json().catch(() => null);
  const userId: unknown = body?.user_id;
  const balance = Number(body?.balance);
  if (typeof userId !== "string") {
    return NextResponse.json({ error: "user_id required" }, { status: 400 });
  }
  if (!Number.isFinite(balance) || balance < 0) {
    return NextResponse.json({ error: "balance must be >= 0" }, { status: 400 });
  }

  const { error } = await supabase.rpc("admin_set_balance", {
    p_user_id: userId,
    p_balance: balance,
  });
  if (error) {
    return NextResponse.json({ error: error.message }, { status: statusForPgError(error.message) });
  }
  return NextResponse.json({ ok: true });
}
