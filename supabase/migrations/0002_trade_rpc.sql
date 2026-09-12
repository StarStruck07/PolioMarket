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
