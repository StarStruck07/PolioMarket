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
