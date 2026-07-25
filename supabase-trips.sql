-- ============================================================
-- TerraExplore — multi-trip migration
-- Run this once in Supabase → SQL Editor → New query → Run.
-- Safe to re-run: every step is idempotent.
--
-- What it does:
--   1. adds a `trips` table (one row per tour, archivable)
--   2. adds `trip_id` to members / transactions / audit / places
--   3. folds all existing rows onto a single "legacy" trip, seeded
--      from the old app_settings row so nothing is lost
-- ============================================================

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

alter table public.members      add column if not exists trip_id text;
alter table public.transactions add column if not exists trip_id text;
alter table public.audit        add column if not exists trip_id text;
alter table public.places       add column if not exists trip_id text;

-- ---- backfill: everything that exists today belongs to one trip ----
-- The id matches LEGACY_TRIP_ID in components/store.tsx, so devices and
-- the cloud agree on which trip the pre-migration data landed on.
do $$
declare
  legacy   constant text := 'trip-legacy';
  s        record;
  now_ms   bigint := (extract(epoch from now()) * 1000)::bigint;
  has_rows boolean;
begin
  select * into s from public.app_settings where id = 1;

  insert into public.trips (id, name, status, budget, currency, self_id, created_at)
  values (
    legacy,
    coalesce(nullif(s.trip_name, ''), 'Sylhet'),
    'active',
    coalesce(s.budget, 0),
    coalesce(nullif(s.currency, ''), '৳'),
    coalesce(s.self_id, ''),
    now_ms
  )
  on conflict (id) do nothing;

  update public.members      set trip_id = legacy where trip_id is null;
  update public.transactions set trip_id = legacy where trip_id is null;
  update public.audit        set trip_id = legacy where trip_id is null;
  update public.places       set trip_id = legacy where trip_id is null;

  -- a trips table with no rows makes the app bootstrap its own; only
  -- keep the legacy row if it actually owns something
  select exists (select 1 from public.members      where trip_id = legacy)
      or exists (select 1 from public.transactions where trip_id = legacy)
      or exists (select 1 from public.places       where trip_id = legacy)
    into has_rows;
  if not has_rows and s is null then
    delete from public.trips where id = legacy;
  end if;
end $$;

create index if not exists members_trip_idx      on public.members (trip_id);
create index if not exists transactions_trip_idx on public.transactions (trip_id);
create index if not exists audit_trip_idx        on public.audit (trip_id);
create index if not exists places_trip_idx       on public.places (trip_id);

-- ---- RLS: same open policy as the other tables (no login) ----
alter table public.trips enable row level security;
drop policy if exists "public all" on public.trips;
create policy "public all" on public.trips
  for all to anon, authenticated using (true) with check (true);
grant all on public.trips to anon, authenticated;

-- ---- realtime (safe to skip) ----
do $$
begin
  alter publication supabase_realtime add table public.trips;
exception when others then null;
end $$;

-- app_settings is no longer read by the app; trips carries those fields.
-- Left in place on purpose so this migration stays reversible.
