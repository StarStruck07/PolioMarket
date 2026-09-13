"use client";

import { useMemo, useState } from "react";
import MatchCard from "@/components/MatchCard";
import { sides, type Market } from "@/lib/market";

export default function MatchExplorer({ markets }: { markets: Market[] }) {
  const [q, setQ] = useState("");
  const [sport, setSport] = useState("");
  const [round, setRound] = useState("");
  const [college, setCollege] = useState("");
  const [status, setStatus] = useState("");

  // Build filter option lists from the data.
  const sports = useMemo(
    () => uniq(markets.map((m) => m.sport)).sort(),
    [markets],
  );
  const rounds = useMemo(
    () => uniq(markets.map((m) => m.round)).sort(),
    [markets],
  );
  const colleges = useMemo(
    () => uniq(markets.flatMap((m) => [m.team_a, m.team_b])).sort(),
    [markets],
  );

  const filtered = useMemo(() => {
    const needle = q.trim().toLowerCase();
    return markets.filter((m) => {
      if (sport && m.sport !== sport) return false;
      if (round && m.round !== round) return false;
      if (status && m.status !== status) return false;
      if (college && m.team_a !== college && m.team_b !== college) return false;
      if (needle) {
        const { a, b } = sides(m);
        const hay = [m.question, a, b, m.sport, m.round].filter(Boolean).join(" ").toLowerCase();
        if (!hay.includes(needle)) return false;
      }
      return true;
    });
  }, [markets, q, sport, round, college, status]);

  return (
    <>
      <div className="filters">
        <input
          className="search"
          placeholder="🔍  Search teams, sport, round…"
          value={q}
          onChange={(e) => setQ(e.target.value)}
        />
        <div className="filter-selects">
          <select value={sport} onChange={(e) => setSport(e.target.value)}>
            <option value="">All sports</option>
            {sports.map((s) => <option key={s} value={s}>{s}</option>)}
          </select>
          <select value={round} onChange={(e) => setRound(e.target.value)}>
            <option value="">All rounds</option>
            {rounds.map((r) => <option key={r} value={r}>{r}</option>)}
          </select>
          <select value={college} onChange={(e) => setCollege(e.target.value)}>
            <option value="">All teams</option>
            {colleges.map((c) => <option key={c} value={c}>{c}</option>)}
          </select>
          <select value={status} onChange={(e) => setStatus(e.target.value)}>
            <option value="">Any status</option>
            <option value="open">Open</option>
            <option value="closed">Closed</option>
            <option value="resolved">Resolved</option>
          </select>
        </div>
      </div>

      {filtered.length === 0 ? (
        <p className="muted empty">No matches fit these filters.</p>
      ) : (
        <div className="match-grid">
          {filtered.map((m) => <MatchCard key={m.id} m={m} />)}
        </div>
      )}
    </>
  );
}

function uniq(xs: (string | null)[]): string[] {
  return Array.from(new Set(xs.filter((x): x is string => !!x)));
}
