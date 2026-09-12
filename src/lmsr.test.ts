import { describe, it, expect } from "vitest";
import { cost, prices, tradeCost } from "./lmsr.js";

// Precision for hand-checkable vectors from the spec (8 decimal places).
const P = 8;
const B = 100;

describe("LMSR reference — hand-checkable vectors (b = 100)", () => {
  it("cost(100, 0, 0) = 100 * ln2", () => {
    expect(cost(B, 0, 0)).toBeCloseTo(69.31471806, P);
  });

  it("prices(100, 0, 0) = 0.5 / 0.5", () => {
    const p = prices(B, 0, 0);
    expect(p.yes).toBeCloseTo(0.5, P);
    expect(p.no).toBeCloseTo(0.5, P);
  });

  // NOTE: the spec table rounds these trade-cost constants imprecisely
  // (e.g. it prints 62.01144381 for buy-100, but the exact LMSR value is
  // 62.011450695827754 — off by ~7e-6). We assert the mathematically exact
  // double values here; the implementation matches them to ~1e-13.
  it("buy 50 yes from [0,0] costs 28.092980362016143", () => {
    expect(tradeCost(B, 0, 0, "yes", 50)).toBeCloseTo(28.092980362016143, P);
  });

  it("prices(100, 50, 0)", () => {
    const p = prices(B, 50, 0);
    expect(p.yes).toBeCloseTo(0.62245933, P);
    expect(p.no).toBeCloseTo(0.37754067, P);
  });

  it("buy 100 yes from [0,0] costs 62.011450695827754", () => {
    expect(tradeCost(B, 0, 0, "yes", 100)).toBeCloseTo(62.011450695827754, P);
  });

  it("prices(100, 100, 0)", () => {
    const p = prices(B, 100, 0);
    expect(p.yes).toBeCloseTo(0.73105858, P);
    expect(p.no).toBeCloseTo(0.26894142, P);
  });

  it("round-trip: sell 100 yes from [100,0] returns exactly what was paid", () => {
    // No bid/ask spread in pure LMSR.
    expect(tradeCost(B, 100, 0, "yes", -100)).toBeCloseTo(-62.011450695827754, P);
  });

  it("max subsidy on a binary market is b * ln2", () => {
    expect(B * Math.LN2).toBeCloseTo(69.31471806, P);
  });
});

describe("LMSR — invariants", () => {
  it("prices always sum to 1", () => {
    for (const [qy, qn] of [
      [0, 0],
      [50, 0],
      [100, 0],
      [10, 90],
      [1000, 3],
      [-40, 250],
    ] as const) {
      const p = prices(B, qy, qn);
      expect(p.yes + p.no).toBeCloseTo(1, P);
    }
  });

  it("buy then sell the same quantity nets to ~zero at any state", () => {
    const buy = tradeCost(B, 30, 70, "yes", 25);
    const sell = tradeCost(B, 55, 70, "yes", -25); // state after the buy
    expect(buy + sell).toBeCloseTo(0, P);
  });

  it("buying a side raises its price, lowers the other", () => {
    const before = prices(B, 0, 0);
    const after = prices(B, 40, 0);
    expect(after.yes).toBeGreaterThan(before.yes);
    expect(after.no).toBeLessThan(before.no);
  });

  it("does not overflow for large q/b", () => {
    // q/b = 10000 would overflow a naive exp(); log-sum-exp keeps it finite.
    expect(Number.isFinite(cost(B, 1_000_000, 0))).toBe(true);
    const p = prices(B, 1_000_000, 0);
    expect(p.yes).toBeCloseTo(1, P);
    expect(p.no).toBeCloseTo(0, P);
  });

  it("rejects non-positive b", () => {
    expect(() => cost(0, 1, 1)).toThrow();
    expect(() => prices(-5, 1, 1)).toThrow();
  });
});
