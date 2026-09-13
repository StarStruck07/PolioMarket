"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

export default function AdminMarketControls({
  marketId,
  status,
}: {
  marketId: string;
  status: "open" | "closed" | "resolved";
}) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  async function call(fn: () => Promise<Response>) {
    setBusy(true);
    setErr(null);
    try {
      const res = await fn();
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data.error ?? "Request failed");
      router.refresh();
    } catch (e) {
      setErr(e instanceof Error ? e.message : "Request failed");
    } finally {
      setBusy(false);
    }
  }

  const setStatus = (s: "open" | "closed") =>
    call(() =>
      fetch(`/api/markets/${marketId}/status`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ status: s }),
      }),
    );

  const resolve = (winner: "yes" | "no") => {
    if (!confirm(`Resolve this market as ${winner.toUpperCase()}? This pays out and cannot be undone.`)) return;
    call(() =>
      fetch(`/api/markets/${marketId}/resolve`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ winner }),
      }),
    );
  };

  if (status === "resolved") {
    return <p className="muted">Market is resolved — no further admin actions.</p>;
  }

  return (
    <div>
      <div className="row" style={{ flexWrap: "wrap", gap: 8 }}>
        {status === "open" ? (
          <button className="secondary" disabled={busy} onClick={() => setStatus("closed")}>
            Close market
          </button>
        ) : (
          <button className="secondary" disabled={busy} onClick={() => setStatus("open")}>
            Re-open market
          </button>
        )}
        <button disabled={busy} onClick={() => resolve("yes")}>Resolve YES</button>
        <button disabled={busy} onClick={() => resolve("no")}>Resolve NO</button>
      </div>
      {err && <p className="error" style={{ marginTop: 8 }}>{err}</p>}
    </div>
  );
}
