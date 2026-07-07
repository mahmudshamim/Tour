-- ============================================================
-- TerraExplore — migration to the pool/deposit expense model
-- Run this ONCE in Supabase → SQL Editor (safe to re-run).
-- ============================================================

-- each member now has a deposit into the shared pool
alter table public.members
  add column if not exists contribution numeric not null default 0;

-- expenses are either 'group' (split from pool) or 'personal' (one member)
alter table public.transactions
  add column if not exists kind text not null default 'group';
alter table public.transactions
  add column if not exists member text;

-- paid_by is no longer used by the app (kept, nullable — harmless)
