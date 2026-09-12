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
