-- ============================================================
-- TerraExplore — Supabase schema (no-login, shared dataset)
-- Run this in Supabase → SQL Editor → New query → Run.
-- ============================================================

create table if not exists public.members (
  id           text primary key,
  name         text not null,
  color        text,
  contribution numeric not null default 0,
  created_at   bigint
);

create table if not exists public.transactions (
  id         text primary key,
  title      text not null,
  amount     numeric not null default 0,
  category   text,
  kind       text not null default 'group',
  member     text,
  paid_by    text,
  split      jsonb not null default '[]'::jsonb,
  created_at bigint,
  updated_at bigint
);

create table if not exists public.audit (
  id       text primary key,
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

create table if not exists public.app_settings (
  id        int primary key default 1,
  trip_name text default '',
  budget    numeric default 0,
  currency  text default '৳',
  self_id   text default ''
);

create table if not exists public.places (
  id    text primary key,
  name  text not null,
  area  text,
  icon  text default 'pin',
  done  boolean not null default false,
  ord   int not null default 0
);

-- seed the single settings row
insert into public.app_settings (id) values (1)
on conflict (id) do nothing;

-- ============================================================
-- Row Level Security — open access for the anon (publishable) key
-- (no login; anyone with the app shares one dataset)
-- ============================================================
alter table public.members       enable row level security;
alter table public.transactions  enable row level security;
alter table public.audit         enable row level security;
alter table public.app_settings  enable row level security;
alter table public.places        enable row level security;

do $$
declare t text;
begin
  foreach t in array array['members','transactions','audit','app_settings','places'] loop
    execute format('drop policy if exists "public all" on public.%I', t);
    execute format(
      'create policy "public all" on public.%I for all to anon, authenticated using (true) with check (true)',
      t
    );
  end loop;
end $$;

grant all on public.members, public.transactions, public.audit,
  public.app_settings, public.places to anon, authenticated;

-- Optional: realtime cross-device sync (safe to skip)
do $$
begin
  alter publication supabase_realtime add table
    public.members, public.transactions, public.audit,
    public.app_settings, public.places;
exception when others then null;
end $$;
