"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { ROUND_OPTIONS, SPORT_OPTIONS } from "@/lib/tags";

export default function CreateMarketForm() {
  const router = useRouter();
  const [teamA, setTeamA] = useState("");
  const [teamB, setTeamB] = useState("");
  const [sport, setSport] = useState("");
  const [round, setRound] = useState("");
  const [question, setQuestion] = useState("");
  const [bParam, setBParam] = useState("100");
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<{ kind: "ok" | "error"; text: string } | null>(null);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setMsg(null);
    try {
      const res = await fetch("/api/markets", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          question,
          team_a: teamA,
          team_b: teamB,
          sport,
          round,
          b_param: Number(bParam),
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? "Failed to create market");
      setMsg({ kind: "ok", text: "Market created 🎉" });
      setTeamA("");
      setTeamB("");
      setQuestion("");
      router.refresh();
    } catch (e) {
      setMsg({ kind: "error", text: e instanceof Error ? e.message : "Failed" });
    } finally {
      setBusy(false);
    }
  }

  return (
    <form onSubmit={submit} className="form">
      <div className="grid2">
        <div>
          <label>Team A</label>
          <input value={teamA} onChange={(e) => setTeamA(e.target.value)} placeholder="IIT Bombay" required />
        </div>
        <div>
          <label>Team B</label>
          <input value={teamB} onChange={(e) => setTeamB(e.target.value)} placeholder="IIT Delhi" required />
        </div>
      </div>
      <div className="grid2">
        <div>
          <label>Sport</label>
          <input list="sports" value={sport} onChange={(e) => setSport(e.target.value)} placeholder="football" />
          <datalist id="sports">
            {SPORT_OPTIONS.map((s) => <option key={s} value={s} />)}
          </datalist>
        </div>
        <div>
          <label>Round</label>
          <input list="rounds" value={round} onChange={(e) => setRound(e.target.value)} placeholder="Final" />
          <datalist id="rounds">
            {ROUND_OPTIONS.map((r) => <option key={r} value={r} />)}
          </datalist>
        </div>
      </div>
      <label>Question (optional — defaults to “A vs B”)</label>
      <input value={question} onChange={(e) => setQuestion(e.target.value)} placeholder="Will IIT Bombay win?" />
      <label>Liquidity b</label>
      <input type="number" min="1" step="any" value={bParam} onChange={(e) => setBParam(e.target.value)} style={{ width: 140 }} />
      <div style={{ marginTop: 14 }}>
        <button type="submit" disabled={busy}>{busy ? "…" : "Create market"}</button>
      </div>
      {msg && <p className={msg.kind === "ok" ? "ok" : "error"} style={{ marginTop: 10 }}>{msg.text}</p>}
    </form>
  );
}
