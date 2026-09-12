\set QUIET on
\pset pager off
-- Emulate "logged-in user" by setting app.uid, which our stub auth.uid() reads.
-- Fixed UUIDs for repeatability.
\set admin '00000000-0000-0000-0000-000000000001'
\set alice '00000000-0000-0000-0000-0000000000aa'
\set bob   '00000000-0000-0000-0000-0000000000bb'

\echo '=== 6.1 SEED: create 3 auth users (trigger -> public.users @ 1000), make Admin admin ==='
insert into auth.users (id, email, raw_user_meta_data) values
  (:'admin', 'admin@fest.edu', '{"name":"Admin"}'),
  (:'alice', 'alice@fest.edu', '{"name":"Alice"}'),
  (:'bob',   'bob@fest.edu',   '{"name":"Bob"}');
update public.users set is_admin = true where id = :'admin';
select name, balance, is_admin from public.users order by name;

\echo ''
\echo '=== 6.2 CREATE MARKET (admin) -> expect status open, prices 0.5/0.5 ==='
set app.uid = :'admin';
create temp table ctx(mid uuid);
insert into ctx select create_market('Will Team X win the final?', 100);
select id, question, q_yes, q_no, status,
       lmsr_price(b_param, q_yes, q_no, 'yes') as price_yes,
       lmsr_price(b_param, q_yes, q_no, 'no')  as price_no
from markets;

\echo ''
\echo '=== 6.3 TRADE: Alice buys 100 YES -> expect cost 62.0114..., bal 937.98..., price_yes 0.731... ==='
set app.uid = :'alice';
select * from execute_trade((select mid from ctx), 'yes', 100);

\echo ''
\echo '=== 6.4 TRADE: Bob buys 50 NO ==='
set app.uid = :'bob';
select * from execute_trade((select mid from ctx), 'no', 50);

\echo ''
\echo '--- state after both buys: market q, positions, trades ---'
select q_yes, q_no from markets;
select u.name, p.outcome, p.shares from positions p join users u on u.id=p.user_id order by u.name, p.outcome;
select u.name, t.outcome, t.shares, round(t.cost,8) as cost from trades t join users u on u.id=t.user_id order by t.created_at;

\echo ''
\echo '=== 6.5 SELL: Alice sells 40 YES -> expect negative cost (receives), new_position 60 ==='
set app.uid = :'alice';
select * from execute_trade((select mid from ctx), 'yes', -40);

\echo ''
\echo '=== 6.5b OVERSELL: Alice sells 999 YES -> expect rejection (insufficient_position) ==='
set app.uid = :'alice';
do $$
begin
  perform execute_trade((select mid from ctx), 'yes'::outcome, -999);
  raise exception 'DRYRUN-FAIL: oversell was NOT rejected';
exception when others then
  raise notice 'rejected as expected: %', sqlerrm;
end $$;

\echo ''
\echo '=== 6.6 CONSISTENCY: market q must equal sum of signed trade shares per outcome ==='
select
  m.q_yes,
  (select coalesce(sum(shares),0) from trades where market_id=m.id and outcome='yes') as sum_yes,
  m.q_no,
  (select coalesce(sum(shares),0) from trades where market_id=m.id and outcome='no')  as sum_no,
  (m.q_yes = (select coalesce(sum(shares),0) from trades where market_id=m.id and outcome='yes')
   and
   m.q_no  = (select coalesce(sum(shares),0) from trades where market_id=m.id and outcome='no')) as consistent
from markets m;

\echo ''
\echo '=== 6.7 CLOSE (admin), then Alice tries to trade -> expect market_not_open ==='
set app.uid = :'admin';
select set_market_status((select mid from ctx), 'closed');
select status from markets;
set app.uid = :'alice';
do $$
begin
  perform execute_trade((select mid from ctx), 'yes'::outcome, 1);
  raise exception 'DRYRUN-FAIL: trade on closed market was NOT rejected';
exception when others then
  raise notice 'rejected as expected: %', sqlerrm;
end $$;

\echo ''
\echo '--- balances just before resolution ---'
select name, round(balance,8) as balance from users order by name;

\echo ''
\echo '=== 6.8 RESOLVE yes (admin) -> YES holders +shares, NO holders +0 ==='
set app.uid = :'admin';
select resolve_market((select mid from ctx), 'yes');
select status, winning_outcome, resolved_at is not null as has_resolved_at from markets;
select name, round(balance,8) as balance from users order by name;

\echo ''
\echo '=== 6.8b DOUBLE-RESOLVE -> expect already_resolved ==='
do $$
begin
  perform resolve_market((select mid from ctx), 'no'::outcome);
  raise exception 'DRYRUN-FAIL: double-resolve was NOT rejected';
exception when others then
  raise notice 'rejected as expected: %', sqlerrm;
end $$;

\echo ''
\echo '=== 6.9 RECONCILIATION: actual balance == 1000 - sum(costs) + winning_shares, per user ==='
select
  u.name,
  round(u.balance,8) as actual,
  round(1000
    - coalesce((select sum(cost) from trades t where t.user_id=u.id),0)
    + coalesce((select p.shares from positions p
                where p.user_id=u.id and p.market_id=(select mid from ctx)
                  and p.outcome=(select winning_outcome from markets)),0)
  ,8) as expected,
  (round(u.balance,8) = round(1000
    - coalesce((select sum(cost) from trades t where t.user_id=u.id),0)
    + coalesce((select p.shares from positions p
                where p.user_id=u.id and p.market_id=(select mid from ctx)
                  and p.outcome=(select winning_outcome from markets)),0)
  ,8)) as ok
from users u order by u.name;
