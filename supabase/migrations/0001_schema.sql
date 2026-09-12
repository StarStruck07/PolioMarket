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
