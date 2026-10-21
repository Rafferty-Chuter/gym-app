# Database backups

Supabase Free keeps no backups (`research/D-architecture-tooling.md` §3.1), so a GitHub workflow takes one every night: `.github/workflows/db-backup.yml`, at 03:17 UTC and whenever it is run by hand. It runs `pg_dump` against the Supabase database, encrypts the dump with a passphrase and keeps the encrypted file as a workflow artifact for 30 days. Built in TR6 (`07-tester-ready.md`).

**This repo is public.** Anyone signed in to GitHub can read the run logs and download the backup files. So the logs show only versions, table names and a file size, never a row, and the file is uploaded only after encryption. The passphrase is the only thing between a download and everyone's health data: make it long and random, and keep it in your password manager.

## What a backup holds

- **`public` schema**: every app table (`sync_records`, `health_devices`, `health_samples`, `push_devices`), with their policies and the `sync_push` function.
- **`auth` schema**: accounts (`auth.users`, `auth.identities`). The rows of sign-in sessions, refresh tokens, one-time codes and the auth audit log are left out, though their tables are kept. After a restore people sign in again, and no backup holds a live token or an IP address.
- **Not included**: the `cron` schema (migration 0002 recreates the reminder job, and the job holds `CRON_SECRET`), Storage (unused), Vault and Supabase's own internals.

The file is a Postgres custom-format dump (compressed), encrypted with GnuPG (AES-256, passphrase). Each run decrypts it again before uploading and reads it through to the end, so a bad passphrase or a broken file fails the run rather than the restore.

## Set up (founder, once, about 10 minutes)

1. **A read-only database login.** In a terminal, make a password: `openssl rand -hex 24`. Open `supabase/migrations/0004_backup_role.sql`, put the password where it says `<BACKUP_DB_PASSWORD>`, and run the file in Supabase → SQL Editor. This creates `backup_reader`, which can read every table and write nothing. It is Supabase's own pattern; the `postgres` login can no longer read all of `auth`.
2. **The connection string.** In Supabase, press **Connect** and copy the **Session pooler** string. Change the user from `postgres.<project-ref>` to `backup_reader.<project-ref>` and put in the password from step 1:
   ```
   postgresql://backup_reader.<project-ref>:<password>@aws-0-eu-central-1.pooler.supabase.com:5432/postgres
   ```
   (Keep the host your project shows.) Don't use the Direct connection: it is IPv6 only and GitHub's runners can't reach it. Don't use the Transaction pooler (port 6543) either: `pg_dump` can't run there.
3. **The passphrase.** Make one with `openssl rand -base64 32` and **save it in your password manager first**. Without it every backup is unreadable, and GitHub never shows a secret again once it is saved. The workflow refuses passphrases under 24 characters.
4. **GitHub secrets.** In the repo, go to Settings → Secrets and variables → Actions → New repository secret. Add `SUPABASE_DB_URL` (the string from step 2) and `BACKUP_PASSPHRASE` (step 3).
5. **The first run.** GitHub runs scheduled and hand-started workflows only from the default branch. So once this branch has been merged into `main`, go to Actions → **Database backup** → Run workflow (branch `main`). It takes about two minutes. A green run shows the file under **Artifacts**, and the run summary lists the tables it holds. From then on it runs every night by itself.
6. **Try one restore** with that first file (below, up to "Open it on your Mac"). It is the only real test of the passphrase and of Supabase's own `auth` tables.

## Keeping an eye on it

- A failed run shows a red cross under Actions → Database backup. GitHub normally emails the account that last changed the schedule. Until you have had one of those emails, look at the list now and then.
- In a public repo, GitHub turns scheduled workflows off after 60 days without a commit. If that happens, Actions shows a banner; press Enable.
- Public repos get artifact storage free. If the repo goes private, the Free plan has 500 MB of storage and 2,000 minutes a month. A run takes a minute or two, and a backup is a few MB at most for now.
- **Changing the passphrase:** update the secret. Older files still need the old passphrase until they expire (30 days), so keep both in the password manager until then.
- **Changing the database password:** run `alter role backup_reader password '<new>';` in the SQL Editor, then update `SUPABASE_DB_URL`.
- When the project moves to Supabase Pro (the week testers arrive), Supabase keeps 7 days of daily backups itself. Keep this workflow too: it is the copy that lives outside Supabase.

## Restore

You need GnuPG and Postgres on the Mac: `brew install gnupg` once. The run log prints the server's version (`Server: Postgres 17`), and your Postgres must be that major version or newer (you have `postgresql@17`).

Work in a folder outside the repo. A decrypted backup is plain health data: never commit it, and delete it afterwards.

### 1. Download and decrypt

Go to Actions → Database backup, open a run, and download the `gym-app-db-….dump.gpg` file under **Artifacts** (if it arrives as a `.zip`, unzip it first). Then:

```bash
mkdir -p ~/gymapp-restore && cd ~/gymapp-restore
mv ~/Downloads/gym-app-db-*.dump.gpg .
gpg --output backup.dump --decrypt gym-app-db-*.dump.gpg
```

It asks for the passphrase. To see what is inside without restoring anything: `pg_restore --list backup.dump`.

### 2. Open it on your Mac

This starts a throwaway Postgres in the folder, on its own port, without touching the Postgres you already run:

```bash
initdb -D pgdata -U postgres -A trust > /dev/null
pg_ctl -D pgdata -o "-p 54329 -c listen_addresses=localhost" -l pg.log start
export PGHOST=localhost PGPORT=54329 PGUSER=postgres
createdb restore
psql -d restore -q -v ON_ERROR_STOP=1 <<'SQL'
create role anon nologin;
create role authenticated nologin;
create role service_role nologin;
create schema extensions;
create extension pgcrypto schema extensions;
create extension "uuid-ossp" schema extensions;
drop schema public;
SQL
pg_restore -d restore --no-owner --no-privileges backup.dump
```

The roles and the `extensions` schema stand in for what every Supabase project has. `drop schema public` lets the backup bring its own `public` schema back. `pg_restore` should finish silently. If it reports a few errors about a role, schema or extension that only Supabase has, the tables are still there; check with the queries below.

If `pg_ctl` fails with "postmaster became multithreaded during startup", run `export LC_ALL=en_GB.UTF-8` and start it again.

Some useful reads:

```bash
psql -d restore -c "select id, email, created_at from auth.users order by created_at"
psql -d restore -c "select k, count(*) from sync_records where not deleted group by k order by k"
psql -d restore -c "select k, id, updated_at, data from sync_records where user_id = '<user-id>' and not deleted order by k, id"
psql -d restore -c "\copy (select * from sync_records where user_id = '<user-id>') to 'rows.csv' csv header"
```

### 3a. Put someone's rows back into the live project

For example, after a sync bug lost or overwrote one person's records. After step 2, export the rows you want (the `\copy … to 'rows.csv'` line above; the `select` picks which rows). Then load them into the live project with the **postgres** Session pooler string (`backup_reader` can't write):

```bash
psql "<postgres session pooler string>" -v ON_ERROR_STOP=1 <<'SQL'
begin;
create temp table restored (like public.sync_records) on commit drop;
\copy restored from 'rows.csv' csv header
insert into public.sync_records (user_id, k, id, data, deleted, updated_at, server_at)
select user_id, k, id, data, deleted, now(), now() from restored
on conflict (user_id, k, id) do update
  set data = excluded.data, deleted = excluded.deleted, updated_at = now(), server_at = now();
commit;
SQL
```

The restored rows are written as the newest: `updated_at = now()` wins over older edits under last-write-wins, and `server_at = now()` makes every device of that person pull them on its next sync. The person's account must still exist.

### 3b. Rebuild in a new Supabase project

Use this if the project itself is lost.

1. Create a project (the current one is in Frankfurt, `eu-central-1`). Run migrations `0001`, `0003`, `0002` (with `CRON_SECRET`) and `0004` (with a new backup password) in the SQL Editor. Turn on Email sign-in with the 6-digit code template, as in FT4 (`07-tester-ready.md`).
2. Load the accounts first, then the app's rows, with the new project's **postgres** Session pooler string. This follows Supabase's own restore order (`session_replication_role = replica`):
   ```bash
   pg_restore --data-only --no-owner --no-privileges -n auth -t users -t identities -f auth-rows.sql backup.dump
   pg_restore --data-only --no-owner --no-privileges -n public -f app-rows.sql backup.dump
   psql "<new project's postgres session pooler string>" --single-transaction -v ON_ERROR_STOP=1 \
     -c "set session_replication_role = replica" -f auth-rows.sql -f app-rows.sql
   rm auth-rows.sql app-rows.sql
   ```
   If Supabase refuses the `auth` rows, stop and ask Supabase support: every record points at its account, so the app's rows can't go in without them.
3. On Vercel, point the app at the new project: `NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_ANON_KEY`, `SUPABASE_URL` and the service-role key. Redeploy, then update `SUPABASE_DB_URL` in GitHub. People sign in again with their email; their data is there.

### 4. Clean up

When you are done (after 3a or 3b if you needed them), stop the throwaway Postgres and delete everything, the plain copy included:

```bash
pg_ctl -D ~/gymapp-restore/pgdata stop
cd ~ && rm -rf ~/gymapp-restore
```

## How this was tested (21 Oct 2026)

There was no real database to test against: the founder adds the secrets, so the first real run is theirs. Instead, on a local Postgres 17 (Homebrew):

- **Source.** A database shaped like a Supabase project: its roles; an `auth` schema owned by another role, with row-level security on and a generated column like Supabase's `auth.identities.email`; a stand-in for `pg_cron`. Migrations 0001 to 0004 were run unchanged, apart from the two placeholders and the `create extension` lines in 0002. Made-up accounts, records, health samples, sessions and tokens were added.
- **The backup.** The workflow's own steps, read from the YAML, were run as `backup_reader`: 8 tables, encrypted, read back in full. The run's output and summary contained none of the made-up values and not the passphrase. The encrypted file contained no readable text. The dump held no `cron` objects, no `CRON_SECRET`, and no session, token or audit-log rows. A wrong passphrase failed. Each secret check failed with its own message (missing, short passphrase, port 6543). A login without `bypassrls` failed with the row-level security error, and `backup_reader` could not delete.
- **Restore.** Step 2, in a brand-new local cluster: `pg_restore` exited 0, and the accounts, every record (deleted ones included), the policies and `sync_push` came back. Step 3b, into a fresh copy of the migrations: row counts matched the source exactly. Step 3a: a lost row came back, an overwritten one was reverted, and both carried a fresh `server_at`.

Not tried: a run on GitHub (it needs the secrets), and steps 3a and 3b against a real Supabase project.
