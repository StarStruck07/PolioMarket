import Link from "next/link";
import { notFound } from "next/navigation";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { getProfile, marketPrices, type Market, type Position } from "@/lib/market";
import TradeWidget from "@/components/TradeWidget";
import AdminMarketControls from "@/components/AdminMarketControls";

export default async function MarketPage({ params }: { params: { id: string } }) {
  const supabase = createSupabaseServerClient();

  const { data: marketRow } = await supabase
    .from("markets")
    .select("*")
    .eq("id", params.id)
    .maybeSingle();
  const market = marketRow as Market | null;
  if (!market) notFound();

  const profile = await getProfile(supabase).catch(() => null);

  // Owner-scoped by RLS: returns only the current user's positions.
  const { data: posRows } = await supabase
    .from("positions")
    .select("outcome, shares")
    .eq("market_id", market.id);
  const positions = (posRows as Position[] | null) ?? [];
  const heldYes = Number(positions.find((p) => p.outcome === "yes")?.shares ?? 0);
  const heldNo = Number(positions.find((p) => p.outcome === "no")?.shares ?? 0);

  const p = marketPrices(market);
  const yesPct = Math.round(p.yes * 100);

  return (
    <>
      <p><Link href="/">← All markets</Link></p>
      <div className="card">
        <div className="row">
          <h2 style={{ flex: 1, margin: 0 }}>{market.question}</h2>
          <span className={`pill ${market.status}`}>{market.status}</span>
        </div>
        <div className="pricebar" style={{ marginTop: 12 }}>
          <div className="yes" style={{ width: `${yesPct}%` }} />
          <div className="no" style={{ width: `${100 - yesPct}%` }} />
        </div>
        <div className="row muted" style={{ justifyContent: "space-between" }}>
          <span>YES {(p.yes * 100).toFixed(1)}%</span>
          <span>NO {(p.no * 100).toFixed(1)}%</span>
        </div>
        <p className="muted" style={{ marginTop: 8 }}>
          Liquidity b = {Number(market.b_param)} · q = [{Number(market.q_yes).toFixed(2)},{" "}
          {Number(market.q_no).toFixed(2)}]
        </p>
        {market.status === "resolved" && (
          <p className="ok">Resolved — {market.winning_outcome?.toUpperCase()} won. Winning shares paid 1 pt each.</p>
        )}
      </div>

      {market.status === "open" && (
        <div className="card">
          <h3>Trade</h3>
          <TradeWidget
            marketId={market.id}
            b={Number(market.b_param)}
            qYes={Number(market.q_yes)}
            qNo={Number(market.q_no)}
            heldYes={heldYes}
            heldNo={heldNo}
            balance={Number(profile?.balance ?? 0)}
            loggedIn={!!profile}
          />
        </div>
      )}

      {profile && (heldYes > 0 || heldNo > 0) && (
        <div className="card">
          <h3>Your position</h3>
          <p>YES: {heldYes.toFixed(2)} · NO: {heldNo.toFixed(2)}</p>
        </div>
      )}

      {profile?.is_admin && (
        <div className="card">
          <h3>Admin</h3>
          <AdminMarketControls marketId={market.id} status={market.status} />
        </div>
      )}
    </>
  );
}
