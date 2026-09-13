-- Combined migrations 0001-0006, in order. For a FRESH project.
-- (If you already applied up to 0005, run only 0006_admin_powers_logos.sql.)

-- ============================================================
-- 0001_schema.sql
-- ============================================================
-- Phase 1 — Database schema
-- Sports Fest Prediction Market (virtual points, LMSR, binary markets)
--
-- All money/share columns are NUMERIC(20,8): no floats, no drift.
-- RLS is enabled with read-only policies; ALL mutations go through the
-- SECURITY DEFINER functions added in later phases (Phase 3-5).

-- ---------------------------------------------------------------------------
-- Extensions
-- ---------------------------------------------------------------------------
create extension if not exists pgcrypto;  -- gen_random_uuid()

-- ---------------------------------------------------------------------------
-- Enums
-- ---------------------------------------------------------------------------
create type market_status as enum ('open', 'closed', 'resolved');
create type outcome       as enum ('yes', 'no');

-- ---------------------------------------------------------------------------
-- Users (profile row; identity lives in auth.users)
-- ---------------------------------------------------------------------------
create table public.users (
  id         uuid primary key references auth.users(id) on delete cascade,
  name       text not null,
  balance    numeric(20,8) not null default 1000 check (balance >= 0),
  is_admin   boolean not null default false,
  created_at timestamptz not null default now()
);

-- ---------------------------------------------------------------------------
-- Markets (q_yes / q_no = net shares outstanding = the LMSR q vector)
-- ---------------------------------------------------------------------------
create table public.markets (
  id              uuid primary key default gen_random_uuid(),
  question        text not null,
  q_yes           numeric(20,8) not null default 0,
  q_no            numeric(20,8) not null default 0,
  b_param         numeric(20,8) not null default 100 check (b_param > 0),
  status          market_status not null default 'open',
  winning_outcome outcome,
  created_at      timestamptz not null default now(),
  resolved_at     timestamptz,
  -- winning_outcome is set iff the market is resolved
  constraint resolved_iff_winner
    check ((status = 'resolved') = (winning_outcome is not null))
);

-- ---------------------------------------------------------------------------
-- Positions (per user, per market, per outcome).
-- shares >= 0 blocks over-selling; updated inside the same locked trade txn.
-- ---------------------------------------------------------------------------
create table public.positions (
  user_id   uuid not null references public.users(id)   on delete cascade,
  market_id uuid not null references public.markets(id) on delete cascade,
  outcome   outcome not null,
  shares    numeric(20,8) not null default 0 check (shares >= 0),
  primary key (user_id, market_id, outcome)
);

-- ---------------------------------------------------------------------------
-- Trades (append-only log; shares & cost are SIGNED: + buy, - sell)
-- ---------------------------------------------------------------------------
create table public.trades (
  id         uuid primary key default gen_random_uuid(),
  user_id    uuid not null references public.users(id),
  market_id  uuid not null references public.markets(id),
  outcome    outcome not null,
  shares     numeric(20,8) not null,   -- + buy, - sell
  cost       numeric(20,8) not null,   -- + paid, - received
  created_at timestamptz not null default now()
);
create index trades_market_time_idx on public.trades (market_id, created_at);
create index trades_user_idx        on public.trades (user_id);

-- ---------------------------------------------------------------------------
-- Row Level Security
-- Reads: owner-scoped for users/positions/trades; markets are public.
-- Writes: NO insert/update/delete policies -> only SECURITY DEFINER functions
--         (added in later phases) can mutate these tables.
-- ---------------------------------------------------------------------------
alter table public.users     enable row level security;
alter table public.markets   enable row level security;
alter table public.positions enable row level security;
alter table public.trades    enable row level security;

create policy markets_read_all    on public.markets   for select using (true);
create policy users_read_self     on public.users     for select using (id = auth.uid());
create policy positions_read_self on public.positions for select using (user_id = auth.uid());
create policy trades_read_self    on public.trades    for select using (user_id = auth.uid());
-- No insert/update/delete policies: all mutations go through the RPC functions.

-- ---------------------------------------------------------------------------
-- Auto-create a profile row on signup.
-- name = raw_user_meta_data->>'name', else the email local-part.
-- ---------------------------------------------------------------------------
create or replace function public.handle_new_user()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  insert into public.users (id, name)
  values (new.id, coalesce(new.raw_user_meta_data->>'name', split_part(new.email, '@', 1)));
  return new;
end; $$;

create trigger on_auth_user_created
  after insert on auth.users for each row execute function public.handle_new_user();

-- ============================================================
-- 0002_trade_rpc.sql
-- ============================================================
-- Phase 3 — Trade execution
--
-- LMSR helpers (mirror src/lmsr.ts, log-sum-exp form) + the atomic execute_trade
-- RPC. The whole trade — lock, math, guards, writes — runs in one SECURITY
-- DEFINER function = one implicit transaction = atomic.
--
-- Concurrency: we FOR UPDATE the market row only. That serializes every trade on
-- a given market (the one real hot spot). The users.balance CHECK (>= 0) backstops
-- the rare case of one user trading two different markets at once.

-- ---------------------------------------------------------------------------
-- LMSR helpers (immutable; mirror the TS reference)
-- ---------------------------------------------------------------------------
create or replace function public.lmsr_cost(b numeric, q_yes numeric, q_no numeric)
returns numeric language plpgsql immutable as $$
declare xy numeric := q_yes / b; xn numeric := q_no / b; m numeric;
begin
  m := greatest(xy, xn);
  return b * (m + ln(exp(xy - m) + exp(xn - m)));
end; $$;

create or replace function public.lmsr_price(b numeric, q_yes numeric, q_no numeric, side outcome)
returns numeric language plpgsql immutable as $$
declare xy numeric := q_yes / b; xn numeric := q_no / b; m numeric; s numeric;
begin
  m := greatest(xy, xn);
  s := exp(xy - m) + exp(xn - m);
  return case when side = 'yes' then exp(xy - m) / s else exp(xn - m) / s end;
end; $$;

-- ---------------------------------------------------------------------------
-- execute_trade — the atomic buy/sell path (signed shares)
-- ---------------------------------------------------------------------------
create or replace function public.execute_trade(
  p_market_id uuid,
  p_outcome   outcome,
  p_shares    numeric              -- signed: > 0 buy, < 0 sell
)
returns table (
  trade_cost   numeric,
  new_balance  numeric,
  new_q_yes    numeric,
  new_q_no     numeric,
  price_yes    numeric,
  price_no     numeric,
  new_position numeric
)
language plpgsql security definer set search_path = public as $$
declare
  v_uid    uuid := auth.uid();
  v_b      numeric;
  v_status market_status;
  v_q_yes  numeric;
  v_q_no   numeric;
  v_qy_after numeric;
  v_qn_after numeric;
  v_cost   numeric;
  v_balance numeric;
  v_pos    numeric;
begin
  if v_uid is null then raise exception 'not_authenticated: no active session'; end if;
  if p_shares = 0  then raise exception 'invalid_shares: shares must be non-zero'; end if;

  -- 1) lock the market row; only open markets are tradeable
  select b_param, status, q_yes, q_no
    into v_b, v_status, v_q_yes, v_q_no
    from markets where id = p_market_id for update;
  if not found          then raise exception 'market_not_found: %', p_market_id; end if;
  if v_status <> 'open' then raise exception 'market_not_open: status is %', v_status; end if;

  -- 2) current holding for this outcome (sell guard)
  select shares into v_pos from positions
    where user_id = v_uid and market_id = p_market_id and outcome = p_outcome;
  v_pos := coalesce(v_pos, 0);

  -- sell guard: cannot sell more than held (no shorting)
  if p_shares < 0 and (v_pos + p_shares) < 0 then
    raise exception 'insufficient_position: tried to sell %, only hold %', -p_shares, v_pos;
  end if;

  -- 3) new q vector
  if p_outcome = 'yes' then
    v_qy_after := v_q_yes + p_shares; v_qn_after := v_q_no;
  else
    v_qy_after := v_q_yes;            v_qn_after := v_q_no + p_shares;
  end if;

  -- 4) signed cost + balance guard (only on a net payment)
  v_cost := lmsr_cost(v_b, v_qy_after, v_qn_after) - lmsr_cost(v_b, v_q_yes, v_q_no);

  select balance into v_balance from users where id = v_uid;
  if not found then raise exception 'user_not_found: profile missing for uid %', v_uid; end if;
  if v_cost > 0 and v_balance < v_cost then
    raise exception 'insufficient_balance: need %, have %', v_cost, v_balance;
  end if;

  -- 5) apply — all inside this transaction, under the market lock
  update markets set q_yes = v_qy_after, q_no = v_qn_after where id = p_market_id;
  update users   set balance = balance - v_cost          where id = v_uid;

  insert into positions (user_id, market_id, outcome, shares)
    values (v_uid, p_market_id, p_outcome, v_pos + p_shares)
    on conflict (user_id, market_id, outcome)
    do update set shares = excluded.shares;

  insert into trades (user_id, market_id, outcome, shares, cost)
    values (v_uid, p_market_id, p_outcome, p_shares, v_cost);

  return query select
    v_cost,
    v_balance - v_cost,
    v_qy_after,
    v_qn_after,
    lmsr_price(v_b, v_qy_after, v_qn_after, 'yes'),
    lmsr_price(v_b, v_qy_after, v_qn_after, 'no'),
    v_pos + p_shares;
end; $$;

-- ============================================================
-- 0003_market_lifecycle.sql
-- ============================================================
-- Phase 4 — Market lifecycle (admin only)
--
-- create_market:     open a new binary market (status 'open', prices 0.5/0.5).
-- set_market_status: open <-> closed transitions. Resolving is NOT allowed here;
--                    use resolve_market() (Phase 5), which also pays out.
--
-- Both are SECURITY DEFINER and gate on users.is_admin. Trades are already blocked
-- on non-open markets by the status check inside execute_trade.

-- ---------------------------------------------------------------------------
-- create_market — admin opens a new market
-- ---------------------------------------------------------------------------
create or replace function public.create_market(
  p_question text,
  p_b_param  numeric default 100
)
returns uuid
language plpgsql security definer set search_path = public as $$
declare
  v_admin boolean;
  v_id    uuid;
begin
  select is_admin into v_admin from users where id = auth.uid();
  if not coalesce(v_admin, false) then raise exception 'admin_only: create_market requires is_admin'; end if;

  if p_question is null or length(btrim(p_question)) = 0 then
    raise exception 'invalid_input: question is required';
  end if;
  if p_b_param is null or p_b_param <= 0 then
    raise exception 'invalid_input: b_param must be > 0';
  end if;

  insert into markets (question, b_param, status)
    values (btrim(p_question), p_b_param, 'open')
    returning id into v_id;

  return v_id;
end; $$;

-- ---------------------------------------------------------------------------
-- set_market_status — admin opens/closes a market (never resolves)
-- ---------------------------------------------------------------------------
create or replace function public.set_market_status(
  p_market_id uuid,
  p_status    market_status
)
returns void
language plpgsql security definer set search_path = public as $$
declare v_admin boolean;
begin
  select is_admin into v_admin from users where id = auth.uid();
  if not coalesce(v_admin, false) then raise exception 'admin_only: set_market_status requires is_admin'; end if;

  if p_status = 'resolved' then raise exception 'use_resolve_market: call resolve_market() instead'; end if;

  update markets set status = p_status
    where id = p_market_id and status <> 'resolved';
  if not found then raise exception 'market_not_found_or_resolved: %', p_market_id; end if;
end; $$;

-- ============================================================
-- 0004_resolution.sql
-- ============================================================
-- Phase 5 — Resolution & payout (admin only)
--
-- Admin sets the winning outcome; every winning share redeems for 1 point;
-- losing shares pay 0. All in one transaction.
--
-- Lock order matches execute_trade: the market row is locked FIRST. An in-flight
-- trade on this market waits on that lock, then re-reads status <> 'open' and
-- aborts -- so a trade and a resolve on the same market serialize cleanly.

create or replace function public.resolve_market(
  p_market_id uuid,
  p_winner    outcome
)
returns void
language plpgsql security definer set search_path = public as $$
declare
  v_admin  boolean;
  v_status market_status;
begin
  select is_admin into v_admin from users where id = auth.uid();
  if not coalesce(v_admin, false) then raise exception 'admin_only: resolve_market requires is_admin'; end if;

  -- lock the market first (same order as execute_trade -> no deadlock)
  select status into v_status from markets where id = p_market_id for update;
  if not found              then raise exception 'market_not_found: %', p_market_id; end if;
  if v_status = 'resolved'  then raise exception 'already_resolved: market % is already resolved', p_market_id; end if;

  -- pay out: each winning share -> 1 point. Losing shares pay nothing.
  update users u
    set balance = balance + p.shares
    from positions p
    where p.market_id = p_market_id
      and p.outcome   = p_winner
      and p.user_id   = u.id
      and p.shares    > 0;

  update markets
    set status = 'resolved', winning_outcome = p_winner, resolved_at = now()
    where id = p_market_id;
end; $$;

-- ============================================================
-- 0005_matches_admin_history.sql
-- ============================================================
-- Phase 7 — Match metadata (tags), admin edit/delete, price history
--
-- Adds team/sport/round tags to markets, extends create_market, adds
-- update_market + delete_market (admin), and a public price-history function.

-- ---------------------------------------------------------------------------
-- Tag columns (all nullable so existing markets keep working)
-- ---------------------------------------------------------------------------
alter table public.markets add column if not exists team_a text;
alter table public.markets add column if not exists team_b text;
alter table public.markets add column if not exists sport  text;
alter table public.markets add column if not exists round  text;

create index if not exists markets_sport_idx on public.markets (sport);
create index if not exists markets_round_idx on public.markets (round);

-- ---------------------------------------------------------------------------
-- create_market — extended with tag fields (replaces the 2-arg version)
-- ---------------------------------------------------------------------------
drop function if exists public.create_market(text, numeric);

create or replace function public.create_market(
  p_question text,
  p_b_param  numeric default 100,
  p_team_a   text default null,
  p_team_b   text default null,
  p_sport    text default null,
  p_round    text default null
)
returns uuid
language plpgsql security definer set search_path = public as $$
declare v_admin boolean; v_id uuid; v_question text;
begin
  select is_admin into v_admin from users where id = auth.uid();
  if not coalesce(v_admin, false) then raise exception 'admin_only: create_market requires is_admin'; end if;

  -- Derive the question from the teams if not given.
  v_question := nullif(btrim(coalesce(p_question, '')), '');
  if v_question is null and p_team_a is not null and p_team_b is not null then
    v_question := p_team_a || ' vs ' || p_team_b;
  end if;
  if v_question is null then raise exception 'invalid_input: question or both teams are required'; end if;
  if p_b_param is null or p_b_param <= 0 then raise exception 'invalid_input: b_param must be > 0'; end if;

  insert into markets (question, b_param, team_a, team_b, sport, round, status)
    values (v_question, p_b_param,
            nullif(btrim(coalesce(p_team_a,'')),''), nullif(btrim(coalesce(p_team_b,'')),''),
            nullif(btrim(coalesce(p_sport,'')),''),  nullif(btrim(coalesce(p_round,'')),''),
            'open')
    returning id into v_id;
  return v_id;
end; $$;

-- ---------------------------------------------------------------------------
-- update_market — admin edits metadata; b_param only while untraded
-- ---------------------------------------------------------------------------
create or replace function public.update_market(
  p_market_id uuid,
  p_question  text,
  p_team_a    text,
  p_team_b    text,
  p_sport     text,
  p_round     text,
  p_b_param   numeric default null
)
returns void
language plpgsql security definer set search_path = public as $$
declare v_admin boolean; v_status market_status; v_b numeric; v_question text;
begin
  select is_admin into v_admin from users where id = auth.uid();
  if not coalesce(v_admin, false) then raise exception 'admin_only: update_market requires is_admin'; end if;

  select status, b_param into v_status, v_b from markets where id = p_market_id for update;
  if not found then raise exception 'market_not_found: %', p_market_id; end if;
  if v_status = 'resolved' then raise exception 'already_resolved: cannot edit a resolved market'; end if;

  v_question := nullif(btrim(coalesce(p_question,'')),'');
  if v_question is null and p_team_a is not null and p_team_b is not null then
    v_question := p_team_a || ' vs ' || p_team_b;
  end if;
  if v_question is null then raise exception 'invalid_input: question or both teams are required'; end if;

  -- b_param may only change before any trades (it defines the LMSR cost curve).
  if p_b_param is not null and p_b_param <> v_b then
    if p_b_param <= 0 then raise exception 'invalid_input: b_param must be > 0'; end if;
    if exists (select 1 from trades where market_id = p_market_id) then
      raise exception 'invalid_input: cannot change b_param after trades exist';
    end if;
    update markets set b_param = p_b_param where id = p_market_id;
  end if;

  update markets set
    question = v_question,
    team_a   = nullif(btrim(coalesce(p_team_a,'')),''),
    team_b   = nullif(btrim(coalesce(p_team_b,'')),''),
    sport    = nullif(btrim(coalesce(p_sport,'')),''),
    round    = nullif(btrim(coalesce(p_round,'')),'')
  where id = p_market_id;
end; $$;

-- ---------------------------------------------------------------------------
-- delete_market — admin; only when the market has no trades (keeps points sane)
-- ---------------------------------------------------------------------------
create or replace function public.delete_market(p_market_id uuid)
returns void
language plpgsql security definer set search_path = public as $$
declare v_admin boolean;
begin
  select is_admin into v_admin from users where id = auth.uid();
  if not coalesce(v_admin, false) then raise exception 'admin_only: delete_market requires is_admin'; end if;

  if exists (select 1 from trades where market_id = p_market_id) then
    raise exception 'invalid_input: cannot delete a market with trades; resolve it instead';
  end if;

  delete from positions where market_id = p_market_id;  -- none if no trades, but be safe
  delete from markets   where id = p_market_id;
  if not found then raise exception 'market_not_found: %', p_market_id; end if;
end; $$;

-- ---------------------------------------------------------------------------
-- market_price_history — public time-series of YES/NO price, from the trade log
-- Reconstructs q over time; returns only prices + timestamps (no user data).
-- ---------------------------------------------------------------------------
create or replace function public.market_price_history(p_market_id uuid)
returns table (t timestamptz, price_yes numeric, price_no numeric)
language plpgsql stable security definer set search_path = public as $$
declare v_b numeric; v_created timestamptz; qy numeric := 0; qn numeric := 0; r record;
begin
  select b_param, created_at into v_b, v_created from markets where id = p_market_id;
  if not found then return; end if;

  t := v_created;
  price_yes := lmsr_price(v_b, 0, 0, 'yes');
  price_no  := lmsr_price(v_b, 0, 0, 'no');
  return next;

  for r in
    select outcome, shares, created_at from trades
    where market_id = p_market_id order by created_at, id
  loop
    if r.outcome = 'yes' then qy := qy + r.shares; else qn := qn + r.shares; end if;
    t := r.created_at;
    price_yes := lmsr_price(v_b, qy, qn, 'yes');
    price_no  := lmsr_price(v_b, qy, qn, 'no');
    return next;
  end loop;
end; $$;

-- ============================================================
-- 0006_admin_powers_logos.sql
-- ============================================================
-- Phase 8 — Logos, fuller admin powers (edit resolved, refunding delete,
-- edit user balances), and a logos storage bucket.

-- ---------------------------------------------------------------------------
-- Logo URL columns (per team)
-- ---------------------------------------------------------------------------
alter table public.markets add column if not exists team_a_logo text;
alter table public.markets add column if not exists team_b_logo text;

-- ---------------------------------------------------------------------------
-- update_market — now accepts logo URLs and allows editing RESOLVED markets
-- (metadata only; b_param still locked once any trade exists)
-- ---------------------------------------------------------------------------
drop function if exists public.update_market(uuid, text, text, text, text, text, numeric);

create or replace function public.update_market(
  p_market_id   uuid,
  p_question    text,
  p_team_a      text,
  p_team_b      text,
  p_sport       text,
  p_round       text,
  p_b_param     numeric default null,
  p_team_a_logo text default null,
  p_team_b_logo text default null
)
returns void
language plpgsql security definer set search_path = public as $$
declare v_admin boolean; v_b numeric; v_question text;
begin
  select is_admin into v_admin from users where id = auth.uid();
  if not coalesce(v_admin, false) then raise exception 'admin_only: update_market requires is_admin'; end if;

  select b_param into v_b from markets where id = p_market_id for update;
  if not found then raise exception 'market_not_found: %', p_market_id; end if;

  v_question := nullif(btrim(coalesce(p_question,'')),'');
  if v_question is null and p_team_a is not null and p_team_b is not null then
    v_question := p_team_a || ' vs ' || p_team_b;
  end if;
  if v_question is null then raise exception 'invalid_input: question or both teams are required'; end if;

  if p_b_param is not null and p_b_param <> v_b then
    if p_b_param <= 0 then raise exception 'invalid_input: b_param must be > 0'; end if;
    if exists (select 1 from trades where market_id = p_market_id) then
      raise exception 'invalid_input: cannot change b_param after trades exist';
    end if;
    update markets set b_param = p_b_param where id = p_market_id;
  end if;

  update markets set
    question    = v_question,
    team_a      = nullif(btrim(coalesce(p_team_a,'')),''),
    team_b      = nullif(btrim(coalesce(p_team_b,'')),''),
    sport       = nullif(btrim(coalesce(p_sport,'')),''),
    round       = nullif(btrim(coalesce(p_round,'')),''),
    team_a_logo = nullif(btrim(coalesce(p_team_a_logo,'')),''),
    team_b_logo = nullif(btrim(coalesce(p_team_b_logo,'')),'')
  where id = p_market_id;
end; $$;

-- ---------------------------------------------------------------------------
-- delete_market — now always allowed; refunds net spend for unresolved markets
-- (resolved markets already paid out, so balances are left as-is)
-- ---------------------------------------------------------------------------
create or replace function public.delete_market(p_market_id uuid)
returns void
language plpgsql security definer set search_path = public as $$
declare v_admin boolean; v_status market_status;
begin
  select is_admin into v_admin from users where id = auth.uid();
  if not coalesce(v_admin, false) then raise exception 'admin_only: delete_market requires is_admin'; end if;

  select status into v_status from markets where id = p_market_id for update;
  if not found then raise exception 'market_not_found: %', p_market_id; end if;

  -- Cancel: return each trader's net spend (sum of signed cost). Only for
  -- unresolved markets; resolved ones already settled via resolve_market.
  if v_status <> 'resolved' then
    update users u
      set balance = balance + agg.net
      from (
        select user_id, sum(cost) as net
        from trades where market_id = p_market_id group by user_id
      ) agg
      where u.id = agg.user_id;
  end if;

  delete from positions where market_id = p_market_id;
  delete from trades   where market_id = p_market_id;
  delete from markets  where id = p_market_id;
end; $$;

-- ---------------------------------------------------------------------------
-- admin_list_users — admin-only read of all profiles (RLS otherwise self-only)
-- ---------------------------------------------------------------------------
create or replace function public.admin_list_users()
returns table (id uuid, name text, balance numeric, is_admin boolean)
language plpgsql stable security definer set search_path = public as $$
declare v_admin boolean;
begin
  select u.is_admin into v_admin from users u where u.id = auth.uid();
  if not coalesce(v_admin, false) then raise exception 'admin_only: admin_list_users requires is_admin'; end if;
  return query select u.id, u.name, u.balance, u.is_admin from users u order by u.name;
end; $$;

-- ---------------------------------------------------------------------------
-- admin_set_balance — admin sets any user's points to an absolute value
-- ---------------------------------------------------------------------------
create or replace function public.admin_set_balance(p_user_id uuid, p_balance numeric)
returns void
language plpgsql security definer set search_path = public as $$
declare v_admin boolean;
begin
  select is_admin into v_admin from users where id = auth.uid();
  if not coalesce(v_admin, false) then raise exception 'admin_only: admin_set_balance requires is_admin'; end if;
  if p_balance is null or p_balance < 0 then raise exception 'invalid_input: balance must be >= 0'; end if;
  update users set balance = p_balance where id = p_user_id;
  if not found then raise exception 'market_not_found: no such user'; end if;
end; $$;

-- ---------------------------------------------------------------------------
-- Storage: public "logos" bucket; anyone can read, only admins can write.
-- ---------------------------------------------------------------------------
insert into storage.buckets (id, name, public)
  values ('logos', 'logos', true)
  on conflict (id) do update set public = true;

drop policy if exists "logos public read"  on storage.objects;
drop policy if exists "logos admin insert" on storage.objects;
drop policy if exists "logos admin update" on storage.objects;
drop policy if exists "logos admin delete" on storage.objects;

create policy "logos public read" on storage.objects
  for select using (bucket_id = 'logos');

create policy "logos admin insert" on storage.objects
  for insert to authenticated
  with check (bucket_id = 'logos'
    and exists (select 1 from public.users where id = auth.uid() and is_admin));

create policy "logos admin update" on storage.objects
  for update to authenticated
  using (bucket_id = 'logos'
    and exists (select 1 from public.users where id = auth.uid() and is_admin));

create policy "logos admin delete" on storage.objects
  for delete to authenticated
  using (bucket_id = 'logos'
    and exists (select 1 from public.users where id = auth.uid() and is_admin));

