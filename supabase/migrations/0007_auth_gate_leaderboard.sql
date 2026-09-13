-- Phase 9 — Signup domain gate + leaderboard
--
-- New signups must use a university Google account (@pilani.bits-pilani.ac.in),
-- unless their email is in admin_allowlist (for the admin, who uses a non-uni
-- email). Existing users are unaffected. Login by any existing account still works.

-- ---------------------------------------------------------------------------
-- Allowlist for non-uni accounts (e.g. the admin). Deny-all RLS; only the
-- SECURITY DEFINER trigger (runs as owner) reads it.
-- ---------------------------------------------------------------------------
create table if not exists public.admin_allowlist (
  email text primary key
);
alter table public.admin_allowlist enable row level security;

-- >> Add your admin email so you can (re)sign up with it, e.g.:
--    insert into public.admin_allowlist (email) values ('you@gmail.com')
--    on conflict do nothing;

-- ---------------------------------------------------------------------------
-- Gate new signups by email domain / allowlist
-- ---------------------------------------------------------------------------
create or replace function public.handle_new_user()
returns trigger language plpgsql security definer set search_path = public as $$
declare v_allowed boolean;
begin
  v_allowed :=
    (new.email ilike '%@pilani.bits-pilani.ac.in')
    or exists (select 1 from public.admin_allowlist a where lower(a.email) = lower(new.email));

  if not v_allowed then
    raise exception 'signup_not_allowed: use your @pilani.bits-pilani.ac.in Google account';
  end if;

  insert into public.users (id, name)
  values (
    new.id,
    coalesce(
      new.raw_user_meta_data->>'name',
      new.raw_user_meta_data->>'full_name',
      split_part(new.email, '@', 1)
    )
  );
  return new;
end; $$;

-- ---------------------------------------------------------------------------
-- leaderboard — public ranking by available points (excludes admins).
-- "Available points" already excludes points tied up in unresolved bets,
-- since buying reduces balance until the market resolves.
-- ---------------------------------------------------------------------------
create or replace function public.leaderboard()
returns table (rank bigint, name text, balance numeric)
language sql stable security definer set search_path = public as $$
  select rank() over (order by balance desc) as rank, name, balance
  from users
  where is_admin = false
  order by balance desc, name;
$$;
