-- ============================================================
-- TerraExplore — edit lock, per-tour details, photos, plan, settle-up
-- Run in Supabase → SQL Editor → New query → Run.
-- Safe to re-run: every step is idempotent, and re-running keeps the
-- password, the tours and every unlocked device as they are.
--
-- Needs the multi-trip tables (supabase-trips.sql) to exist first.
--
-- After this runs:
--   • anyone with the link can VIEW every tour (read-only)
--   • nobody can write straight to the tables any more — every write
--     goes through public.terra_apply(), which needs a session token
--   • a token comes from public.terra_login(password); passwords are
--     stored only as bcrypt hashes in a private schema the API can't see
--   • the organiser password edits every tour; a tour can also get its
--     own co-organiser password, which edits only that tour
--
-- THEN set the organiser password (SQL Editor, once — change it the same way):
--
--     select terra_private.set_password('your-strong-password');
--
-- Setting it signs every device out, so it doubles as "revoke all".
-- ============================================================

create extension if not exists pgcrypto with schema extensions;

-- ---- per-tour details (all optional) ----
alter table public.trips add column if not exists destination text default '';
alter table public.trips add column if not exists origin      text default '';
alter table public.trips add column if not exists start_date  text;            -- YYYY-MM-DD
alter table public.trips add column if not exists end_date    text;            -- YYYY-MM-DD
alter table public.trips add column if not exists cover       text default ''; -- emoji
alter table public.trips add column if not exists accent      text default ''; -- colour key
alter table public.trips add column if not exists note        text default '';
alter table public.trips add column if not exists distance_km numeric default 0;
alter table public.trips add column if not exists travel_time text default '';
-- settle-up: who holds the pool's cash, and who has already settled
alter table public.trips add column if not exists holder_id   text default '';
alter table public.trips add column if not exists settled     jsonb default '{}'::jsonb;

-- ---- when each expense was actually spent (editable; defaults to when
-- it was logged, so rows from before this column keep their date) ----
alter table public.transactions add column if not exists spent_at bigint;
update public.transactions set spent_at = created_at where spent_at is null;
-- version of the expense's receipt photo; 0 = none
alter table public.transactions add column if not exists receipt_at bigint default 0;

-- ---- day-by-day plan + real map ----
alter table public.places add column if not exists day        int default 0;   -- 0 = not on a day
alter table public.places add column if not exists start_time text default '';  -- HH:MM
alter table public.places add column if not exists lat        double precision;
alter table public.places add column if not exists lng        double precision;

-- ---- photos (small JPEGs, shrunk on the phone first). Their own tables,
-- so the rows polled often — tours, expenses — stay light. ----
create table if not exists public.trip_covers (
  id         text primary key,   -- = trips.id
  photo      text not null,      -- data:image/jpeg;base64,…
  updated_at bigint
);
create table if not exists public.receipts (
  id         text primary key,   -- = transactions.id
  trip_id    text,
  photo      text not null,
  updated_at bigint
);
create index if not exists receipts_trip_idx on public.receipts (trip_id);

-- ============================================================
-- Private schema — not exposed by the API, no grants to anon
-- ============================================================
create schema if not exists terra_private;
revoke all on schema terra_private from public, anon, authenticated;

create table if not exists terra_private.secret (
  id         int primary key default 1 check (id = 1),
  pass_hash  text not null,
  updated_at timestamptz not null default now()
);

-- a tour's own co-organiser password (optional)
create table if not exists terra_private.trip_secrets (
  trip_id    text primary key,
  pass_hash  text not null,
  updated_at timestamptz not null default now()
);

-- tokens are stored hashed: a leaked row can't be replayed.
-- trip_id null = organiser (every tour); else only that tour.
create table if not exists terra_private.sessions (
  token_hash text primary key,
  device     text,
  created_at timestamptz not null default now(),
  last_used  timestamptz not null default now()
);
alter table terra_private.sessions add column if not exists trip_id text;

create table if not exists terra_private.login_fails (
  at timestamptz not null default now()
);

revoke all on all tables in schema terra_private from public, anon, authenticated;

create or replace function terra_private.hash_token(p_token text)
returns text language sql immutable set search_path = '' as $$
  select encode(extensions.digest(coalesce(p_token, ''), 'sha256'), 'hex');
$$;

/** '*' = organiser, a trip id = that tour only, null = no live session. */
create or replace function terra_private.session_scope(p_token text)
returns text language sql stable set search_path = '' as $$
  select coalesce(trip_id, '*') from terra_private.sessions
   where token_hash = terra_private.hash_token(p_token)
     and last_used > now() - interval '120 days'
   limit 1;
$$;

create or replace function terra_private.session_ok(p_token text)
returns boolean language sql stable set search_path = '' as $$
  select terra_private.session_scope(p_token) is not null;
$$;

drop function if exists terra_private.new_session(text);
create or replace function terra_private.new_session(p_device text, p_trip text default null)
returns text language plpgsql set search_path = '' as $$
declare tok text := encode(extensions.gen_random_bytes(32), 'hex');
begin
  insert into terra_private.sessions (token_hash, device, trip_id)
  values (terra_private.hash_token(tok), left(coalesce(p_device, ''), 120), p_trip);
  return tok;
end $$;

/** Owner-only (SQL Editor). Not reachable through the API. */
create or replace function terra_private.set_password(p_new text)
returns void language plpgsql set search_path = '' as $$
begin
  if coalesce(length(p_new), 0) < 6 then
    raise exception 'password must be at least 6 characters';
  end if;
  insert into terra_private.secret (id, pass_hash, updated_at)
  values (1, extensions.crypt(p_new, extensions.gen_salt('bf', 10)), now())
  on conflict (id) do update
    set pass_hash = excluded.pass_hash, updated_at = now();
  delete from terra_private.sessions where token_hash is not null;
  delete from terra_private.login_fails where at is not null;
end $$;

/**
 * Upsert one row, touching only the columns the client sent — so an
 * older client that doesn't know a newer column leaves it alone.
 * Table names are whitelisted; column names come from the catalog.
 */
create or replace function terra_private.upsert_row(p_table text, p_row jsonb)
returns void language plpgsql set search_path = '' as $$
declare
  cols text;
  sets text;
begin
  if p_table not in ('trips', 'members', 'transactions', 'audit', 'places', 'trip_covers', 'receipts') then
    raise exception 'table % is not writable', p_table;
  end if;
  if jsonb_typeof(p_row) is distinct from 'object'
     or coalesce(p_row->>'id', '') = '' then
    raise exception 'row for % needs an id', p_table;
  end if;

  select string_agg(quote_ident(c.column_name), ', ' order by c.ordinal_position),
         string_agg(format('%1$I = excluded.%1$I', c.column_name), ', '
                    order by c.ordinal_position)
           filter (where c.column_name <> 'id')
    into cols, sets
    from information_schema.columns c
   where c.table_schema = 'public'
     and c.table_name = p_table
     and p_row ? c.column_name;

  execute format(
    'insert into public.%1$I (%2$s) '
    'select %2$s from jsonb_populate_record(null::public.%1$I, $1) '
    'on conflict (id) do %3$s',
    p_table,
    cols,
    case when sets is null then 'nothing' else 'update set ' || sets end
  ) using p_row;
end $$;

/**
 * A co-organiser session may only touch its own tour: every row it
 * writes must carry that trip id, and a row that already exists must
 * already belong to it (no pulling another tour's rows over).
 */
create or replace function terra_private.check_scope(op jsonb, p_scope text)
returns void language plpgsql set search_path = '' as $$
declare
  t   text  := op->>'t';
  v   jsonb := op->'v';
  rid text  := op->>'id';
  tbl text;
  bad boolean;
begin
  if t in ('trip.del', 'all.clear') then
    raise exception 'only the organiser can do that';
  end if;
  if t = 'trip.put' then
    if v->>'id' is distinct from p_scope
       or not exists (select 1 from public.trips where id = p_scope) then
      raise exception 'not your tour';
    end if;
    return;
  end if;
  if t = 'cover.put' then
    if v->>'id' is distinct from p_scope then raise exception 'not your tour'; end if;
    return;
  end if;
  if t = 'cover.del' then
    if rid is distinct from p_scope then raise exception 'not your tour'; end if;
    return;
  end if;

  tbl := case split_part(t, '.', 1)
           when 'member'  then 'members'
           when 'txn'     then 'transactions'
           when 'audit'   then 'audit'
           when 'place'   then 'places'
           when 'receipt' then 'receipts'
         end;
  if tbl is null then
    raise exception 'unknown op: %', t;
  end if;
  if t like '%.put' then
    if v->>'trip_id' is distinct from p_scope then raise exception 'not your tour'; end if;
    rid := v->>'id';
  end if;
  execute format(
    'select exists (select 1 from public.%I where id = $1 and trip_id is distinct from $2)', tbl
  ) into bad using rid, p_scope;
  if bad then
    raise exception 'not your tour';
  end if;
end $$;

drop function if exists terra_private.apply_op(jsonb);
create or replace function terra_private.apply_op(op jsonb, p_scope text default null)
returns void language plpgsql set search_path = '' as $$
declare
  t   text  := op->>'t';
  v   jsonb := op->'v';
  rid text  := op->>'id';
begin
  if p_scope is not null then
    perform terra_private.check_scope(op, p_scope);
  end if;

  case t
    when 'trip.put'   then perform terra_private.upsert_row('trips', v);
    when 'member.put' then perform terra_private.upsert_row('members', v);
    when 'txn.put'    then perform terra_private.upsert_row('transactions', v);
    when 'audit.put'  then perform terra_private.upsert_row('audit', v);
    when 'place.put'  then perform terra_private.upsert_row('places', v);
    when 'cover.put', 'receipt.put' then
      if length(coalesce(v->>'photo', '')) > 700000 then
        raise exception 'photo too large';
      end if;
      perform terra_private.upsert_row(
        case t when 'cover.put' then 'trip_covers' else 'receipts' end, v);
    when 'member.del'  then delete from public.members      where id = rid;
    when 'txn.del'     then
      delete from public.transactions where id = rid;
      delete from public.receipts     where id = rid;
    when 'place.del'   then delete from public.places       where id = rid;
    when 'cover.del'   then delete from public.trip_covers  where id = rid;
    when 'receipt.del' then delete from public.receipts     where id = rid;
    when 'trip.del' then
      delete from public.audit        where trip_id = rid;
      delete from public.transactions where trip_id = rid;
      delete from public.members      where trip_id = rid;
      delete from public.places       where trip_id = rid;
      delete from public.receipts     where trip_id = rid;
      delete from public.trip_covers  where id = rid;
      delete from public.trips        where id = rid;
      delete from terra_private.trip_secrets where trip_id = rid;
      delete from terra_private.sessions     where trip_id = rid;
    when 'all.clear' then
      -- explicit WHERE: Supabase runs pg-safeupdate on API sessions
      delete from public.audit        where id is not null;
      delete from public.transactions where id is not null;
      delete from public.members      where id is not null;
      delete from public.places       where id is not null;
      delete from public.receipts     where id is not null;
      delete from public.trip_covers  where id is not null;
      delete from public.trips        where id is not null;
      delete from terra_private.trip_secrets where trip_id is not null;
      delete from terra_private.sessions     where trip_id is not null;
    else
      raise exception 'unknown op: %', t;
  end case;
end $$;

revoke all on all functions in schema terra_private from public, anon, authenticated;

-- ============================================================
-- Public API — the only way in for writes
-- ============================================================

/**
 * Password → session token. The organiser password unlocks every tour;
 * with p_trip, that tour's own co-organiser password unlocks just it.
 * Returns { ok, token, scope: '*' | trip id } or { ok:false, error }.
 */
drop function if exists public.terra_login(text, text);
create or replace function public.terra_login(
  p_password text, p_device text default '', p_trip text default null
)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare
  h     text;
  th    text;
  fails int;
begin
  select pass_hash into h from terra_private.secret where id = 1;
  if p_trip is not null then
    select pass_hash into th from terra_private.trip_secrets where trip_id = p_trip;
  end if;
  if h is null and th is null then
    return jsonb_build_object('ok', false, 'error', 'no-password');
  end if;

  -- global throttle: 20 wrong guesses per 15 minutes, then wait
  select count(*) into fails from terra_private.login_fails
   where at > now() - interval '15 minutes';
  if fails >= 20 then
    return jsonb_build_object('ok', false, 'error', 'too-many');
  end if;

  if h is not null and extensions.crypt(coalesce(p_password, ''), h) = h then
    return jsonb_build_object('ok', true, 'scope', '*',
      'token', terra_private.new_session(p_device, null));
  end if;
  if th is not null and extensions.crypt(coalesce(p_password, ''), th) = th then
    return jsonb_build_object('ok', true, 'scope', p_trip,
      'token', terra_private.new_session(p_device, p_trip));
  end if;

  insert into terra_private.login_fails default values;
  delete from terra_private.login_fails where at < now() - interval '1 day';
  return jsonb_build_object('ok', false, 'error', 'wrong');
end $$;

/** Is this token still good? Also keeps it alive. */
create or replace function public.terra_session(p_token text)
returns boolean language plpgsql security definer set search_path = '' as $$
begin
  update terra_private.sessions set last_used = now()
   where token_hash = terra_private.hash_token(p_token)
     and last_used > now() - interval '120 days';
  return found;
end $$;

/** What this token may edit: { ok, scope: '*' | trip id }. */
create or replace function public.terra_whoami(p_token text)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare s text := terra_private.session_scope(p_token);
begin
  if s is null then
    return jsonb_build_object('ok', false);
  end if;
  update terra_private.sessions set last_used = now()
   where token_hash = terra_private.hash_token(p_token);
  return jsonb_build_object('ok', true, 'scope', s);
end $$;

/** Sign this device out — or, organiser only, every device. */
create or replace function public.terra_logout(p_token text, p_all boolean default false)
returns void language plpgsql security definer set search_path = '' as $$
begin
  if p_all and terra_private.session_scope(p_token) = '*' then
    delete from terra_private.sessions where token_hash is not null;
  else
    delete from terra_private.sessions
     where token_hash = terra_private.hash_token(p_token);
  end if;
end $$;

/** Organiser only; needs the current password too. Signs out every
 *  other device; returns a fresh token for this one. */
create or replace function public.terra_change_password(
  p_token text, p_old text, p_new text, p_device text default ''
)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare h text;
begin
  if terra_private.session_scope(p_token) is distinct from '*' then
    return jsonb_build_object('ok', false, 'error', 'locked');
  end if;
  select pass_hash into h from terra_private.secret where id = 1;
  if h is null or extensions.crypt(coalesce(p_old, ''), h) <> h then
    insert into terra_private.login_fails default values;
    return jsonb_build_object('ok', false, 'error', 'wrong');
  end if;
  if coalesce(length(p_new), 0) < 6 then
    return jsonb_build_object('ok', false, 'error', 'short');
  end if;
  perform terra_private.set_password(p_new);
  return jsonb_build_object('ok', true, 'scope', '*',
    'token', terra_private.new_session(p_device, null));
end $$;

/** Organiser only: give a tour its own co-organiser password, change
 *  it, or (empty) remove it. Old co-organiser sessions are signed out. */
create or replace function public.terra_set_trip_password(
  p_token text, p_trip text, p_new text
)
returns jsonb language plpgsql security definer set search_path = '' as $$
begin
  if terra_private.session_scope(p_token) is distinct from '*' then
    return jsonb_build_object('ok', false, 'error', 'locked');
  end if;
  if not exists (select 1 from public.trips where id = p_trip) then
    return jsonb_build_object('ok', false, 'error', 'unknown');
  end if;
  if coalesce(p_new, '') <> '' and length(p_new) < 6 then
    return jsonb_build_object('ok', false, 'error', 'short');
  end if;
  delete from terra_private.sessions where trip_id = p_trip;
  if coalesce(p_new, '') = '' then
    delete from terra_private.trip_secrets where trip_id = p_trip;
    return jsonb_build_object('ok', true, 'locked', false);
  end if;
  insert into terra_private.trip_secrets (trip_id, pass_hash, updated_at)
  values (p_trip, extensions.crypt(p_new, extensions.gen_salt('bf', 10)), now())
  on conflict (trip_id) do update
    set pass_hash = excluded.pass_hash, updated_at = now();
  return jsonb_build_object('ok', true, 'locked', true);
end $$;

/** Organiser only: which tours have their own password. */
create or replace function public.terra_trip_locks(p_token text)
returns jsonb language plpgsql security definer set search_path = '' as $$
begin
  if terra_private.session_scope(p_token) is distinct from '*' then
    return jsonb_build_object('ok', false, 'error', 'locked');
  end if;
  return jsonb_build_object('ok', true, 'trips',
    coalesce((select jsonb_agg(trip_id) from terra_private.trip_secrets), '[]'::jsonb));
end $$;

/**
 * Apply a batch of queued writes in order. Each op runs in its own
 * sub-transaction: the first one that fails stops the batch, and
 * everything before it stays applied. Returns
 *   { ok:true,  applied:n }
 *   { ok:false, auth:false, applied:0, error:'locked' }   — bad token
 *   { ok:false, auth:true,  applied:n, error:'…' }        — op n rejected
 */
create or replace function public.terra_apply(p_token text, p_ops jsonb)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare
  scope text := terra_private.session_scope(p_token);
  op    jsonb;
  n     int := 0;
begin
  if scope is null then
    return jsonb_build_object('ok', false, 'auth', false, 'applied', 0, 'error', 'locked');
  end if;
  update terra_private.sessions set last_used = now()
   where token_hash = terra_private.hash_token(p_token);

  for op in select value from jsonb_array_elements(coalesce(p_ops, '[]'::jsonb)) loop
    begin
      perform terra_private.apply_op(op, case when scope = '*' then null else scope end);
    exception when others then
      return jsonb_build_object('ok', false, 'auth', true, 'applied', n, 'error', sqlerrm);
    end;
    n := n + 1;
  end loop;

  return jsonb_build_object('ok', true, 'applied', n);
end $$;

revoke all on function public.terra_login(text, text, text)                   from public;
revoke all on function public.terra_session(text)                             from public;
revoke all on function public.terra_whoami(text)                              from public;
revoke all on function public.terra_logout(text, boolean)                     from public;
revoke all on function public.terra_change_password(text, text, text, text)   from public;
revoke all on function public.terra_set_trip_password(text, text, text)       from public;
revoke all on function public.terra_trip_locks(text)                          from public;
revoke all on function public.terra_apply(text, jsonb)                        from public;
grant execute on function public.terra_login(text, text, text)                 to anon, authenticated;
grant execute on function public.terra_session(text)                           to anon, authenticated;
grant execute on function public.terra_whoami(text)                            to anon, authenticated;
grant execute on function public.terra_logout(text, boolean)                   to anon, authenticated;
grant execute on function public.terra_change_password(text, text, text, text) to anon, authenticated;
grant execute on function public.terra_set_trip_password(text, text, text)     to anon, authenticated;
grant execute on function public.terra_trip_locks(text)                        to anon, authenticated;
grant execute on function public.terra_apply(text, jsonb)                      to anon, authenticated;

-- ============================================================
-- Row Level Security — read for everyone, write for no one
-- (writes arrive through terra_apply, which runs as the owner)
-- ============================================================
do $$
declare t text;
begin
  foreach t in array array['trips', 'members', 'transactions', 'audit', 'places',
                           'trip_covers', 'receipts', 'app_settings'] loop
    if to_regclass('public.' || t) is null then
      continue;
    end if;
    execute format('alter table public.%I enable row level security', t);
    execute format('drop policy if exists "public all" on public.%I', t);
    execute format('drop policy if exists "public read" on public.%I', t);
    execute format(
      'create policy "public read" on public.%I for select to anon, authenticated using (true)',
      t
    );
    execute format('revoke insert, update, delete, truncate on public.%I from anon, authenticated', t);
    execute format('grant select on public.%I to anon, authenticated', t);
  end loop;
end $$;

-- realtime for the photo tables (safe to skip)
do $$
begin
  alter publication supabase_realtime add table public.trip_covers;
exception when others then null;
end $$;
do $$
begin
  alter publication supabase_realtime add table public.receipts;
exception when others then null;
end $$;
