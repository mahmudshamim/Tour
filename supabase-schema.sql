-- ============================================================
-- TerraExplore — Supabase schema (no-login, shared dataset)
-- Run this in Supabase → SQL Editor → New query → Run.
-- ============================================================

-- One row per tour. Everything below is scoped to a trip via trip_id;
-- archiving a trip freezes it read-only in the app.
create table if not exists public.trips (
  id          text primary key,
  name        text not null default '',
  status      text not null default 'active',   -- active | archived
  budget      numeric not null default 0,
  currency    text not null default '৳',
  self_id     text default '',
  created_at  bigint,
  archived_at bigint
);

create table if not exists public.members (
  id           text primary key,
  trip_id      text,
  name         text not null,
  color        text,
  contribution numeric not null default 0,
  created_at   bigint
);

create table if not exists public.transactions (
  id         text primary key,
  trip_id    text,
  title      text not null,
  amount     numeric not null default 0,
  category   text,
  kind       text not null default 'group',   -- group | personal | own
  member     text,
  paid_by    text,
  split      jsonb not null default '[]'::jsonb,
  created_at bigint,
  updated_at bigint
);

create table if not exists public.audit (
  id       text primary key,
  trip_id  text,
  txn_id   text,
  title    text,
  amount   numeric,
  action   text,
  at        bigint,
  changes   jsonb,
  actor     text,
  device    text,
  device_id text,
  tz        text
);

-- Superseded by `trips`; kept so supabase-trips.sql can migrate from it.
create table if not exists public.app_settings (
  id        int primary key default 1,
  trip_name text default '',
  budget    numeric default 0,
  currency  text default '৳',
  self_id   text default ''
);

create table if not exists public.places (
  id      text primary key,
  trip_id text,
  name    text not null,
  area    text,
  icon    text default 'pin',
  done    boolean not null default false,
  ord     int not null default 0
);

create index if not exists members_trip_idx      on public.members (trip_id);
create index if not exists transactions_trip_idx on public.transactions (trip_id);
create index if not exists audit_trip_idx        on public.audit (trip_id);
create index if not exists places_trip_idx       on public.places (trip_id);

-- ============================================================
-- Row Level Security — open access for the anon (publishable) key
-- (no login; anyone with the app shares one dataset)
-- ============================================================
alter table public.trips         enable row level security;
alter table public.members       enable row level security;
alter table public.transactions  enable row level security;
alter table public.audit         enable row level security;
alter table public.app_settings  enable row level security;
alter table public.places        enable row level security;

do $$
declare t text;
begin
  foreach t in array array['trips','members','transactions','audit','app_settings','places'] loop
    execute format('drop policy if exists "public all" on public.%I', t);
    execute format(
      'create policy "public all" on public.%I for all to anon, authenticated using (true) with check (true)',
      t
    );
  end loop;
end $$;

grant all on public.trips, public.members, public.transactions, public.audit,
  public.app_settings, public.places to anon, authenticated;

-- Optional: realtime cross-device sync (safe to skip)
do $$
begin
  alter publication supabase_realtime add table
    public.trips, public.members, public.transactions, public.audit,
    public.app_settings, public.places;
exception when others then null;
end $$;
