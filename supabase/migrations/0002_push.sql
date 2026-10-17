-- Reminders on gaps only (06-execution Sprint 0, G5). Run once in Supabase → SQL Editor,
-- after replacing <CRON_SECRET> below with the value set on the Vercel project.
--
-- One row per phone, keyed by the hash of its reminder token. It holds the push
-- subscription, the chosen time, the time zone and a summary of which recent days
-- have food, a weigh-in or a night (dates only, never the values). Only the server
-- reads or writes it; row-level security is on with no policies.

create table if not exists public.push_devices (
  device_hash text primary key,
  subscription jsonb not null,
  tz text not null default 'UTC',
  reminder_hhmm text not null default '09:00',
  summary jsonb,
  summary_at timestamptz,
  health_hash text,
  last_run_day date,
  failures integer not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table public.push_devices enable row level security;

-- The hourly trigger. Vercel's free plan runs its own cron once a day at most, so
-- Postgres calls the route instead, five minutes past every hour. The route decides
-- per phone whether its chosen time has just passed, and sends only on a gap.
create extension if not exists pg_cron;
create extension if not exists pg_net;

select cron.unschedule('push-reminders-hourly')
where exists (select 1 from cron.job where jobname = 'push-reminders-hourly');

select cron.schedule(
  'push-reminders-hourly',
  '5 * * * *',
  $$
  select net.http_get(
    url := 'https://gym-app-eta-nine.vercel.app/api/push/run',
    headers := jsonb_build_object('Authorization', 'Bearer <CRON_SECRET>'),
    timeout_milliseconds := 30000
  );
  $$
);
