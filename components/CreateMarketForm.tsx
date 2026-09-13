"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

export default function CreateMarketForm() {
  const router = useRouter();
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
        body: JSON.stringify({ question, b_param: Number(bParam) }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? "Failed to create market");
      setMsg({ kind: "ok", text: "Market created." });
      setQuestion("");
      router.refresh();
    } catch (e) {
      setMsg({ kind: "error", text: e instanceof Error ? e.message : "Failed" });
    } finally {
      setBusy(false);
    }
  }

  return (
    <form onSubmit={submit}>
      <label>Question</label>
      <input
        value={question}
        onChange={(e) => setQuestion(e.target.value)}
        placeholder="Will Team X win the final?"
        required
        style={{ width: "100%" }}
      />
      <label>Liquidity b</label>
      <input
        type="number"
        min="1"
        step="any"
        value={bParam}
        onChange={(e) => setBParam(e.target.value)}
        style={{ width: 160 }}
      />
      <div style={{ marginTop: 12 }}>
        <button type="submit" disabled={busy}>{busy ? "…" : "Create market"}</button>
      </div>
      {msg && (
        <p className={msg.kind === "ok" ? "ok" : "error"} style={{ marginTop: 10 }}>
          {msg.text}
        </p>
      )}
    </form>
  );
}
