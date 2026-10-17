-- Health ingest (06-execution Sprint 0, S5). Run once in Supabase → SQL Editor.
--
-- Rows are keyed by a device hash: the SHA-256 of the token the user pastes
-- into Health Auto Export. The raw token never reaches the database. Only
-- the server (service role) reads or writes these tables; row-level
-- security is on with no policies, so the publishable key sees nothing.

create table if not exists public.health_devices (
  device_hash text primary key,
  created_at timestamptz not null default now(),
  last_seen_at timestamptz,
  last_payload_at timestamptz,
  samples integer not null default 0
);

create table if not exists public.health_samples (
  device_hash text not null references public.health_devices (device_hash) on delete cascade,
  metric text not null,
  day date not null,
  value jsonb not null,
  source text,
  received_at timestamptz not null default now(),
  primary key (device_hash, metric, day)
);

create index if not exists health_samples_received_idx on public.health_samples (device_hash, received_at);

alter table public.health_devices enable row level security;
alter table public.health_samples enable row level security;
