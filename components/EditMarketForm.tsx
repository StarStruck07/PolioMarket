"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { ROUND_OPTIONS, SPORT_OPTIONS } from "@/lib/tags";
import type { Market } from "@/lib/market";

export default function EditMarketForm({ market }: { market: Market }) {
  const router = useRouter();
  const [teamA, setTeamA] = useState(market.team_a ?? "");
  const [teamB, setTeamB] = useState(market.team_b ?? "");
  const [sport, setSport] = useState(market.sport ?? "");
  const [round, setRound] = useState(market.round ?? "");
  const [question, setQuestion] = useState(market.question ?? "");
  const [bParam, setBParam] = useState(String(Number(market.b_param)));
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<{ kind: "ok" | "error"; text: string } | null>(null);

  const untraded = Number(market.q_yes) === 0 && Number(market.q_no) === 0;

  async function save(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setMsg(null);
    try {
      const res = await fetch(`/api/markets/${market.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          question,
          team_a: teamA,
          team_b: teamB,
          sport,
          round,
          b_param: untraded ? Number(bParam) : undefined,
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? "Failed to save");
      setMsg({ kind: "ok", text: "Saved ✓" });
      router.refresh();
    } catch (e) {
      setMsg({ kind: "error", text: e instanceof Error ? e.message : "Failed" });
    } finally {
      setBusy(false);
    }
  }

  async function remove() {
    if (!confirm("Delete this market? Only possible if it has no trades.")) return;
    setBusy(true);
    setMsg(null);
    try {
      const res = await fetch(`/api/markets/${market.id}`, { method: "DELETE" });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data.error ?? "Failed to delete");
      router.push("/");
      router.refresh();
    } catch (e) {
      setMsg({ kind: "error", text: e instanceof Error ? e.message : "Failed" });
      setBusy(false);
    }
  }

  return (
    <form onSubmit={save} className="form">
      <div className="grid2">
        <div>
          <label>Team A</label>
          <input value={teamA} onChange={(e) => setTeamA(e.target.value)} />
        </div>
        <div>
          <label>Team B</label>
          <input value={teamB} onChange={(e) => setTeamB(e.target.value)} />
        </div>
      </div>
      <div className="grid2">
        <div>
          <label>Sport</label>
          <input list="sports-edit" value={sport} onChange={(e) => setSport(e.target.value)} />
          <datalist id="sports-edit">
            {SPORT_OPTIONS.map((s) => <option key={s} value={s} />)}
          </datalist>
        </div>
        <div>
          <label>Round</label>
          <input list="rounds-edit" value={round} onChange={(e) => setRound(e.target.value)} />
          <datalist id="rounds-edit">
            {ROUND_OPTIONS.map((r) => <option key={r} value={r} />)}
          </datalist>
        </div>
      </div>
      <label>Question</label>
      <input value={question} onChange={(e) => setQuestion(e.target.value)} />
      <label>Liquidity b {untraded ? "" : "(locked — market has trades)"}</label>
      <input
        type="number"
        min="1"
        step="any"
        value={bParam}
        onChange={(e) => setBParam(e.target.value)}
        disabled={!untraded}
        style={{ width: 140 }}
      />
      <div className="row" style={{ marginTop: 14, gap: 8 }}>
        <button type="submit" disabled={busy}>{busy ? "…" : "Save changes"}</button>
        <button type="button" className="danger" disabled={busy} onClick={remove}>Delete</button>
      </div>
      {msg && <p className={msg.kind === "ok" ? "ok" : "error"} style={{ marginTop: 10 }}>{msg.text}</p>}
    </form>
  );
}
