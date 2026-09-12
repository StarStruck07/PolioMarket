# Architecture & API Reference

Backend for a virtual-points, LMSR-based binary prediction market. All state and all
money movement live in Postgres; the trade logic runs inside a single atomic plpgsql
function. TypeScript holds the reference LMSR math (for quoting + tests) that the
plpgsql helpers mirror.

- [Data model](#data-model)
- [LMSR math](#lmsr-math)
- [RPC reference](#rpc-reference)
- [Error prefixes → HTTP status](#error-prefixes--http-status)
- [Concurrency model](#concurrency-model)
- [Auth & RLS](#auth--rls)

---

## Data model

All money/share columns are `NUMERIC(20,8)` — no floats.

| Table | Columns | Notes |
|---|---|---|
| `users` | `id` (=`auth.users.id`), `name`, `balance` (default 1000, `CHECK >= 0`), `is_admin`, `created_at` | Profile row; created automatically on signup by `handle_new_user`. |
| `markets` | `id`, `question`, `q_yes`, `q_no`, `b_param` (default 100, `CHECK > 0`), `status`, `winning_outcome`, `created_at`, `resolved_at` | `q_yes`/`q_no` = LMSR net-share vector. `CHECK`: `winning_outcome` set **iff** `status='resolved'`. |
| `positions` | `(user_id, market_id, outcome)` PK, `shares` (`CHECK >= 0`) | Current holding. `shares >= 0` is the DB-level no-shorting guard + payout target. |
| `trades` | `id`, `user_id`, `market_id`, `outcome`, `shares`, `cost`, `created_at` | Append-only, **signed** log (`+` buy / `−` sell). |

**Enums:** `market_status ∈ {open, closed, resolved}`, `outcome ∈ {yes, no}`.

---

## LMSR math

Binary market, net-share vector `q = [q_yes, q_no]`, liquidity `b`:

```
C(q)  = b · ln( e^(q_yes/b) + e^(q_no/b) )          cost function
p_i   = e^(q_i/b) / ( e^(q_yes/b) + e^(q_no/b) )     price (p_yes + p_no = 1)
trade = C(q_after) − C(q_before)                     signed cost of a trade
```

Both TS ([`src/lmsr.ts`](../src/lmsr.ts)) and plpgsql ([`0002_trade_rpc.sql`](../supabase/migrations/0002_trade_rpc.sql))
use the **log-sum-exp** form (factor out `max(q_yes/b, q_no/b)`) to avoid `exp` overflow.

Reference values at `b = 100` (asserted in [`src/lmsr.test.ts`](../src/lmsr.test.ts)):

| Call | Value |
|---|---|
| `cost(100, 0, 0)` | `69.31471806` (= 100·ln2) |
| `prices(100, 0, 0)` | `0.5 / 0.5` |
| `tradeCost(100, 0, 0, yes, 50)` | `28.092980362016143` |
| `tradeCost(100, 0, 0, yes, 100)` | `62.011450695827754` |
| `prices(100, 100, 0).yes` | `0.73105858` |
| round-trip (`buy 100`, then `sell 100`) | nets to `0` (no spread) |

> The original spec table printed `62.01144381` for the buy-100 case; that value is
> imprecise. The exact double is `62.011450695827754`, confirmed by both implementations.

**Not zero-sum:** the house subsidises up to `b·ln2 ≈ 69` points per market. Expected;
no solvency accounting.

---

## RPC reference

All are `SECURITY DEFINER` (they write past RLS) and read the caller via `auth.uid()`.

### `execute_trade(p_market_id uuid, p_outcome outcome, p_shares numeric)`

Buy (`p_shares > 0`) or sell (`p_shares < 0`) — one shared path. Atomic.

Returns one row:

| Field | Meaning |
|---|---|
| `trade_cost` | signed: `> 0` user paid, `< 0` user received |
| `new_balance` | balance after the trade |
| `new_q_yes`, `new_q_no` | market's new share vector |
| `price_yes`, `price_no` | new marginal prices |
| `new_position` | caller's holding of `p_outcome` after the trade |

Guards: market must be `open`; sells cannot exceed the held position; buys cannot
exceed balance.

### `create_market(p_question text, p_b_param numeric = 100) → uuid`

Admin only. Opens a market at `q = [0,0]` (prices 0.5/0.5). Returns the new id.

### `set_market_status(p_market_id uuid, p_status market_status) → void`

Admin only. `open ⇄ closed` only — rejects `resolved` (use `resolve_market`) and cannot
un-resolve a resolved market.

### `resolve_market(p_market_id uuid, p_winner outcome) → void`

Admin only. Credits every holder of the winning outcome `+1 point per share`, then sets
`status='resolved'`, `winning_outcome`, `resolved_at` — all in one transaction. Rejects a
second resolve.

---

## Error prefixes → HTTP status

Functions `raise exception 'prefix: detail'`; the API layer
([`src/db/trades.ts`](../src/db/trades.ts)) maps the prefix to a status code.

| Prefix | HTTP |
|---|---|
| `not_authenticated` | 401 |
| `admin_only` | 403 |
| `market_not_found`, `user_not_found`, `market_not_found_or_resolved` | 404 |
| `already_resolved` | 409 |
| `invalid_shares`, `invalid_input`, `market_not_open`, `insufficient_position`, `insufficient_balance`, `use_resolve_market` | 400 |

---

## Concurrency model

`execute_trade` and `resolve_market` both `SELECT … FROM markets … FOR UPDATE` **first**,
so all trades and the resolution on a given market serialize on that one row — no lost
updates, no deadlock. An in-flight trade that loses the lock race to a resolve then sees
`status <> 'open'` and aborts cleanly.

This build locks the **market row only** (a deliberate simplification for the expected
≤100-concurrent load); the `users.balance >= 0` CHECK backstops the rare cross-market
case. Validated by [`supabase/dryrun/run.sh`](../supabase/dryrun/run.sh): 40 concurrent
trades on one market produced zero lost updates.

---

## Auth & RLS

RLS is enabled on every table. Read policies: `markets` public; `users`/`positions`/
`trades` owner-scoped (`auth.uid()`). There are **no** insert/update/delete policies —
the only writers are the `SECURITY DEFINER` functions above. A new signup fires
`handle_new_user`, which inserts the profile row (`name` from user metadata, else the
email local-part) with the 1000-point starting balance.

Admin bootstrap is manual: `update users set is_admin = true where name = 'Admin';`
