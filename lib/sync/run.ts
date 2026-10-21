"use client";

import { STORAGE_KEYS } from "@/lib/storage/keys";
import { kvGet, kvGetRaw, kvRemove, kvSet, kvSetRaw } from "@/lib/storage/kv";
import { AUTH_STORAGE_KEY, supabase } from "@/lib/sync/client";
import { hashOf, syncOnce, type Shadow, type SyncIo, type SyncOutcome, type SyncRow } from "@/lib/sync/core";
import { consentRows, isConsentActive, readConsents, SYNC_CONSENT_VERSION, withdrawConsent } from "@/lib/consent";

/**
 * Sync on the device (PR4): which keys go to the account, where the
 * shadow and cursor live, and one guarded run against Supabase. Reads stay
 * on the device; this only copies changes up and other devices' changes
 * down. No record values are logged.
 *
 * Consent first (TR1): without the person's tick on this device nothing is
 * sent, not even a sign-in check. With it, the record of the choice goes
 * to the account before any data does; a withdrawal is recorded the same
 * way and then nothing more is sent.
 */

/** Where this device keeps what it last synced and how far it has pulled (not in backups). */
export const SYNC_STATE_KEY = "sync.v1.state";

/** Kept on the device only: a workout in progress, device and thread ids, a device setting. */
export const DEVICE_ONLY_KEYS: ReadonlySet<string> = new Set(["activeWorkout", "assistantUserId", "assistantClientId", "assistantActiveThreadIdV1", "restTimerNotifySettings"]);

/** The keys that follow the account: everything the backup holds, less the device's own. */
export function syncedKeys(): string[] {
  return STORAGE_KEYS.filter((e) => e.scope === "local" && e.includeInBackup && !DEVICE_ONLY_KEYS.has(e.key)).map((e) => e.key);
}

type SyncState = {
  userId: string | null;
  shadow: Shadow;
  cursor: string | null;
  lastSyncAt: string | null;
  lastError: string | null;
  /** Hash of the consent rows this account last received, so a choice is sent once (TR1). */
  consentSent: string | null;
};

const EMPTY_STATE: SyncState = { userId: null, shadow: {}, cursor: null, lastSyncAt: null, lastError: null, consentSent: null };

function loadState(): SyncState {
  const s = kvGet<Partial<SyncState>>(SYNC_STATE_KEY);
  return s && typeof s === "object" ? { userId: s.userId ?? null, shadow: s.shadow ?? {}, cursor: s.cursor ?? null, lastSyncAt: s.lastSyncAt ?? null, lastError: s.lastError ?? null, consentSent: s.consentSent ?? null } : { ...EMPTY_STATE };
}

function saveState(s: SyncState) {
  kvSet(SYNC_STATE_KEY, s);
}

// ── Status, for the account screen ──

export type SyncStatus = { running: boolean; lastSyncAt: string | null; lastError: string | null; last: SyncOutcome | null };

let status: SyncStatus | null = null;
const listeners = new Set<() => void>();

export function getSyncStatus(): SyncStatus {
  if (!status) {
    const s = typeof window === "undefined" ? null : loadState();
    status = { running: false, lastSyncAt: s?.lastSyncAt ?? null, lastError: s?.lastError ?? null, last: null };
  }
  return status;
}

const SERVER_STATUS: SyncStatus = { running: false, lastSyncAt: null, lastError: null, last: null };
export function getServerSyncStatus(): SyncStatus {
  return SERVER_STATUS;
}

export function subscribeSync(cb: () => void): () => void {
  listeners.add(cb);
  return () => listeners.delete(cb);
}

function setStatus(next: Partial<SyncStatus>) {
  status = { ...getSyncStatus(), ...next };
  for (const l of listeners) l();
}

// ── One run ──

const PAGE = 1000;
let inFlight: Promise<SyncOutcome | null> | null = null;

/**
 * One sync when signed in and the person has agreed to it on this device;
 * null when accounts are off, nobody is signed in, or there is no consent
 * (TR1). Overlapping calls share one run.
 */
export function runSync(): Promise<SyncOutcome | null> {
  if (!inFlight) inFlight = doSync().finally(() => (inFlight = null));
  return inFlight;
}

async function doSync(): Promise<SyncOutcome | null> {
  const sb = supabase();
  if (!sb) return null;
  const consents = readConsents();
  // No choice made on this device: nothing goes anywhere.
  if (!consents.sync) return null;
  const syncOn = isConsentActive(consents.sync, SYNC_CONSENT_VERSION);
  const { data } = await sb.auth.getSession();
  const session = data.session;
  if (!session) return null;

  let state = loadState();
  // A different account on this device starts afresh: its first sync takes the server's copy and adds what the device has.
  if (state.userId !== session.user.id) state = { ...EMPTY_STATE, userId: session.user.id };

  // The record of the choices goes first. With sync off, only the sync choice (its withdrawal) is sent.
  const rows = consentRows(syncOn ? consents : { sync: consents.sync, ai: null });
  const sent = hashOf(rows);
  if (state.consentSent !== sent) {
    const { error } = await sb.rpc("sync_push", { rows });
    if (error) {
      if (syncOn) {
        state = { ...state, lastError: "Couldn't reach your account" };
        saveState(state);
        setStatus({ running: false, lastError: state.lastError });
      }
      return null;
    }
    state = { ...state, consentSent: sent };
    saveState(state);
  }
  if (!syncOn) return null;
  setStatus({ running: true });

  const io: SyncIo = {
    keys: syncedKeys(),
    read: (k) => kvGetRaw(k),
    write: (k, raw) => {
      const r = raw == null ? kvRemove(k) : kvSetRaw(k, raw);
      if (!r.ok) throw new Error("Couldn't save on this device");
    },
    loadShadow: () => state.shadow,
    saveShadow: (s) => {
      state = { ...state, shadow: s };
      saveState(state);
    },
    loadCursor: () => state.cursor,
    saveCursor: (c) => {
      state = { ...state, cursor: c };
      saveState(state);
    },
    push: async (rows) => {
      const { error } = await sb.rpc("sync_push", { rows });
      if (error) throw new Error("Couldn't reach your account");
    },
    pull: async (since) => {
      const out: SyncRow[] = [];
      for (let from = 0; ; from += PAGE) {
        let q = sb.from("sync_records").select("k,id,data,deleted,updated_at,server_at").order("server_at", { ascending: true }).range(from, from + PAGE - 1);
        if (since) q = q.gt("server_at", since);
        const { data: page, error } = await q;
        if (error) throw new Error("Couldn't reach your account");
        const rows = (page ?? []) as SyncRow[];
        // One time format for the cursor, whatever Postgres prints.
        out.push(...rows.map((r) => ({ ...r, server_at: r.server_at ? new Date(r.server_at).toISOString() : undefined })));
        if (rows.length < PAGE) break;
      }
      return out;
    },
    now: () => new Date().toISOString(),
  };

  try {
    const outcome = await syncOnce(io);
    const at = new Date().toISOString();
    state = { ...state, lastSyncAt: at, lastError: null };
    saveState(state);
    if (outcome.changedKeys.length && typeof window !== "undefined") {
      // As a backup import does: the workout context and older modules reload what they hold.
      window.dispatchEvent(new Event("workoutHistoryChanged"));
      window.dispatchEvent(new CustomEvent("gym:synced", { detail: { keys: outcome.changedKeys } }));
    }
    setStatus({ running: false, lastSyncAt: at, lastError: null, last: outcome });
    return outcome;
  } catch (e) {
    const message = e instanceof Error && /^Couldn't/.test(e.message) ? e.message : "Sync didn't finish";
    state = { ...state, lastError: message };
    saveState(state);
    setStatus({ running: false, lastError: message });
    return null;
  }
}

// ── Stopping and forgetting (TR1) ──

/**
 * Stop syncing on this device: the consent is withdrawn, the withdrawal
 * is recorded in the account, and from then on `runSync` sends nothing.
 * The session stays, so the account can still be deleted from here.
 */
export async function stopSyncing(nowIso: string): Promise<boolean> {
  if (!withdrawConsent("sync", nowIso)) return false;
  // A run already under way finishes first; the next one only records the withdrawal.
  await runSync();
  await runSync();
  return true;
}

/**
 * The account is gone (deleted): drop this device's session for it and its
 * sync position, so nothing refers to it any more. The device's data stays.
 */
export function forgetAccount(): void {
  kvRemove(SYNC_STATE_KEY);
  kvRemove(AUTH_STORAGE_KEY);
  setStatus({ running: false, lastSyncAt: null, lastError: null, last: null });
}
