import Link from "next/link";
import Avatar from "@/components/Avatar";
import { marketPrices, sides, type Market } from "@/lib/market";
import { sportMeta } from "@/lib/tags";

export default function MatchCard({ m }: { m: Market }) {
  const p = marketPrices(m);
  const yesPct = Math.round(p.yes * 100);
  const { a, b } = sides(m);
  const sm = sportMeta(m.sport);

  return (
    <Link href={`/market/${m.id}`} className="match-card">
      <div className="match-card-top">
        <span className="chip" style={{ borderColor: sm.color, color: sm.color }}>
          {sm.emoji} {m.sport ?? "Match"}
        </span>
        {m.round && <span className="chip subtle">{m.round}</span>}
        <span className={`pill ${m.status}`}>{m.status}</span>
      </div>

      <div className="match-teams">
        <div className="team">
          <Avatar name={a} size={40} logo={m.team_a_logo} />
          <span className="team-name">{a}</span>
        </div>
        {b ? (
          <>
            <span className="vs">vs</span>
            <div className="team">
              <Avatar name={b} size={40} logo={m.team_b_logo} />
              <span className="team-name">{b}</span>
            </div>
          </>
        ) : null}
      </div>

      <div className="pricebar">
        <div className="yes" style={{ width: `${yesPct}%` }} />
        <div className="no" style={{ width: `${100 - yesPct}%` }} />
      </div>
      <div className="price-legend">
        <span className="yes-t">YES {(p.yes * 100).toFixed(0)}%</span>
        <span className="no-t">NO {(p.no * 100).toFixed(0)}%</span>
      </div>

      {m.status === "resolved" && (
        <p className="resolved-note">✔ {m.winning_outcome?.toUpperCase()} won</p>
      )}
    </Link>
  );
}
