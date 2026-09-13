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

  return (
    <>
      <section className="hero">
        <h1>The Fest Prediction Market</h1>
        <p>Trade on every match. Back your calls. Climb the board.</p>
      </section>

      {error && <p className="error">Could not load markets: {error.message}</p>}
      {markets.length === 0 && !error ? (
        <p className="muted empty">No markets yet — check back once an admin opens some.</p>
      ) : (
        <MatchExplorer markets={markets} />
      )}
    </>
  );
}