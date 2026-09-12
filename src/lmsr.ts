/**
 * LMSR (Logarithmic Market Scoring Rule) — binary market math.
 *
 * Pure, no DB, no side effects. This is the reference implementation used for
 * frontend price quoting and unit tests. The plpgsql helpers in the DB mirror
 * this exactly; the test vectors are the oracle both must match.
 *
 * State is the net-shares vector q = [qYes, qNo] and per-market liquidity b.
 *
 *   Cost:   C(q) = b * ln( e^(qYes/b) + e^(qNo/b) )
 *   Price:  p_i  = e^(q_i/b) / ( e^(qYes/b) + e^(qNo/b) )     // p_yes + p_no = 1
 *   Trade:  cost = C(q_after) - C(q_before)                   // signed
 *
 * All formulas use the log-sum-exp trick (factor out the max) so e^(q/b) never
 * overflows for large q/b.
 */

export type Side = "yes" | "no";

/** Cost function C(q) = b * ln( e^(qYes/b) + e^(qNo/b) ), overflow-safe. */
export function cost(b: number, qYes: number, qNo: number): number {
  assertB(b);
  const xYes = qYes / b;
  const xNo = qNo / b;
  const m = Math.max(xYes, xNo);
  return b * (m + Math.log(Math.exp(xYes - m) + Math.exp(xNo - m)));
}

/** Marginal prices; yes + no === 1 (to floating-point precision). */
export function prices(b: number, qYes: number, qNo: number): { yes: number; no: number } {
  assertB(b);
  const xYes = qYes / b;
  const xNo = qNo / b;
  const m = Math.max(xYes, xNo);
  const eYes = Math.exp(xYes - m);
  const eNo = Math.exp(xNo - m);
  const s = eYes + eNo;
  return { yes: eYes / s, no: eNo / s };
}

/**
 * Cost of trading `shares` of `side` against the current q vector.
 *
 * `shares` is signed: > 0 buys, < 0 sells.
 * Return is signed: > 0 the user pays, < 0 the user receives.
 *
 * There is no bid/ask spread in pure LMSR, so an immediate buy-then-sell of the
 * same quantity nets to zero cost (round-trip).
 */
export function tradeCost(
  b: number,
  qYes: number,
  qNo: number,
  side: Side,
  shares: number,
): number {
  assertB(b);
  const qYesAfter = side === "yes" ? qYes + shares : qYes;
  const qNoAfter = side === "no" ? qNo + shares : qNo;
  return cost(b, qYesAfter, qNoAfter) - cost(b, qYes, qNo);
}

/** Max market-maker subsidy for a binary market: b·ln(2) (~69 at b=100). */
export function maxSubsidy(b: number): number {
  assertB(b);
  return b * Math.LN2;
}

function assertB(b: number): void {
  if (!(b > 0) || !Number.isFinite(b)) {
    throw new Error(`b (liquidity) must be a finite positive number, got ${b}`);
  }
}
