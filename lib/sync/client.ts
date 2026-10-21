"use client";

import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import { ACCOUNTS_ENABLED, SYNC_ANON_KEY, SYNC_URL } from "@/lib/sync/config";

/** Where the account's session is kept on the device (not in backups). */
export const AUTH_STORAGE_KEY = "sync.v1.auth";

let client: SupabaseClient | null = null;

/** The browser's Supabase client, made once; null when accounts are off. Sessions refresh themselves and persist on the device. */
export function supabase(): SupabaseClient | null {
  if (!ACCOUNTS_ENABLED || typeof window === "undefined") return null;
  if (!client) {
    client = createClient(SYNC_URL, SYNC_ANON_KEY, {
      auth: { persistSession: true, autoRefreshToken: true, detectSessionInUrl: false, storageKey: AUTH_STORAGE_KEY },
    });
  }
  return client;
}
