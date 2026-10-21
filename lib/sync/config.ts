/**
 * Accounts and sync are on only when the deployment has a Supabase project
 * for them (PR4): the project URL and its publishable (anon) key, both
 * public by design (row-level security guards the data). Without them the
 * app is exactly as before: no account row, no sync, everything on the
 * device.
 */
export const SYNC_URL = process.env.NEXT_PUBLIC_SUPABASE_URL ?? "";
export const SYNC_ANON_KEY = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY ?? "";

export const ACCOUNTS_ENABLED = SYNC_URL.length > 0 && SYNC_ANON_KEY.length > 0;
