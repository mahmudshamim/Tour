-- ============================================================
-- TerraExplore — edit lock + per-tour details
-- Run in Supabase → SQL Editor → New query → Run.
-- Safe to re-run: every step is idempotent.
--
-- Needs the multi-trip tables (supabase-trips.sql) to exist first.
--
-- After this runs:
--   • anyone with the link can VIEW every tour (read-only)
--   • nobody can write straight to the tables any more — every write
--     goes through public.terra_apply(), which needs a session token
--   • a token comes from public.terra_login(password); the password is
--     stored only as a bcrypt hash in a private schema the API can't see
--
-- THEN set the edit password (SQL Editor, once — change it the same way):
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

-- ---- when each expense was actually spent (editable; defaults to when
-- it was logged, so rows from before this column keep their date) ----
alter table public.transactions add column if not exists spent_at bigint;
update public.transactions set spent_at = created_at where spent_at is null;

-- ---- a cover photo per tour (small JPEG, shrunk on the phone first).
-- Its own table, so the tours list — polled often — stays light. ----
create table if not exists public.trip_covers (
  id         text primary key,   -- = trips.id
  photo      text not null,      -- data:image/jpeg;base64,…
  updated_at bigint
);

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

-- tokens are stored hashed: a leaked row can't be replayed
create table if not exists terra_private.sessions (
  token_hash text primary key,
  device     text,
  created_at timestamptz not null default now(),
  last_used  timestamptz not null default now()
);

create table if not exists terra_private.login_fails (
  at timestamptz not null default now()
);

revoke all on all tables in schema terra_private from public, anon, authenticated;

create or replace function terra_private.hash_token(p_token text)
returns text language sql immutable set search_path = '' as $$
  select encode(extensions.digest(coalesce(p_token, ''), 'sha256'), 'hex');
$$;

create or replace function terra_private.session_ok(p_token text)
returns boolean language sql stable set search_path = '' as $$
  select exists (
    select 1 from terra_private.sessions
     where token_hash = terra_private.hash_token(p_token)
       and last_used > now() - interval '120 days'
  );
$$;

create or replace function terra_private.new_session(p_device text)
returns text language plpgsql set search_path = '' as $$
declare tok text := encode(extensions.gen_random_bytes(32), 'hex');
begin
  insert into terra_private.sessions (token_hash, device)
  values (terra_private.hash_token(tok), left(coalesce(p_device, ''), 120));
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
  if p_table not in ('trips', 'members', 'transactions', 'audit', 'places', 'trip_covers') then
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

create or replace function terra_private.apply_op(op jsonb)
returns void language plpgsql set search_path = '' as $$
declare
  t   text  := op->>'t';
  v   jsonb := op->'v';
  rid text  := op->>'id';
begin
  case t
    when 'trip.put'   then perform terra_private.upsert_row('trips', v);
    when 'member.put' then perform terra_private.upsert_row('members', v);
    when 'txn.put'    then perform terra_private.upsert_row('transactions', v);
    when 'audit.put'  then perform terra_private.upsert_row('audit', v);
    when 'place.put'  then perform terra_private.upsert_row('places', v);
    when 'cover.put'  then
      if length(coalesce(v->>'photo', '')) > 700000 then
        raise exception 'cover photo too large';
      end if;
      perform terra_private.upsert_row('trip_covers', v);
    when 'cover.del'  then delete from public.trip_covers where id = rid;
    when 'member.del' then delete from public.members      where id = rid;
    when 'txn.del'    then delete from public.transactions where id = rid;
    when 'place.del'  then delete from public.places       where id = rid;
    when 'trip.del' then
      delete from public.audit        where trip_id = rid;
      delete from public.transactions where trip_id = rid;
      delete from public.members      where trip_id = rid;
      delete from public.places       where trip_id = rid;
      delete from public.trip_covers  where id = rid;
      delete from public.trips        where id = rid;
    when 'all.clear' then
      -- explicit WHERE: Supabase runs pg-safeupdate on API sessions
      delete from public.audit        where id is not null;
      delete from public.transactions where id is not null;
      delete from public.members      where id is not null;
      delete from public.places       where id is not null;
      delete from public.trip_covers  where id is not null;
      delete from public.trips        where id is not null;
    else
      raise exception 'unknown op: %', t;
  end case;
end $$;

revoke all on all functions in schema terra_private from public, anon, authenticated;

-- ============================================================
-- Public API — the only way in for writes
-- ============================================================

/** Password → session token. Returns { ok, token } or { ok:false, error }. */
create or replace function public.terra_login(p_password text, p_device text default '')
returns jsonb language plpgsql security definer set search_path = '' as $$
declare
  h     text;
  fails int;
begin
  select pass_hash into h from terra_private.secret where id = 1;
  if h is null then
    return jsonb_build_object('ok', false, 'error', 'no-password');
  end if;

  -- global throttle: 20 wrong guesses per 15 minutes, then wait
  select count(*) into fails from terra_private.login_fails
   where at > now() - interval '15 minutes';
  if fails >= 20 then
    return jsonb_build_object('ok', false, 'error', 'too-many');
  end if;

  if extensions.crypt(coalesce(p_password, ''), h) <> h then
    insert into terra_private.login_fails default values;
    delete from terra_private.login_fails where at < now() - interval '1 day';
    return jsonb_build_object('ok', false, 'error', 'wrong');
  end if;

  return jsonb_build_object('ok', true, 'token', terra_private.new_session(p_device));
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

/** Sign this device out — or, with p_all, every device. */
create or replace function public.terra_logout(p_token text, p_all boolean default false)
returns void language plpgsql security definer set search_path = '' as $$
begin
  if p_all and terra_private.session_ok(p_token) then
    delete from terra_private.sessions where token_hash is not null;
  else
    delete from terra_private.sessions
     where token_hash = terra_private.hash_token(p_token);
  end if;
end $$;

/** Needs a live session AND the current password. Signs out every
 *  other device; returns a fresh token for this one. */
create or replace function public.terra_change_password(
  p_token text, p_old text, p_new text, p_device text default ''
)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare h text;
begin
  if not terra_private.session_ok(p_token) then
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
  return jsonb_build_object('ok', true, 'token', terra_private.new_session(p_device));
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
  op jsonb;
  n  int := 0;
begin
  if not terra_private.session_ok(p_token) then
    return jsonb_build_object('ok', false, 'auth', false, 'applied', 0, 'error', 'locked');
  end if;
  update terra_private.sessions set last_used = now()
   where token_hash = terra_private.hash_token(p_token);

  for op in select value from jsonb_array_elements(coalesce(p_ops, '[]'::jsonb)) loop
    begin
      perform terra_private.apply_op(op);
    exception when others then
      return jsonb_build_object('ok', false, 'auth', true, 'applied', n, 'error', sqlerrm);
    end;
    n := n + 1;
  end loop;

  return jsonb_build_object('ok', true, 'applied', n);
end $$;

revoke all on function public.terra_login(text, text)                         from public;
revoke all on function public.terra_session(text)                             from public;
revoke all on function public.terra_logout(text, boolean)                     from public;
revoke all on function public.terra_change_password(text, text, text, text)   from public;
revoke all on function public.terra_apply(text, jsonb)                        from public;
grant execute on function public.terra_login(text, text)                      to anon, authenticated;
grant execute on function public.terra_session(text)                          to anon, authenticated;
grant execute on function public.terra_logout(text, boolean)                  to anon, authenticated;
grant execute on function public.terra_change_password(text, text, text, text) to anon, authenticated;
grant execute on function public.terra_apply(text, jsonb)                     to anon, authenticated;

-- ============================================================
-- Row Level Security — read for everyone, write for no one
-- (writes arrive through terra_apply, which runs as the owner)
-- ============================================================
do $$
declare t text;
begin
  foreach t in array array['trips', 'members', 'transactions', 'audit', 'places', 'trip_covers', 'app_settings'] loop
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

-- realtime for cover changes (safe to skip)
do $$
begin
  alter publication supabase_realtime add table public.trip_covers;
exception when others then null;
end $$;
