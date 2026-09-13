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
