export const dynamic = "force-dynamic";

import { createSupabaseServerClient } from "@/lib/supabase/server";
import { type Market } from "@/lib/market";
import MatchExplorer from "@/components/MatchExplorer";

export default async function HomePage() {
  const supabase = createSupabaseServerClient();
  const { data, error } = await supabase
    .from("markets")
    .select("*")
    .order("created_at", { ascending: false });

  const markets = (data as Market[] | null) ?? [];

  const openCount = markets.filter((m) => m.status === "open").length;

  return (
    <>
      <section className="hero reveal in">
        <h1>Back your team.</h1>
        <p>Live odds on every BOSM fixture. Spend your points, read the market, and take the top of the board.</p>
        <div className="hero-pills">
          <span className="hero-pill"><span className="dot">●</span> {openCount} live market{openCount === 1 ? "" : "s"}</span>
          <span className="hero-pill">Real-time odds</span>
          <span className="hero-pill">Winner takes the points</span>
        </div>
      </section>

      {error && <p className="error">Could not load markets: {error.message}</p>}
      {markets.length === 0 && !error ? (
        <p className="muted empty">No matches up yet — sit tight, they&apos;re coming.</p>
      ) : (
        <MatchExplorer markets={markets} />
      )}
    </>
  );
}