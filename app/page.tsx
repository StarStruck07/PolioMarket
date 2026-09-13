import Link from "next/link";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { marketPrices, type Market } from "@/lib/market";

export default async function HomePage() {
  const supabase = createSupabaseServerClient();
  const { data, error } = await supabase
    .from("markets")
    .select("*")
    .order("created_at", { ascending: false });

  const markets = (data as Market[] | null) ?? [];

  return (
    <>
      <h1>Markets</h1>
      {error && <p className="error">Could not load markets: {error.message}</p>}
      {markets.length === 0 && !error && (
        <p className="muted">No markets yet. An admin can create one.</p>
      )}
      {markets.map((m) => {
        const p = marketPrices(m);
        const yesPct = Math.round(p.yes * 100);
        return (
          <Link key={m.id} href={`/market/${m.id}`} style={{ display: "block", color: "inherit" }}>
            <div className="card">
              <div className="row">
                <h3 style={{ flex: 1 }}>{m.question}</h3>
                <span className={`pill ${m.status}`}>{m.status}</span>
              </div>
              <div className="pricebar">
                <div className="yes" style={{ width: `${yesPct}%` }} />
                <div className="no" style={{ width: `${100 - yesPct}%` }} />
              </div>
              <div className="row muted" style={{ justifyContent: "space-between" }}>
                <span>YES {(p.yes * 100).toFixed(1)}%</span>
                <span>NO {(p.no * 100).toFixed(1)}%</span>
              </div>
              {m.status === "resolved" && (
                <p className="muted">Resolved: {m.winning_outcome?.toUpperCase()} won</p>
              )}
            </div>
          </Link>
        );
      })}
    </>
  );
}
