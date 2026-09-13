# Sports Fest Prediction Market

Virtual-points, LMSR-based binary prediction market. **Next.js 14** (App Router) frontend
+ API routes over **Supabase** (Postgres + Auth). All money movement runs inside atomic
plpgsql functions; the TypeScript LMSR module is the shared quoting/testing reference.

Built per [`prediction-market-backend-spec.md`](prediction-market-backend-spec.md).
Architecture details: [`docs/ARCHITECTURE.md`](docs/ARCHITECTURE.md).

## Layout

```
app/
  page.tsx                     market list (home)
  login/page.tsx               email+password auth
  market/[id]/page.tsx         market detail + trade widget + admin controls
  admin/page.tsx               create markets (admin)
  api/trade/route.ts           POST  execute a buy/sell
  api/markets/route.ts         GET list · POST create (admin)
  api/markets/[id]/status/     PATCH open/close (admin)
  api/markets/[id]/resolve/    POST  resolve + payout (admin)
components/                    TradeWidget, AdminMarketControls, CreateMarketForm, SignOutButton
lib/
  supabase/{server,client,middleware}.ts   request/browser Supabase clients
  market.ts                    row types, price helper, getProfile()
src/
  lmsr.ts / lmsr.test.ts       LMSR math (cost, prices, tradeCost, maxSubsidy) + tests
  db/trades.ts                 executeTrade() wrapper + PG-error → HTTP-status mapping
supabase/
  migrations/                  0001 schema · 0002 trade_rpc · 0003 market_lifecycle · 0004 resolution
  dryrun/                      self-contained local Postgres end-to-end test
```

## Setup

1. **Create a Supabase project** (free tier is fine). From Project Settings → API, copy the
   URL and anon key into `.env.local`:
   ```bash
   cp .env.example .env.local   # then fill in the two values
   ```
2. **Apply the migrations** — paste `supabase/migrations/0001…0004` in order into the
   Supabase SQL editor, or use the Supabase CLI (`supabase db push`).
3. **Install + run:**
   ```bash
   npm install
   npm run dev            # http://localhost:3000
   ```
4. **Make yourself admin** (after signing up once) in the Supabase SQL editor:
   ```sql
   update public.users set is_admin = true where name = 'YourName';
   ```

> Auth note: for a weekend hack, turn **off** "Confirm email" in Supabase
> (Authentication → Providers → Email) so sign-up logs in immediately.

## Verify without the app

```bash
npm test                       # LMSR math — 13 tests
npm run dryrun                 # spins up a throwaway local Postgres, loads all
                               # migrations, runs the full trade→resolve→reconcile flow
                               # (requires: brew install postgresql@16)
```

## Deviations from the spec (deliberate)

- **Locking:** `execute_trade` locks the **market row only** (not markets→users→positions).
  Validated: 40 concurrent trades on one market → zero lost updates; the
  `users.balance >= 0` CHECK backstops the cross-market case.
- **Spec test-vector fix:** the spec's buy-100 cost `62.01144381` is imprecise; the exact
  LMSR value is `62.011450695827754`. TS and plpgsql agree.

## Not done yet

Realtime price updates, a portfolio page, deployment (Vercel), and richer admin UX —
all deferred; this is the end-to-end baseline.
