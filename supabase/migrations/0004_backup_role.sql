-- Nightly database backup (TR6). Run once in Supabase → SQL Editor, after
-- replacing <BACKUP_DB_PASSWORD> below with a new random password used for
-- nothing else (`openssl rand -hex 24`). Steps: docs/plan/backups.md.
--
-- The login the GitHub backup workflow (.github/workflows/db-backup.yml)
-- connects as. It can read everything and write nothing:
-- - `bypassrls`: pg_dump reads every row of tables under row-level security;
-- - `pg_read_all_data`: it can read the auth schema, which the postgres role
--   can no longer read in full since Supabase restricted it in April 2025;
-- - read-only sessions by default.
-- This is Supabase's own pattern for running pg_dump as a custom role.
--
-- Running it again sets the new password: change the GitHub secret too.

do $$
begin
  if not exists (select 1 from pg_roles where rolname = 'backup_reader') then
    create role backup_reader login bypassrls;
  end if;
end
$$;

alter role backup_reader password '<BACKUP_DB_PASSWORD>';
grant pg_read_all_data to backup_reader;
alter role backup_reader set default_transaction_read_only = on;
