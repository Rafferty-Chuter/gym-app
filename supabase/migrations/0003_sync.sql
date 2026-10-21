-- Accounts and sync (S1, S3, PR4). Run once in Supabase → SQL Editor, after
-- turning on Email sign-in (Authentication → Providers → Email).
--
-- One row per synced record of the app, keyed by the signed-in user, the
-- storage key the record lives under (`k`, e.g. "physique.v1.weighIns")
-- and its id ("" for a key synced whole, such as the goal). Reads stay on
-- the device; this is the copy that follows the account to another device.
--
-- Row-level security: a signed-in user reads and writes their own rows
-- only. There is no delete policy: deletes are soft (`deleted = true`) so
-- other devices learn of them. Writes go through `sync_push`, which keeps
-- a row only when it is as new as or newer than the stored one
-- (`updated_at`, the device's time of the change): last write wins.

create table if not exists public.sync_records (
  user_id uuid not null default auth.uid() references auth.users (id) on delete cascade,
  k text not null check (char_length(k) between 1 and 80),
  id text not null check (char_length(id) <= 200),
  data jsonb,
  deleted boolean not null default false,
  updated_at timestamptz not null,
  server_at timestamptz not null default now(),
  primary key (user_id, k, id)
);

create index if not exists sync_records_user_server_at_idx on public.sync_records (user_id, server_at);

alter table public.sync_records enable row level security;

drop policy if exists "sync_records: read own" on public.sync_records;
create policy "sync_records: read own" on public.sync_records
  for select to authenticated using (user_id = auth.uid());

drop policy if exists "sync_records: insert own" on public.sync_records;
create policy "sync_records: insert own" on public.sync_records
  for insert to authenticated with check (user_id = auth.uid());

drop policy if exists "sync_records: update own" on public.sync_records;
create policy "sync_records: update own" on public.sync_records
  for update to authenticated using (user_id = auth.uid()) with check (user_id = auth.uid());

revoke all on public.sync_records from anon;
grant select, insert, update on public.sync_records to authenticated;

-- Upsert a batch of the signed-in user's rows, newest write wins. Runs as
-- the caller, so the policies above apply. Returns the rows written.
create or replace function public.sync_push(rows jsonb)
returns integer
language plpgsql
security invoker
set search_path = public
as $$
declare
  n integer;
begin
  if auth.uid() is null then
    raise exception 'not signed in';
  end if;
  if jsonb_typeof(rows) <> 'array' or jsonb_array_length(rows) > 500 then
    raise exception 'rows must be an array of at most 500';
  end if;
  insert into public.sync_records as r (user_id, k, id, data, deleted, updated_at, server_at)
  select auth.uid(), x.k, x.id, x.data, coalesce(x.deleted, false), x.updated_at, clock_timestamp()
  from jsonb_to_recordset(rows) as x (k text, id text, data jsonb, deleted boolean, updated_at timestamptz)
  on conflict (user_id, k, id) do update
    set data = excluded.data,
        deleted = excluded.deleted,
        updated_at = excluded.updated_at,
        server_at = clock_timestamp()
    where excluded.updated_at >= r.updated_at;
  get diagnostics n = row_count;
  return n;
end;
$$;

revoke execute on function public.sync_push (jsonb) from public, anon;
grant execute on function public.sync_push (jsonb) to authenticated;
