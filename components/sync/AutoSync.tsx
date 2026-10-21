"use client";

import { useEffect } from "react";
import { ACCOUNTS_ENABLED } from "@/lib/sync/config";
import { supabase } from "@/lib/sync/client";
import { runSync } from "@/lib/sync/run";
import { STORAGE_CHANGED_EVENT } from "@/lib/storage/kv";

/** Seconds after a change on the device before it is synced, so a burst of edits goes up once. OURS. */
const AFTER_CHANGE_S = 15;
/** Seconds between syncs while the app is on screen, which also catches writers that don't announce their changes. OURS. */
const WHILE_OPEN_S = 120;

/**
 * Keeps the account in step (PR4): a sync on open, on coming back to the
 * screen or back online, on signing in, shortly after a change, and every
 * couple of minutes while open. Renders nothing; does nothing when
 * accounts are off or nobody is signed in.
 */
export default function AutoSync() {
  useEffect(() => {
    if (!ACCOUNTS_ENABLED) return;
    const sb = supabase();
    let changeTimer: number | null = null;
    const visible = () => document.visibilityState === "visible";
    const sync = () => {
      if (visible()) void runSync();
    };
    const onChange = (e: Event) => {
      const key = (e as CustomEvent<{ key?: string }>).detail?.key ?? "";
      if (key.startsWith("sync.")) return;
      if (changeTimer) window.clearTimeout(changeTimer);
      changeTimer = window.setTimeout(sync, AFTER_CHANGE_S * 1000);
    };
    sync();
    const tick = window.setInterval(sync, WHILE_OPEN_S * 1000);
    document.addEventListener("visibilitychange", sync);
    window.addEventListener("online", sync);
    window.addEventListener(STORAGE_CHANGED_EVENT, onChange);
    const sub = sb?.auth.onAuthStateChange((event) => {
      if (event === "SIGNED_IN") void runSync();
    });
    return () => {
      window.clearInterval(tick);
      if (changeTimer) window.clearTimeout(changeTimer);
      document.removeEventListener("visibilitychange", sync);
      window.removeEventListener("online", sync);
      window.removeEventListener(STORAGE_CHANGED_EVENT, onChange);
      sub?.data.subscription.unsubscribe();
    };
  }, []);
  return null;
}
