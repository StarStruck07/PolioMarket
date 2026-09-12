# Sports Fest Prediction Market — Complete Backend Spec

**For Claude Code.** Virtual-points LMSR prediction market, university sports fest,
weekend hack. Stack: Next.js 14 (App Router, API routes), Supabase Postgres + Auth +
Realtime, deployed on Vercel.

**Guiding principle: correct over polished. No enterprise extras unless asked.**

---

## How to work through this

Build **one phase at a time**. After each phase:

1. Show the code/SQL for **just that phase**.
2. Briefly flag any deviation or non-obvious decision.
3. **Stop and wait for approval before the next phase.**

Before starting each phase, **check if it already exists** in the repo. If substantial
work has been done, present what's there, note gaps vs. this spec, and ask whether to
patch or proceed. Don't silently rebuild things that already work.

---

## Non-negotiable

**Concurrency safety.** Two simultaneous trades on the same market must never corrupt
share counts or balances. Every trade runs as one atomic Postgres transaction with
row-level locking (`SELECT … FOR UPDATE`). This is satisfied by the plpgsql RPC
architecture in Phase 3 — do not weaken it.

---

## Locked decisions

| Decision | Value |
|---|---|
| Currency | Virtual points only, no real money |
| Market type | Binary (yes/no) per fest event |
| Mechanism | **LMSR only** — AMM, no order book |
| Buy & sell | Yes. A sell is a negative-quantity LMSR trade. **One shared code path.** |
| Payout | Winning share → 1 point. Losing share → 0. |
| `b` param | Per-market, default **100** |
| Starting balance | **1000 points** |
| Shares | Fractional (`NUMERIC`). Input = share qty, output = cost in points. |
| Language | **TypeScript** |
| Auth | Supabase Auth. `public.users.id = auth.users.id`. Admin via `is_admin` boolean. |
| Transaction arch | **plpgsql RPC** — whole trade in one DB function, called via `supabase.rpc()`. See architecture section. |

### Why the system is not zero-sum
LMSR subsidises markets — the house can lose up to `b·ln 2 ≈ 69` points per market.
Total point supply can increase on resolution. This is expected and fine for virtual points.
Do not add solvency accounting.

### Why plpgsql RPC (not a Node transaction)
`supabase-js` sends each call through PostgREST as its own request. There is no way to
span a `BEGIN … FOR UPDATE … COMMIT` across multiple calls from Next.js API routes. The
two options are:

- **(a) plpgsql function:** entire trade — lock, math, guards, writes — in one DB function
  = one implicit transaction = guaranteed atomic. No Vercel connection-pool concerns.
- **(b) Node transaction** via raw `pg` driver on the transaction pooler URL.

We use **(a)**. Trade-off: LMSR math lives in both TypeScript (for quoting/testing) and
mirrored plpgsql (for execution). The Phase 2 test vectors are the shared oracle.

---

## Schema overview

```
public.users      (id, name, balance, is_admin, created_at)
public.markets    (id, question, q_yes, q_no, b_param, status, winning_outcome, created_at, resolved_at)
public.positions  (user_id, market_id, outcome, shares)     -- sell guard + payout target
public.trades     (id, user_id, market_id, outcome, shares, cost, created_at)  -- signed, append-only log
```

Key deviations from original rough schema:

1. `outcome_yes_shares/outcome_no_shares` → `q_yes/q_no` (LMSR notation).
2. Added `positions` table — needed for sell guard and resolution payout.
3. `trades.shares` and `trades.cost` are signed (+buy / −sell).
4. Added `users.is_admin`, enums, `CHECK` constraint (`winning_outcome` set iff `status='resolved'`).
5. `NUMERIC(20,8)` everywhere — no floats.
6. RLS enabled; all mutations are via `SECURITY DEFINER` functions.

---

## Phase 1 — Database schema

**Check first:** does `supabase/migrations/` already contain a migration with these tables
and enums? If yes, compare against the DDL below and list any gaps. Only write a new
migration for the gaps.

**File:** `supabase/migrations/<timestamp>_init.sql`

```sql
-- ============================================================
-- Extensions
-- ============================================================
create extension if not exists pgcrypto;

-- ============================================================
-- Enums
-- ============================================================
create type market_status as enum ('open', 'closed', 'resolved');
create type outcome       as enum ('yes', 'no');

-- ============================================================
-- Users
-- Identity lives in auth.users; this is the public profile.
-- ============================================================
create table public.users (
  id         uuid        primary key references auth.users(id) on delete cascade,
  name       text        not null,
  balance    numeric(20,8) not null default 1000 check (balance >= 0),
  is_admin   boolean     not null default false,
  created_at timestamptz not null default now()
);

-- ============================================================
-- Markets
-- q_yes / q_no = net shares outstanding = LMSR q-vector.
-- ============================================================
create table public.markets (
  id              uuid          primary key default gen_random_uuid(),
  question        text          not null,
  q_yes           numeric(20,8) not null default 0,
  q_no            numeric(20,8) not null default 0,
  b_param         numeric(20,8) not null default 100 check (b_param > 0),
  status          market_status not null default 'open',
  winning_outcome outcome,
  created_at      timestamptz   not null default now(),
  resolved_at     timestamptz,
  -- winning_outcome must be set iff resolved
  constraint resolved_iff_winner
    check ((status = 'resolved') = (winning_outcome is not null))
);

-- ============================================================
-- Positions
-- Current holding per (user, market, outcome).
-- shares >= 0 is the DB-level sell guard.
-- Updated inside the same locked transaction as the trade.
-- ============================================================
create table public.positions (
  user_id   uuid          not null references public.users(id)   on delete cascade,
  market_id uuid          not null references public.markets(id) on delete cascade,
  outcome   outcome       not null,
  shares    numeric(20,8) not null default 0 check (shares >= 0),
  primary key (user_id, market_id, outcome)
);

-- ============================================================
-- Trades — append-only signed log
-- shares > 0 = buy, shares < 0 = sell
-- cost   > 0 = paid by user, cost < 0 = received by user
-- ============================================================
create table public.trades (
  id         uuid          primary key default gen_random_uuid(),
  user_id    uuid          not null references public.users(id),
  market_id  uuid          not null references public.markets(id),
  outcome    outcome       not null,
  shares     numeric(20,8) not null,
  cost       numeric(20,8) not null,
  created_at timestamptz   not null default now()
);
create index trades_market_time_idx on public.trades (market_id, created_at);
create index trades_user_idx        on public.trades (user_id);

-- ============================================================
-- Row-level security
-- All reads: owner or public where appropriate.
-- All writes: via SECURITY DEFINER functions only (no write policies).
-- ============================================================
alter table public.users     enable row level security;
alter table public.markets   enable row level security;
alter table public.positions enable row level security;
alter table public.trades    enable row level security;

create policy markets_read_all    on public.markets   for select using (true);
create policy users_read_self     on public.users     for select using (id = auth.uid());
create policy positions_read_self on public.positions for select using (user_id = auth.uid());
create policy trades_read_self    on public.trades    for select using (user_id = auth.uid());

-- ============================================================
-- Auto-create user profile on Supabase Auth signup
-- ============================================================
create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  insert into public.users (id, name)
  values (
    new.id,
    coalesce(new.raw_user_meta_data->>'name', split_part(new.email, '@', 1))
  );
  return new;
end;
$$;

create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_user();
```

---

## Phase 2 — LMSR math module (TypeScript)

**Check first:** does `lib/lmsr.ts` (or similar) already exist? If yes, verify it
implements the log-sum-exp form and passes all test vectors below. Patch only if needed.

Pure module — no DB, no API. Used for price quoting on the frontend and as the oracle for
the plpgsql mirrors in Phase 3.

**File:** `lib/lmsr.ts`

```ts
/**
 * LMSR (Logarithmic Market Scoring Rule) — binary market.
 *
 * Formulas (binary; q = [qYes, qNo], liquidity b):
 *   C(q)  = b · ln( e^(qYes/b) + e^(qNo/b) )
 *   p_i   = e^(qi/b) / ( e^(qYes/b) + e^(qNo/b) )
 *   trade cost = C(q_after) − C(q_before)   [signed]
 *
 * Log-sum-exp trick prevents exp() overflow for large q/b:
 *   let M = max(qYes/b, qNo/b)
 *   C(q) = b · (M + ln( e^(qYes/b − M) + e^(qNo/b − M) ))
 */

export function cost(b: number, qYes: number, qNo: number): number {
  const xY = qYes / b;
  const xN = qNo / b;
  const M = Math.max(xY, xN);
  return b * (M + Math.log(Math.exp(xY - M) + Math.exp(xN - M)));
}

export function prices(
  b: number,
  qYes: number,
  qNo: number
): { yes: number; no: number } {
  const xY = qYes / b;
  const xN = qNo / b;
  const M = Math.max(xY, xN);
  const eY = Math.exp(xY - M);
  const eN = Math.exp(xN - M);
  const S = eY + eN;
  return { yes: eY / S, no: eN / S };
}

/**
 * Cost to execute a trade.
 * @param side    'yes' | 'no'
 * @param shares  signed: positive = buy, negative = sell
 * @returns cost  signed: positive = user pays, negative = user receives
 */
export function tradeCost(
  b: number,
  qYes: number,
  qNo: number,
  side: "yes" | "no",
  shares: number
): number {
  const qYesAfter = side === "yes" ? qYes + shares : qYes;
  const qNoAfter  = side === "no"  ? qNo  + shares : qNo;
  return cost(b, qYesAfter, qNoAfter) - cost(b, qYes, qNo);
}

/** Max market-maker subsidy for a binary market: b·ln(2) */
export function maxSubsidy(b: number): number {
  return b * Math.LN2;
}
```

**File:** `lib/lmsr.test.ts`

```ts
import { cost, prices, tradeCost } from "./lmsr";

const EPS = 1e-6;
const close = (a: number, b: number) => Math.abs(a - b) < EPS;

// C(0,0) = b·ln2
console.assert(close(cost(100, 0, 0), 69.31471806), "cost(0,0)");

// Prices at (0,0) = 0.5 each
const p00 = prices(100, 0, 0);
console.assert(close(p00.yes, 0.5), "price yes at (0,0)");
console.assert(close(p00.no,  0.5), "price no  at (0,0)");

// Buy 50 YES from (0,0)
console.assert(close(tradeCost(100, 0, 0, "yes", 50), 28.09298035), "buy 50 yes");
const p50 = prices(100, 50, 0);
console.assert(close(p50.yes, 0.62245933), "price yes after buy 50");
console.assert(close(p50.no,  0.37754067), "price no  after buy 50");

// Buy 100 YES from (0,0)
console.assert(close(tradeCost(100, 0, 0, "yes", 100), 62.01144381), "buy 100 yes");
const p100 = prices(100, 100, 0);
console.assert(close(p100.yes, 0.73105858), "price yes after buy 100");
console.assert(close(p100.no,  0.26894142), "price no  after buy 100");

// Round-trip: buy 100 then sell 100 — no spread in LMSR, exact recovery
const roundTrip = tradeCost(100, 100, 0, "yes", -100);
console.assert(close(roundTrip, -62.01144381), "round-trip sell 100 yes");

// Prices always sum to 1
const p200 = prices(100, 200, 50);
console.assert(close(p200.yes + p200.no, 1.0), "prices sum to 1");

console.log("All LMSR tests passed.");
```

**Hand-checkable vectors (b = 100):**

| Test | Expected |
|---|---|
| `cost(100, 0, 0)` | `69.31471806` (`= 100·ln 2`) |
| `prices(100, 0, 0)` | `yes = no = 0.5` |
| `tradeCost(100, 0, 0, 'yes', 50)` | `28.09298035` |
| `prices(100, 50, 0).yes` | `0.62245933` |
| `tradeCost(100, 0, 0, 'yes', 100)` | `62.01144381` |
| `prices(100, 100, 0).yes` | `0.73105858` |
| `tradeCost(100, 100, 0, 'yes', -100)` | `−62.01144381` (exact round-trip) |

The round-trip case is critical: pure LMSR has **no bid/ask spread**. An immediate buy
then sell at identical state returns the exact points paid.

---

## Phase 3 — LMSR helpers + atomic trade RPC

**Check first:** does `supabase/migrations/` already contain `lmsr_cost`, `lmsr_price`,
and `execute_trade`? If yes, verify they match the log-sum-exp form and locking order
below. Patch only if not.

This phase has two parts: (A) the plpgsql LMSR math helpers that mirror the TS module,
and (B) the `execute_trade` function where concurrency safety lives.

### 3A — plpgsql LMSR helpers

Add to a migration file (or the same init migration):

```sql
-- ============================================================
-- LMSR cost function (log-sum-exp form, mirrors lib/lmsr.ts)
-- ============================================================
create or replace function public.lmsr_cost(
  b     numeric,
  q_yes numeric,
  q_no  numeric
)
returns numeric
language plpgsql
immutable
as $$
declare
  xy numeric := q_yes / b;
  xn numeric := q_no  / b;
  m  numeric;
begin
  m := greatest(xy, xn);
  return b * (m + ln(exp(xy - m) + exp(xn - m)));
end;
$$;

-- ============================================================
-- LMSR price function
-- ============================================================
create or replace function public.lmsr_price(
  b     numeric,
  q_yes numeric,
  q_no  numeric,
  side  outcome          -- 'yes' | 'no'
)
returns numeric
language plpgsql
immutable
as $$
declare
  xy numeric := q_yes / b;
  xn numeric := q_no  / b;
  m  numeric;
  s  numeric;
begin
  m := greatest(xy, xn);
  s := exp(xy - m) + exp(xn - m);
  return case when side = 'yes' then exp(xy - m) / s
                                else exp(xn - m) / s end;
end;
$$;
```

### 3B — execute_trade (the concurrency-safe atomic trade)

**Locking order — read this before approving:**

1. `SELECT … FROM markets … FOR UPDATE` — locks the market row first. Blocks any
   concurrent trade or resolution on this market until this transaction commits.
2. `SELECT … FROM users   … FOR UPDATE` — locks the trader's balance row.
3. `SELECT … FROM positions … FOR UPDATE` — locks/reads current holding for sell guard.
4. Compute `q_after` and `cost` (log-sum-exp). Apply sell guard and balance guard.
5. `UPDATE markets`, `UPDATE users`, upsert `positions`, `INSERT trades` — all writes.
6. Return results. Locks release when the function returns (transaction commits).

**Deadlock prevention:** every trade locks `markets` before `users`, always. Resolution
(Phase 5) also locks the market first. So a concurrent trade + resolution on the same
market serialize cleanly — no lock cycle, no deadlock.

```sql
create or replace function public.execute_trade(
  p_market_id uuid,
  p_outcome   outcome,
  p_shares    numeric       -- signed: > 0 buy, < 0 sell
)
returns table (
  trade_cost    numeric,
  new_balance   numeric,
  new_q_yes     numeric,
  new_q_no      numeric,
  price_yes     numeric,
  price_no      numeric,
  new_position  numeric
)
language plpgsql
security definer
set search_path = public
as $$
declare
  v_uid      uuid := auth.uid();
  v_b        numeric;
  v_status   market_status;
  v_q_yes    numeric;
  v_q_no     numeric;
  v_qy_after numeric;
  v_qn_after numeric;
  v_cost     numeric;
  v_balance  numeric;
  v_pos      numeric;
begin
  -- Basic input validation
  if v_uid is null then
    raise exception 'not_authenticated: no active session';
  end if;
  if p_shares = 0 then
    raise exception 'invalid_shares: shares must be non-zero';
  end if;

  -- 1) Lock market row FIRST
  select b_param, status, q_yes, q_no
    into v_b, v_status, v_q_yes, v_q_no
    from markets
   where id = p_market_id
     for update;

  if not found then
    raise exception 'market_not_found: %', p_market_id;
  end if;
  if v_status <> 'open' then
    raise exception 'market_not_open: status is %', v_status;
  end if;

  -- 2) Lock user row SECOND
  select balance into v_balance
    from users
   where id = v_uid
     for update;

  if not found then
    raise exception 'user_not_found: profile missing for uid %', v_uid;
  end if;

  -- 3) Read + lock current position (may not exist yet)
  select shares into v_pos
    from positions
   where user_id   = v_uid
     and market_id = p_market_id
     and outcome   = p_outcome
     for update;

  v_pos := coalesce(v_pos, 0);

  -- 4) Sell guard
  if p_shares < 0 and (v_pos + p_shares) < 0 then
    raise exception 'insufficient_position: tried to sell %, only hold %',
                    -p_shares, v_pos;
  end if;

  -- 5) Compute q after
  if p_outcome = 'yes' then
    v_qy_after := v_q_yes + p_shares;
    v_qn_after := v_q_no;
  else
    v_qy_after := v_q_yes;
    v_qn_after := v_q_no + p_shares;
  end if;

  -- 6) LMSR cost + balance guard
  v_cost := lmsr_cost(v_b, v_qy_after, v_qn_after)
          - lmsr_cost(v_b, v_q_yes,    v_q_no);

  if v_cost > 0 and v_balance < v_cost then
    raise exception 'insufficient_balance: need %, have %', v_cost, v_balance;
  end if;

  -- 7) Apply all writes (still under locks)
  update markets
     set q_yes = v_qy_after,
         q_no  = v_qn_after
   where id = p_market_id;

  update users
     set balance = balance - v_cost
   where id = v_uid;

  insert into positions (user_id, market_id, outcome, shares)
  values (v_uid, p_market_id, p_outcome, v_pos + p_shares)
  on conflict (user_id, market_id, outcome)
  do update set shares = excluded.shares;

  insert into trades (user_id, market_id, outcome, shares, cost)
  values (v_uid, p_market_id, p_outcome, p_shares, v_cost);

  -- 8) Return results
  return query
  select
    v_cost,
    v_balance - v_cost,
    v_qy_after,
    v_qn_after,
    lmsr_price(v_b, v_qy_after, v_qn_after, 'yes'),
    lmsr_price(v_b, v_qy_after, v_qn_after, 'no'),
    v_pos + p_shares;
end;
$$;
```

### 3C — Next.js API route

**File:** `app/api/trade/route.ts`

```ts
import { createRouteHandlerClient } from "@supabase/auth-helpers-nextjs";
import { cookies } from "next/headers";
import { NextRequest, NextResponse } from "next/server";

export async function POST(req: NextRequest) {
  const supabase = createRouteHandlerClient({ cookies });

  // Verify session — uid is then available inside the RPC via auth.uid()
  const { data: { session } } = await supabase.auth.getSession();
  if (!session) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const body = await req.json();
  const { market_id, outcome, shares } = body;

  if (!market_id || !outcome || shares === undefined) {
    return NextResponse.json({ error: "Missing market_id, outcome, or shares" }, { status: 400 });
  }
  if (!["yes", "no"].includes(outcome)) {
    return NextResponse.json({ error: "outcome must be 'yes' or 'no'" }, { status: 400 });
  }
  if (typeof shares !== "number" || shares === 0) {
    return NextResponse.json({ error: "shares must be a non-zero number" }, { status: 400 });
  }

  const { data, error } = await supabase.rpc("execute_trade", {
    p_market_id: market_id,
    p_outcome:   outcome,
    p_shares:    shares,
  });

  if (error) {
    // Map exception prefixes to HTTP status codes
    const msg = error.message ?? "";
    if (msg.startsWith("not_authenticated"))     return NextResponse.json({ error: msg }, { status: 401 });
    if (msg.startsWith("market_not_found") ||
        msg.startsWith("user_not_found"))         return NextResponse.json({ error: msg }, { status: 404 });
    if (msg.startsWith("market_not_open") ||
        msg.startsWith("insufficient_"))          return NextResponse.json({ error: msg }, { status: 400 });
    return NextResponse.json({ error: msg }, { status: 500 });
  }

  return NextResponse.json(data[0]);
}
```

---

## Phase 4 — Market lifecycle

**Check first:** do `create_market` and `set_market_status` already exist in migrations?

### create_market

```sql
create or replace function public.create_market(
  p_question text,
  p_b_param  numeric default 100
)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_admin  boolean;
  v_new_id uuid;
begin
  select is_admin into v_admin from users where id = auth.uid();
  if not coalesce(v_admin, false) then
    raise exception 'admin_only: create_market requires is_admin';
  end if;

  insert into markets (question, b_param)
  values (p_question, p_b_param)
  returning id into v_new_id;

  return v_new_id;
end;
$$;
```

### set_market_status (open ↔ closed only — never resolved here)

```sql
create or replace function public.set_market_status(
  p_market_id uuid,
  p_status    market_status
)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare v_admin boolean;
begin
  select is_admin into v_admin from users where id = auth.uid();
  if not coalesce(v_admin, false) then
    raise exception 'admin_only: set_market_status requires is_admin';
  end if;
  if p_status = 'resolved' then
    raise exception 'use_resolve_market: call resolve_market() instead';
  end if;

  update markets
     set status = p_status
   where id = p_market_id
     and status <> 'resolved';   -- can't un-resolve

  if not found then
    raise exception 'market_not_found_or_resolved: %', p_market_id;
  end if;
end;
$$;
```

### Next.js API routes

**File:** `app/api/markets/route.ts`

```ts
import { createRouteHandlerClient } from "@supabase/auth-helpers-nextjs";
import { cookies } from "next/headers";
import { NextRequest, NextResponse } from "next/server";

// GET /api/markets — list all markets (public)
export async function GET() {
  const supabase = createRouteHandlerClient({ cookies });
  const { data, error } = await supabase
    .from("markets")
    .select("*")
    .order("created_at", { ascending: false });

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json(data);
}

// POST /api/markets — create a market (admin only)
export async function POST(req: NextRequest) {
  const supabase = createRouteHandlerClient({ cookies });
  const { data: { session } } = await supabase.auth.getSession();
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { question, b_param } = await req.json();
  if (!question) return NextResponse.json({ error: "question is required" }, { status: 400 });

  const { data, error } = await supabase.rpc("create_market", {
    p_question: question,
    p_b_param:  b_param ?? 100,
  });

  if (error) {
    const msg = error.message ?? "";
    if (msg.startsWith("admin_only")) return NextResponse.json({ error: msg }, { status: 403 });
    return NextResponse.json({ error: msg }, { status: 500 });
  }
  return NextResponse.json({ id: data }, { status: 201 });
}
```

**File:** `app/api/markets/[id]/status/route.ts`

```ts
import { createRouteHandlerClient } from "@supabase/auth-helpers-nextjs";
import { cookies } from "next/headers";
import { NextRequest, NextResponse } from "next/server";

export async function PATCH(req: NextRequest, { params }: { params: { id: string } }) {
  const supabase = createRouteHandlerClient({ cookies });
  const { data: { session } } = await supabase.auth.getSession();
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { status } = await req.json();
  if (!["open", "closed"].includes(status)) {
    return NextResponse.json({ error: "status must be 'open' or 'closed'" }, { status: 400 });
  }

  const { error } = await supabase.rpc("set_market_status", {
    p_market_id: params.id,
    p_status:    status,
  });

  if (error) {
    const msg = error.message ?? "";
    if (msg.startsWith("admin_only"))  return NextResponse.json({ error: msg }, { status: 403 });
    if (msg.startsWith("market_not")) return NextResponse.json({ error: msg }, { status: 404 });
    if (msg.startsWith("use_resolve")) return NextResponse.json({ error: msg }, { status: 400 });
    return NextResponse.json({ error: msg }, { status: 500 });
  }
  return NextResponse.json({ ok: true });
}
```

---

## Phase 5 — Resolution & payout

**Check first:** does `resolve_market` exist?

Admin marks winning outcome. Every holder of winning shares gets 1 point per share,
credited atomically in the same transaction that flips `status = 'resolved'`. Locks the
market first — same order as trades — so an in-flight trade either commits before
resolution starts (and its result stands) or sees `status <> 'open'` after losing the
market lock race and aborts cleanly.

```sql
create or replace function public.resolve_market(
  p_market_id uuid,
  p_winner    outcome
)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_admin  boolean;
  v_status market_status;
begin
  select is_admin into v_admin from users where id = auth.uid();
  if not coalesce(v_admin, false) then
    raise exception 'admin_only: resolve_market requires is_admin';
  end if;

  -- Lock market first (same order as execute_trade — no deadlock)
  select status into v_status
    from markets
   where id = p_market_id
     for update;

  if not found then
    raise exception 'market_not_found: %', p_market_id;
  end if;
  if v_status = 'resolved' then
    raise exception 'already_resolved: market % is already resolved', p_market_id;
  end if;

  -- Credit winning shareholders (1 point per share)
  update users u
     set balance = balance + p.shares
    from positions p
   where p.market_id = p_market_id
     and p.outcome   = p_winner
     and p.user_id   = u.id;

  -- Mark resolved
  update markets
     set status          = 'resolved',
         winning_outcome = p_winner,
         resolved_at     = now()
   where id = p_market_id;
end;
$$;
```

### Next.js API route

**File:** `app/api/markets/[id]/resolve/route.ts`

```ts
import { createRouteHandlerClient } from "@supabase/auth-helpers-nextjs";
import { cookies } from "next/headers";
import { NextRequest, NextResponse } from "next/server";

export async function POST(req: NextRequest, { params }: { params: { id: string } }) {
  const supabase = createRouteHandlerClient({ cookies });
  const { data: { session } } = await supabase.auth.getSession();
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { winner } = await req.json();
  if (!["yes", "no"].includes(winner)) {
    return NextResponse.json({ error: "winner must be 'yes' or 'no'" }, { status: 400 });
  }

  const { error } = await supabase.rpc("resolve_market", {
    p_market_id: params.id,
    p_winner:    winner,
  });

  if (error) {
    const msg = error.message ?? "";
    if (msg.startsWith("admin_only"))    return NextResponse.json({ error: msg }, { status: 403 });
    if (msg.startsWith("market_not_f")) return NextResponse.json({ error: msg }, { status: 404 });
    if (msg.startsWith("already_reso")) return NextResponse.json({ error: msg }, { status: 409 });
    return NextResponse.json({ error: msg }, { status: 500 });
  }
  return NextResponse.json({ ok: true });
}
```

---

## Phase 6 — End-to-end dry run

Only run this phase after all previous phases are approved and deployed to a dev/staging
Supabase project. Walk through the full flow manually and paste the DB state at each step
to catch integration bugs.

### 6.1 Seed

```sql
-- In Supabase dashboard: create two test users via Auth → Users → Invite
-- Then set one as admin:
update public.users set is_admin = true where name = 'Admin';
-- Verify balances (should both be 1000 from handle_new_user trigger):
select id, name, balance, is_admin from public.users;
```

### 6.2 Create market

```bash
curl -X POST http://localhost:3000/api/markets \
  -H "Authorization: Bearer <admin_jwt>" \
  -H "Content-Type: application/json" \
  -d '{"question": "Will Team X win the football final?", "b_param": 100}'
# Expect: {"id": "<market_uuid>"}
```

Verify in DB:
```sql
select id, question, q_yes, q_no, b_param, status from markets;
-- q_yes=0, q_no=0, status='open'
-- price_yes = price_no = 0.5  (by formula: e^0 / (e^0 + e^0) = 0.5)
```

### 6.3 Trade — User A buys 100 YES

```bash
curl -X POST http://localhost:3000/api/trade \
  -H "Authorization: Bearer <user_a_jwt>" \
  -H "Content-Type: application/json" \
  -d '{"market_id": "<market_uuid>", "outcome": "yes", "shares": 100}'
# Expect:
#   trade_cost   ≈ 62.01144381
#   new_balance  ≈ 937.98855619
#   new_q_yes    = 100
#   price_yes    ≈ 0.73105858
#   new_position = 100
```

### 6.4 Trade — User B buys 50 NO

```bash
curl -X POST http://localhost:3000/api/trade \
  -H "Authorization: Bearer <user_b_jwt>" \
  -H "Content-Type: application/json" \
  -d '{"market_id": "<market_uuid>", "outcome": "no", "shares": 50}'
# trade_cost ≈ 18.02 (market is no longer at (0,0); YES is already lifted)
```

After both trades, verify:
```sql
select q_yes, q_no from markets where id = '<market_uuid>';
-- q_yes = 100, q_no = 50

select u.name, u.balance, p.outcome, p.shares
from positions p join users u on u.id = p.user_id
where p.market_id = '<market_uuid>';

select outcome, shares, cost from trades where market_id = '<market_uuid>' order by created_at;
```

### 6.5 Sell — User A sells 40 YES

```bash
curl -X POST http://localhost:3000/api/trade \
  -H "Authorization: Bearer <user_a_jwt>" \
  -H "Content-Type: application/json" \
  -d '{"market_id": "<market_uuid>", "outcome": "yes", "shares": -40}'
# trade_cost < 0: user A receives points
# new_position = 60
```

Try to oversell — should fail:
```bash
curl -X POST http://localhost:3000/api/trade \
  -H "Authorization: Bearer <user_a_jwt>" \
  -H "Content-Type: application/json" \
  -d '{"market_id": "<market_uuid>", "outcome": "yes", "shares": -999}'
# Expect 400: insufficient_position
```

### 6.6 Concurrency spot-check

```ts
// Run this in a local script. Fire two trades simultaneously.
const [r1, r2] = await Promise.all([
  fetch("/api/trade", { method: "POST", body: JSON.stringify({
    market_id: MARKET_ID, outcome: "yes", shares: 10
  }), headers }),
  fetch("/api/trade", { method: "POST", body: JSON.stringify({
    market_id: MARKET_ID, outcome: "no", shares: 10
  }), headers }),
]);
console.log(await r1.json(), await r2.json());
```

Then verify DB consistency:
```sql
-- q_yes/q_no should exactly reflect the sum of all trade.shares per outcome
select
  m.q_yes,
  m.q_no,
  sum(case when t.outcome = 'yes' then t.shares else 0 end) as sum_yes_trades,
  sum(case when t.outcome = 'no'  then t.shares else 0 end) as sum_no_trades
from markets m
join trades t on t.market_id = m.id
where m.id = '<market_uuid>'
group by m.q_yes, m.q_no;
-- q_yes must equal sum_yes_trades, q_no must equal sum_no_trades
```

### 6.7 Close market

```bash
curl -X PATCH http://localhost:3000/api/markets/<market_uuid>/status \
  -H "Authorization: Bearer <admin_jwt>" \
  -H "Content-Type: application/json" \
  -d '{"status": "closed"}'
```

Verify trade is now rejected:
```bash
curl -X POST http://localhost:3000/api/trade \
  -H "Authorization: Bearer <user_a_jwt>" \
  -H "Content-Type: application/json" \
  -d '{"market_id": "<market_uuid>", "outcome": "yes", "shares": 1}'
# Expect 400: market_not_open
```

### 6.8 Resolve

```bash
curl -X POST http://localhost:3000/api/markets/<market_uuid>/resolve \
  -H "Authorization: Bearer <admin_jwt>" \
  -H "Content-Type: application/json" \
  -d '{"winner": "yes"}'
```

Verify payouts:
```sql
-- User A held 60 YES → should gain 60 points
-- User B held 50 NO  → should gain 0 points
select u.name, u.balance from users u;

-- Market status
select status, winning_outcome, resolved_at from markets where id = '<market_uuid>';

-- Double-resolve should fail
-- (call the API again → expect 409)
```

### 6.9 Full reconciliation check

```sql
-- For each user: final_balance = 1000 - sum(cost of their trades) + winning_position_shares
select
  u.name,
  u.balance                                       as actual_balance,
  1000 - coalesce(sum(t.cost), 0)
    + coalesce(
        (select p.shares from positions p
         where p.user_id = u.id
           and p.market_id = '<market_uuid>'
           and p.outcome = (select winning_outcome from markets where id = '<market_uuid>')),
        0
      )                                           as expected_balance
from users u
left join trades t on t.user_id = u.id and t.market_id = '<market_uuid>'
group by u.id, u.name, u.balance;
-- actual_balance must equal expected_balance for every user
```

---

## Conventions

| Rule | Detail |
|---|---|
| Numbers | `NUMERIC(20,8)` everywhere — no floats |
| Signs | `shares` and `cost` signed: `+` buy/paid, `−` sell/received |
| Lock order | Always `markets` → `users` → `positions`. Never reverse. |
| Error prefixes | `raise exception 'prefix: detail'` — prefix maps to HTTP status |
| HTTP errors | `400` bad input / insufficient / closed; `401` unauthed; `403` not admin; `404` missing; `409` already resolved; `500` unexpected |
| Auth | API routes verify session; `SECURITY DEFINER` propagates `auth.uid()` into functions |
| No enterprise extras | No retries, no audit log, no admin dashboard — unless asked |
| Not zero-sum | House subsidises up to `b·ln 2` per market. Don't add solvency checks. |

---

## File map summary

```
supabase/migrations/
  <ts>_init.sql               Phase 1: tables, enums, RLS, handle_new_user trigger
  <ts>_lmsr_functions.sql     Phase 3: lmsr_cost, lmsr_price, execute_trade
  <ts>_market_admin.sql       Phase 4+5: create_market, set_market_status, resolve_market

lib/
  lmsr.ts                     Phase 2: pure TS math (quoting + tests)
  lmsr.test.ts                Phase 2: hand-checkable test vectors

app/api/
  trade/route.ts              Phase 3: POST /api/trade
  markets/route.ts            Phase 4: GET + POST /api/markets
  markets/[id]/status/route.ts  Phase 4: PATCH /api/markets/:id/status
  markets/[id]/resolve/route.ts Phase 5: POST /api/markets/:id/resolve
```
