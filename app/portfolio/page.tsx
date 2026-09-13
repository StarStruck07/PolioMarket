import Link from "next/link";
import { redirect } from "next/navigation";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { getProfile, marketPrices, sides, type Market } from "@/lib/market";
import { sportMeta } from "@/lib/tags";

interface Holding {
  outcome: "yes" | "no";
  shares: string;
  market: Market;
}

export default async function PortfolioPage() {
  const supabase = createSupabaseServerClient();
  const [profile, posRes] = await Promise.all([
    getProfile(supabase).catch(() => null),
    supabase.from("positions").select("outcome, shares, market:markets(*)"),
  ]);
  if (!profile) redirect("/login");

  const data = posRes.data;
  const holdings = ((data as unknown as Holding[] | null) ?? []).filter(
    (h) => h.market && Number(h.shares) > 0,
  );

  const active = holdings.filter((h) => h.market.status !== "resolved");
  const past = holdings.filter((h) => h.market.status === "resolved");

  return (
    <>
      <h1>Portfolio</h1>
      <div className="balance-card">
        <span>Balance</span>
        <strong>{Number(profile.balance).toFixed(2)} pts</strong>
      </div>

      <h3 className="section-title">🔥 Active bets</h3>
      {active.length === 0 ? (
        <p className="muted">No active positions. <Link href="/">Find a match →</Link></p>
      ) : (
        active.map((h) => {
          const p = marketPrices(h.market);
          const shares = Number(h.shares);
          const price = h.outcome === "yes" ? p.yes : p.no;
          const value = shares * price;
          const { a, b } = sides(h.market);
          return (
            <Link key={`${h.market.id}-${h.outcome}`} href={`/market/${h.market.id}`} className="holding">
              <div>
                <div className="holding-title">
                  {sportMeta(h.market.sport).emoji} {b ? `${a} vs ${b}` : a}
                </div>
                <div className="muted">
                  {shares.toFixed(2)} <span className={h.outcome === "yes" ? "yes-t" : "no-t"}>{h.outcome.toUpperCase()}</span> shares
                </div>
              </div>
              <div className="holding-val">
                <div><b>{value.toFixed(2)}</b> pts</div>
                <div className="muted">@ {(price * 100).toFixed(0)}%</div>
              </div>
            </Link>
          );
        })
      )}

      <h3 className="section-title">🏁 Past bets</h3>
      {past.length === 0 ? (
        <p className="muted">No settled positions yet.</p>
      ) : (
        past.map((h) => {
          const shares = Number(h.shares);
          const won = h.market.winning_outcome === h.outcome;
          const { a, b } = sides(h.market);
          return (
            <Link key={`${h.market.id}-${h.outcome}`} href={`/market/${h.market.id}`} className="holding">
              <div>
                <div className="holding-title">
                  {sportMeta(h.market.sport).emoji} {b ? `${a} vs ${b}` : a}
                </div>
                <div className="muted">
                  {shares.toFixed(2)} {h.outcome.toUpperCase()} · resolved {h.market.winning_outcome?.toUpperCase()}
                </div>
              </div>
              <div className="holding-val">
                <div className={won ? "ok" : "error"}>
                  {won ? `Won +${shares.toFixed(2)}` : "Lost"}
                </div>
              </div>
            </Link>
          );
        })
      )}
    </>
  );
}
