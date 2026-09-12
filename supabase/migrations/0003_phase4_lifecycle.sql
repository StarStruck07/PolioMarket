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
