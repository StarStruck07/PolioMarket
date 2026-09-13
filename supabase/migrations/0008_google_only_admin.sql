-- Phase 10 — Google-only: allowlisted emails auto-become admins
--
-- Lets the admin sign in with their (non-uni) Google account: put the email in
-- admin_allowlist and, on signup, the profile is created with is_admin = true.

create or replace function public.handle_new_user()
returns trigger language plpgsql security definer set search_path = public as $$
declare v_is_admin boolean; v_allowed boolean;
begin
  v_is_admin := exists (
    select 1 from public.admin_allowlist a where lower(a.email) = lower(new.email)
  );
  v_allowed := (new.email ilike '%@pilani.bits-pilani.ac.in') or v_is_admin;

  if not v_allowed then
    raise exception 'signup_not_allowed: use your @pilani.bits-pilani.ac.in Google account';
  end if;

  insert into public.users (id, name, is_admin)
  values (
    new.id,
    coalesce(
      new.raw_user_meta_data->>'name',
      new.raw_user_meta_data->>'full_name',
      split_part(new.email, '@', 1)
    ),
    v_is_admin
  );
  return new;
end; $$;

-- >> Add YOUR admin Google email so signing in with it makes you admin:
--    insert into public.admin_allowlist (email) values ('you@gmail.com')
--    on conflict do nothing;
