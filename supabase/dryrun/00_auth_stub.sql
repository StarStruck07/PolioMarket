-- Local stand-in for Supabase Auth, so the migrations load unchanged.
-- Provides auth.users (referenced by public.users FK + the signup trigger)
-- and auth.uid(), which here reads a session GUC 'app.uid' we set per trade
-- to emulate "the currently logged-in user".
create extension if not exists pgcrypto;

create schema if not exists auth;

create table if not exists auth.users (
  id                 uuid primary key default gen_random_uuid(),
  email              text,
  raw_user_meta_data jsonb not null default '{}'::jsonb
);

create or replace function auth.uid()
returns uuid language sql stable as $$
  select nullif(current_setting('app.uid', true), '')::uuid;
$$;
