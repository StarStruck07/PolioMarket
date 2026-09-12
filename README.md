# Sports Fest Prediction Market — Backend

Virtual-points, LMSR-based binary prediction market. Postgres (Supabase) + a pure
TypeScript LMSR reference module. Built per [`prediction-market-backend-spec.md`](prediction-market-backend-spec.md).

## Layout

```
src/
  lmsr.ts                LMSR math: cost, prices, tradeCost, maxSubsidy (log-sum-exp)
  lmsr.test.ts           Vitest — spec vectors + invariants (13 tests)
  db/trades.ts           executeTrade() wrapper + PG-error → HTTP-status mapping
  api/trade-route.example.ts   Reference Next.js POST /api/trade (not wired into an app)

supabase/migrations/
  0001_schema.sql               tables, enums, RLS, handle_new_user trigger
  0002_trade_rpc.sql            lmsr_cost, lmsr_price, execute_trade (atomic)
  0003_market_lifecycle.sql     create_market, set_market_status (admin)
  0004_resolution.sql           resolve_market (admin, payout)

supabase/dryrun/         Self-contained local Postgres end-to-end test (Phase 6)
```

## Run the TypeScript tests

```bash
npm install
npm test
```

## Run the end-to-end dry run (local, throwaway Postgres)

Requires `postgresql@16` (`brew install postgresql@16`). Spins up an isolated
cluster, loads an `auth` stub + all migrations, runs the full flow, tears down:

```bash
bash supabase/dryrun/run.sh
```

It exercises: seed (3 users @ 1000), create market, buy/sell, oversell rejection,
q-vs-trades consistency, close-then-trade rejection, resolve + payout,
double-resolve rejection, and a full per-user balance reconciliation.

## Deviations from the spec (deliberate)

- **Locking:** `execute_trade` locks the **market row only** (not markets→users→positions).
  Validated: 40 concurrent trades on one market produced zero lost updates. Balance
  safety is backstopped by the `users.balance >= 0` CHECK.
- **No Next.js app** scaffolded — backend lives in `src/`; only one example route exists.
- **Spec test-vector correction:** the spec table's buy-100 cost `62.01144381` is
  imprecise; the exact LMSR value is `62.011450695827754`. Both TS and plpgsql agree.

## Not done

Deploy to a real Supabase project; wire the Next.js API routes
(`markets`, `[id]/status`, `[id]/resolve`); admin bootstrap is manual
(`update users set is_admin = true where ...`).
