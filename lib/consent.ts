"use client";

import { useSyncExternalStore } from "react";
import { kvGet, kvGetRaw, kvSet, subscribeKey } from "@/lib/storage/kv";
import type { SyncRow } from "@/lib/sync/core";

/**
 * Consent (TR1). Two separate choices, each made with its own tick and
 * never assumed:
 *
 * - `sync`: keep a copy of this device's data in the person's account
 *   (Supabase, Frankfurt) so it is safe and on every device. Without it
 *   nothing leaves the phone for the account: `runSync` refuses.
 * - `ai`: send what the coach needs to Anthropic to write an answer. Off
 *   until turned on; the assistant checks `hasAiConsent()`.
 *
 * Each choice is kept on the device as `{id, version, at}` (plus
 * `withdrawnAt` once taken back) and, while signed in, as a row in the
 * account's `sync_records` under `consent.v1` (`consentRows`, pushed by
 * `lib/sync/run.ts`), so the account holds what was agreed and when.
 */

export const CONSENT_KEY = "consent.v1";

/** Bump when the sync consent's wording changes in substance: an older tick stops counting and the screen asks again. OURS. */
export const SYNC_CONSENT_VERSION = 1;
/** Bump when the AI consent's wording changes in substance (another provider, more data sent). OURS. */
export const AI_CONSENT_VERSION = 1;

export type ConsentKind = "sync" | "ai";
export type ConsentRecord = { id: string; version: number; at: string; withdrawnAt?: string };
export type Consents = { sync: ConsentRecord | null; ai: ConsentRecord | null };

const CURRENT_VERSION: Record<ConsentKind, number> = { sync: SYNC_CONSENT_VERSION, ai: AI_CONSENT_VERSION };
const NONE: Consents = { sync: null, ai: null };

function cleanRecord(v: unknown): ConsentRecord | null {
  const r = v as Partial<ConsentRecord> | null;
  if (!r || typeof r !== "object" || typeof r.id !== "string" || !r.id || typeof r.version !== "number" || typeof r.at !== "string" || Number.isNaN(Date.parse(r.at))) return null;
  const out: ConsentRecord = { id: r.id, version: r.version, at: r.at };
  if (typeof r.withdrawnAt === "string" && !Number.isNaN(Date.parse(r.withdrawnAt))) out.withdrawnAt = r.withdrawnAt;
  return out;
}

/** Pure: a stored value as consents, anything malformed counting as no choice made. */
export function parseConsents(v: unknown): Consents {
  const o = v as Partial<Record<ConsentKind, unknown>> | null;
  if (!o || typeof o !== "object") return NONE;
  return { sync: cleanRecord(o.sync), ai: cleanRecord(o.ai) };
}

/** Pure: a choice that is given, not taken back, and made to the current wording. */
export function isConsentActive(rec: ConsentRecord | null | undefined, version: number): boolean {
  return !!rec && rec.version >= version && !rec.withdrawnAt;
}

export function readConsents(): Consents {
  return parseConsents(kvGet<unknown>(CONSENT_KEY));
}

/** Whether this device may sync with the account. */
export function hasSyncConsent(): boolean {
  return isConsentActive(readConsents().sync, SYNC_CONSENT_VERSION);
}

/**
 * Whether the person has agreed to the coach sending their data to
 * Anthropic (App Review 5.1.2(i): explicit permission, naming the AI
 * provider, before personal data goes to it). Off by default. The
 * assistant must check this before every request that carries their data.
 */
export function hasAiConsent(): boolean {
  return isConsentActive(readConsents().ai, AI_CONSENT_VERSION);
}

function newId(): string {
  try {
    return crypto.randomUUID();
  } catch {
    return `c-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 10)}`;
  }
}

/** Record a fresh tick for this choice. False when the device couldn't save it (then nothing counts as agreed). */
export function giveConsent(kind: ConsentKind, nowIso: string): boolean {
  const cur = readConsents();
  const next: Consents = { ...cur, [kind]: { id: newId(), version: CURRENT_VERSION[kind], at: nowIso } };
  return kvSet(CONSENT_KEY, next).ok;
}

/** Take a choice back. The record stays, marked with when, so the account keeps the history. */
export function withdrawConsent(kind: ConsentKind, nowIso: string): boolean {
  const cur = readConsents();
  const rec = cur[kind];
  if (!rec || rec.withdrawnAt) return true;
  return kvSet(CONSENT_KEY, { ...cur, [kind]: { ...rec, withdrawnAt: nowIso } }).ok;
}

/**
 * Pure: the rows that record these choices in the account, one per choice
 * keyed by kind and the choice's own id. A withdrawal rewrites its row
 * later in time, so the server's newest-wins push keeps it.
 */
export function consentRows(c: Consents): SyncRow[] {
  const rows: SyncRow[] = [];
  for (const kind of ["sync", "ai"] as const) {
    const rec = c[kind];
    if (!rec) continue;
    rows.push({ k: CONSENT_KEY, id: `${kind}:${rec.id}`, data: { kind, ...rec }, deleted: false, updated_at: rec.withdrawnAt ?? rec.at });
  }
  return rows;
}

// ── For screens ──

let cache: { raw: string | null; value: Consents } | null = null;

function snapshot(): Consents {
  const raw = kvGetRaw(CONSENT_KEY);
  if (!cache || cache.raw !== raw) cache = { raw, value: readConsents() };
  return cache.value;
}

const subscribe = (cb: () => void) => subscribeKey(CONSENT_KEY, cb);
const serverSnapshot = () => null;

/** The current choices; null until the device has been read (first render on the server). */
export function useConsents(): Consents | null {
  return useSyncExternalStore(subscribe, snapshot, serverSnapshot);
}
