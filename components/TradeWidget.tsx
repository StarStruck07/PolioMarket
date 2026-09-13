"use client";

import { useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { tradeCost, prices, type Side } from "@/src/lmsr";

interface Props {
  marketId: string;
  b: number;
  qYes: number;
  qNo: number;
  heldYes: number;
  heldNo: number;
  balance: number;
  loggedIn: boolean;
  yesLabel: string;
  noLabel: string;
}

export default function TradeWidget(props: Props) {
  const router = useRouter();
  const [side, setSide] = useState<Side>("yes");
  const [qty, setQty] = useState("10");
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<{ kind: "ok" | "error"; text: string } | null>(null);

  const shares = Number(qty);
  const held = side === "yes" ? props.heldYes : props.heldNo;
  const label = side === "yes" ? props.yesLabel : props.noLabel;

  // Live client-side quote (buy only; mirrors the DB math).
  const quote = useMemo(() => {
    if (!Number.isFinite(shares) || shares <= 0) return null;
    return tradeCost(props.b, props.qYes, props.qNo, side, shares);
  }, [props.b, props.qYes, props.qNo, side, shares]);

  const p = prices(props.b, props.qYes, props.qNo);
  const tooExpensive = quote != null && quote > props.balance;
  const invalid = !Number.isFinite(shares) || shares <= 0 || tooExpensive;

  async function submit() {
    setBusy(true);
    setMsg(null);
    try {
      const res = await fetch("/api/trade", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ marketId: props.marketId, outcome: side, shares }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? "Bet failed");
      setMsg({
        kind: "ok",
        text: `Bought ${shares} on ${label} for ${Number(data.trade_cost).toFixed(2)} pts. Balance ${Number(data.new_balance).toFixed(2)}.`,
      });
      router.refresh();
    } catch (e) {
      setMsg({ kind: "error", text: e instanceof Error ? e.message : "Bet failed" });
    } finally {
      setBusy(false);
    }
  }

  if (!props.loggedIn) {
    return <p className="muted">Sign in to place a bet.</p>;
  }

  return (
    <div>
      <label>Back which team?</label>
      <div className="row" style={{ gap: 8 }}>
        <button
          className={side === "yes" ? "" : "secondary"}
          onClick={() => setSide("yes")}
          type="button"
          style={{ flex: 1 }}
        >
          {props.yesLabel} · {(p.yes * 100).toFixed(0)}%
        </button>
        <button
          className={side === "no" ? "" : "secondary"}
          onClick={() => setSide("no")}
          type="button"
          style={{ flex: 1 }}
        >
          {props.noLabel} · {(p.no * 100).toFixed(0)}%
        </button>
      </div>

      <label style={{ marginTop: 12 }}>
        Shares {held > 0 ? `(you already hold ${held.toFixed(2)} on ${label})` : ""}
      </label>
      <input type="number" min="0" step="any" value={qty} onChange={(e) => setQty(e.target.value)} />

      <p className="muted" style={{ marginTop: 10 }}>
        {quote == null
          ? "Enter how many shares to buy."
          : `Cost: ${quote.toFixed(2)} pts · each winning share pays 1 pt`}
      </p>
      {tooExpensive && <p className="error">Not enough balance ({props.balance.toFixed(2)} pts).</p>}

      <button onClick={submit} disabled={busy || invalid} style={{ width: "100%", marginTop: 6 }}>
        {busy ? "…" : `Bet on ${label}`}
      </button>

      {msg && <p className={msg.kind === "ok" ? "ok" : "error"} style={{ marginTop: 10 }}>{msg.text}</p>}
    </div>
  );
}
