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
  const [action, setAction] = useState<"buy" | "sell">("buy");
  const [qty, setQty] = useState("10");
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<{ kind: "ok" | "error"; text: string } | null>(null);

  const shares = Number(qty);
  const signed = action === "buy" ? shares : -shares;
  const held = side === "yes" ? props.heldYes : props.heldNo;
  const label = side === "yes" ? props.yesLabel : props.noLabel;

  // Live client-side quote (mirrors the DB math). Signed by buy/sell.
  const quote = useMemo(() => {
    if (!Number.isFinite(shares) || shares <= 0) return null;
    return tradeCost(props.b, props.qYes, props.qNo, side, signed);
  }, [props.b, props.qYes, props.qNo, side, signed, shares]);

  const p = prices(props.b, props.qYes, props.qNo);
  const tooManyToSell = action === "sell" && shares > held;
  const tooExpensive = action === "buy" && quote != null && quote > props.balance;
  const invalid = !Number.isFinite(shares) || shares <= 0 || tooManyToSell || tooExpensive;

  async function submit() {
    setBusy(true);
    setMsg(null);
    try {
      const res = await fetch("/api/trade", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ marketId: props.marketId, outcome: side, shares: signed }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? "Trade failed");
      const cost = Number(data.trade_cost);
      setMsg({
        kind: "ok",
        text:
          cost >= 0
            ? `Bought ${shares} on ${label} for ${cost.toFixed(2)} pts. Balance ${Number(data.new_balance).toFixed(2)}.`
            : `Sold ${shares} on ${label}, received ${(-cost).toFixed(2)} pts. Balance ${Number(data.new_balance).toFixed(2)}.`,
      });
      router.refresh();
    } catch (e) {
      setMsg({ kind: "error", text: e instanceof Error ? e.message : "Trade failed" });
    } finally {
      setBusy(false);
    }
  }

  if (!props.loggedIn) {
    return <p className="muted">Sign in to place a bet.</p>;
  }

  return (
    <div>
      <div className="grid2" style={{ marginBottom: 8 }}>
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
        </div>
        <div>
          <label>Action</label>
          <div className="row" style={{ gap: 8 }}>
            <button
              className={action === "buy" ? "" : "secondary"}
              onClick={() => setAction("buy")}
              type="button"
              style={{ flex: 1 }}
            >
              Buy
            </button>
            <button
              className={action === "sell" ? "" : "secondary"}
              onClick={() => setAction("sell")}
              type="button"
              style={{ flex: 1 }}
            >
              Sell
            </button>
          </div>
        </div>
      </div>

      <label>Shares {held > 0 ? `(you hold ${held.toFixed(2)} on ${label})` : ""}</label>
      <input type="number" min="0" step="any" value={qty} onChange={(e) => setQty(e.target.value)} />

      <p className="muted" style={{ marginTop: 10 }}>
        {quote == null
          ? "Enter how many shares."
          : quote >= 0
            ? `Cost: ${quote.toFixed(2)} pts · each winning share pays 1 pt`
            : `You receive: ${(-quote).toFixed(2)} pts`}
      </p>
      {tooManyToSell && <p className="error">You only hold {held.toFixed(2)} shares on {label}.</p>}
      {tooExpensive && <p className="error">Not enough balance ({props.balance.toFixed(2)} pts).</p>}

      <button onClick={submit} disabled={busy || invalid} style={{ width: "100%", marginTop: 6 }}>
        {busy ? "…" : `${action === "buy" ? "Buy" : "Sell"} ${label}`}
      </button>

      {msg && <p className={msg.kind === "ok" ? "ok" : "error"} style={{ marginTop: 10 }}>{msg.text}</p>}
    </div>
  );
}
