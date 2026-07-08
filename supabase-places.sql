-- ============================================================
-- TerraExplore — cloud sync migration (places + audit attribution)
-- Run this ONCE in Supabase → SQL Editor (safe to re-run).
-- ============================================================

-- who + which device made each activity-log entry
alter table public.audit add column if not exists actor     text;
alter table public.audit add column if not exists device    text;
alter table public.audit add column if not exists device_id text;
alter table public.audit add column if not exists tz        text;

create table if not exists public.places (
  id    text primary key,
  name  text not null,
  area  text,
  icon  text default 'pin',
  done  boolean not null default false,
  ord   int not null default 0
);

alter table public.places enable row level security;

drop policy if exists "public all" on public.places;
create policy "public all" on public.places
  for all to anon, authenticated using (true) with check (true);

grant all on public.places to anon, authenticated;

-- realtime so one device's change shows on everyone else's
do $$
begin
  alter publication supabase_realtime add table public.places;
exception when others then null;
end $$;
