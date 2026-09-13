import Link from "next/link";
import { notFound } from "next/navigation";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import {
  marketPrices,
  outcomeLabels,
  sides,
  type Market,
  type Position,
  type PricePoint,
} from "@/lib/market";
import { getProfile } from "@/lib/profile";
import { sportMeta } from "@/lib/tags";
import Avatar from "@/components/Avatar";
import PriceChart from "@/components/PriceChart";
import TradeWidget from "@/components/TradeWidget";
import AdminMarketControls from "@/components/AdminMarketControls";
import EditMarketForm from "@/components/EditMarketForm";

export default async function MarketPage({ params }: { params: { id: string } }) {
  const supabase = createSupabaseServerClient();

  // Run the independent reads in parallel to avoid a request waterfall.
  const [marketRes, profile, posRes, histRes] = await Promise.all([
    supabase.from("markets").select("*").eq("id", params.id).maybeSingle(),
    getProfile().catch(() => null),
    supabase.from("positions").select("outcome, shares").eq("market_id", params.id),
    supabase.rpc("market_price_history", { p_market_id: params.id }),
  ]);

  const market = marketRes.data as Market | null;
  if (!market) notFound();

  const positions = (posRes.data as Position[] | null) ?? [];
  const heldYes = Number(positions.find((p) => p.outcome === "yes")?.shares ?? 0);
  const heldNo = Number(positions.find((p) => p.outcome === "no")?.shares ?? 0);
  const history = (histRes.data as PricePoint[] | null) ?? [];

  const p = marketPrices(market);
  const yesPct = Math.round(p.yes * 100);
  const { a, b } = sides(market);
  const sm = sportMeta(market.sport);
  const labels = outcomeLabels(market);

  return (
    <>
      <p><Link href="/">← All matches</Link></p>

      <div className="card match-header">
        <div className="match-header-tags">
          <span className="chip" style={{ borderColor: sm.color, color: sm.color }}>
            {sm.emoji} {market.sport ?? "Match"}
          </span>
          {market.round && <span className="chip subtle">{market.round}</span>}
          <span className={`pill ${market.status}`}>{market.status}</span>
        </div>

        <div className="match-header-teams">
          <div className="team big">
            <Avatar name={a} size={64} logo={market.team_a_logo} />
            <span className="team-name">{a}</span>
          </div>
          {b && (
            <>
              <span className="vs big">vs</span>
              <div className="team big">
                <Avatar name={b} size={64} logo={market.team_b_logo} />
                <span className="team-name">{b}</span>
              </div>
            </>
          )}
        </div>
        <p className="sport-sub">{sm.emoji} {market.sport ?? "Prediction"}{market.round ? ` · ${market.round}` : ""}</p>

        <div className="pricebar" style={{ marginTop: 14 }}>
          <div className="yes" style={{ width: `${yesPct}%` }} />
          <div className="no" style={{ width: `${100 - yesPct}%` }} />
        </div>
        <div className="price-legend">
          <span className="yes-t">{labels.yes} {(p.yes * 100).toFixed(1)}%</span>
          <span className="no-t">{labels.no} {(p.no * 100).toFixed(1)}%</span>
        </div>

        {market.status === "resolved" && (
          <p className="ok" style={{ marginTop: 10 }}>
            ✔ Resolved — {(market.winning_outcome === "yes" ? labels.yes : labels.no)} won. Winning shares paid 1 pt each.
          </p>
        )}
      </div>

      <div className="card">
        <h3>Price history</h3>
        <PriceChart points={history} />
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
            yesLabel={labels.yes}
            noLabel={labels.no}
          />
        </div>
      )}

      {profile && (heldYes > 0 || heldNo > 0) && (
        <div className="card">
          <h3>Your position</h3>
          <p>YES: <b>{heldYes.toFixed(2)}</b> · NO: <b>{heldNo.toFixed(2)}</b></p>
        </div>
      )}

      {profile?.is_admin && (
        <div className="card admin-card">
          <h3>Admin controls</h3>
          <AdminMarketControls
            marketId={market.id}
            status={market.status}
            yesLabel={labels.yes}
            noLabel={labels.no}
          />
          <h4 style={{ marginTop: 18 }}>Edit match</h4>
          <EditMarketForm market={market} />
        </div>
      )}
    </>
  );
}
