import { createSupabaseServerClient } from "@/lib/supabase/server";
import type { LeaderRow } from "@/lib/market";

export default async function LeaderboardPage() {
  const supabase = createSupabaseServerClient();
  const { data } = await supabase.rpc("leaderboard");
  const rows = (data as LeaderRow[] | null) ?? [];

  const medal = (rank: number) => (rank === 1 ? "🥇" : rank === 2 ? "🥈" : rank === 3 ? "🥉" : rank);

  return (
    <>
      <h1>Leaderboard</h1>
      <p className="muted" style={{ marginTop: -8, marginBottom: 16 }}>
        Ranked by available points. Points locked in unresolved bets don&apos;t count until the match settles.
      </p>
      {rows.length === 0 ? (
        <p className="muted empty">No players yet.</p>
      ) : (
        <div className="card" style={{ padding: 0, overflow: "hidden" }}>
          {rows.map((r) => (
            <div key={r.name + r.rank} className={`leader-row${r.rank <= 3 ? " top" : ""}`}>
              <span className="leader-rank">{medal(Number(r.rank))}</span>
              <span className="leader-name">{r.name}</span>
              <span className="leader-pts">{Number(r.balance).toFixed(0)} pts</span>
            </div>
          ))}
        </div>
      )}
    </>
  );
}
