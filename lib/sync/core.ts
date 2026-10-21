/**
 * Local-first sync, the pure part (PR4, S3 as research D §3.3's dual-run).
 * The device's storage stays the source of every read; sync copies its
 * changes to the account and brings other devices' changes back.
 *
 * Changes are found by comparing each key's stored value with a "shadow"
 * of what was last synced (a hash per record), so every writer is covered,
 * including the older modules that write storage directly. A key holding
 * an array of records with ids syncs record by record; anything else syncs
 * whole, as one row with id "".
 *
 * Conflicts: the server keeps the newest write (`sync_push`). A device's
 * first sync takes the server's copy of anything both hold and adds what
 * only the device has, so signing in on a second device never overwrites
 * the account with older data.
 *
 * Pure: values, shadows and rows in, rows and values out.
 */

// ── Types ──

/** One synced record as stored on the server. `id` "" is a key synced whole. */
export type SyncRow = {
  k: string;
  id: string;
  /** The record, or for a whole key its raw stored string; null when deleted. */
  data: unknown;
  deleted: boolean;
  /** When the device saw the change (ISO). */
  updated_at: string;
  /** When the server wrote it (ISO); absent on rows being pushed. */
  server_at?: string;
};

/** Per key, per record id ("" for a whole key), the hash of what was last synced. */
export type Shadow = Record<string, Record<string, string>>;

/** A key's stored value as the device holds it: the raw string, or null when absent. */
export type StoredValue = string | null;

// ── Hashing ──

/** JSON with object keys sorted at every level, so the same record hashes the same whichever way round its keys were stored. */
export function stableStringify(v: unknown): string {
  if (v === null || typeof v !== "object") return JSON.stringify(v) ?? "null";
  if (Array.isArray(v)) return `[${v.map(stableStringify).join(",")}]`;
  const o = v as Record<string, unknown>;
  return `{${Object.keys(o)
    .filter((k) => o[k] !== undefined)
    .sort()
    .map((k) => `${JSON.stringify(k)}:${stableStringify(o[k])}`)
    .join(",")}}`;
}

/** A 53-bit string hash (cyrb53), as hex. Collisions are negligible at this app's few thousand records. */
export function hashOf(v: unknown): string {
  const s = stableStringify(v);
  let h1 = 0xdeadbeef;
  let h2 = 0x41c6ce57;
  for (let i = 0; i < s.length; i++) {
    const c = s.charCodeAt(i);
    h1 = Math.imul(h1 ^ c, 2654435761);
    h2 = Math.imul(h2 ^ c, 1597334677);
  }
  h1 = Math.imul(h1 ^ (h1 >>> 16), 2246822507) ^ Math.imul(h2 ^ (h2 >>> 13), 3266489909);
  h2 = Math.imul(h2 ^ (h2 >>> 16), 2246822507) ^ Math.imul(h1 ^ (h1 >>> 13), 3266489909);
  return (4294967296 * (2097151 & h2) + (h1 >>> 0)).toString(16);
}

// ── Reading a stored value ──

type Records = Map<string, Record<string, unknown>>;

/** The records of a stored value when it is an array of objects with unique string ids; null for anything else (synced whole). */
export function recordsOf(raw: StoredValue): Records | null {
  if (raw == null) return null;
  let v: unknown;
  try {
    v = JSON.parse(raw);
  } catch {
    return null;
  }
  if (!Array.isArray(v) || v.length === 0) return null;
  const out: Records = new Map();
  for (const x of v) {
    if (!x || typeof x !== "object" || typeof (x as { id?: unknown }).id !== "string") return null;
    const id = (x as { id: string }).id;
    if (out.has(id)) return null;
    out.set(id, x as Record<string, unknown>);
  }
  return out;
}

/** Whether a key's shadow or rows hold records (by id) rather than one whole value. */
function isRecordShadow(s: Record<string, string> | undefined): boolean {
  return !!s && Object.keys(s).some((id) => id !== "");
}

// ── Local changes → rows ──

/**
 * A key's changes since the shadow, as rows to push, and the shadow once
 * they are pushed. New or changed records are written, records gone from
 * the device are marked deleted; a whole key is one row.
 */
export function diffKey(k: string, raw: StoredValue, shadow: Record<string, string> | undefined, now: string): { rows: SyncRow[]; next: Record<string, string> } {
  const prev = shadow ?? {};
  const rows: SyncRow[] = [];
  const next: Record<string, string> = {};
  const recs = recordsOf(raw);
  // An empty array on a key that held records is "every record deleted", not a whole value.
  const asRecords = recs != null || (raw != null && isRecordShadow(prev) && raw.trim() === "[]");
  if (asRecords) {
    for (const [id, rec] of recs ?? new Map()) {
      const h = hashOf(rec);
      next[id] = h;
      if (prev[id] !== h) rows.push({ k, id, data: rec, deleted: false, updated_at: now });
    }
    for (const id of Object.keys(prev)) {
      if (id !== "" && !(id in next)) rows.push({ k, id, data: null, deleted: true, updated_at: now });
    }
    if ("" in prev) rows.push({ k, id: "", data: null, deleted: true, updated_at: now });
    return { rows, next };
  }
  for (const id of Object.keys(prev)) if (id !== "") rows.push({ k, id, data: null, deleted: true, updated_at: now });
  if (raw == null) {
    if ("" in prev) rows.push({ k, id: "", data: null, deleted: true, updated_at: now });
    return { rows, next };
  }
  const h = hashOf(raw);
  next[""] = h;
  if (prev[""] !== h) rows.push({ k, id: "", data: raw, deleted: false, updated_at: now });
  return { rows, next };
}

// ── Server rows → local values ──

/**
 * A key's stored value with the server's rows applied: records put or
 * removed by id (kept in their order, new ones after), or the whole value
 * replaced or removed. A record (or whole value) changed on the device
 * since the shadow is left alone: it is pushed next and the server keeps
 * the newer. Returns the new raw value (null to remove the key), the
 * shadow after it, and whether anything changed on the device.
 */
export function applyRows(raw: StoredValue, rows: readonly SyncRow[], shadow: Record<string, string> | undefined): { raw: StoredValue; next: Record<string, string>; changed: boolean } {
  const next: Record<string, string> = { ...(shadow ?? {}) };
  const whole = rows.filter((r) => r.id === "");
  const byId = rows.filter((r) => r.id !== "");
  let out: StoredValue = raw;
  let changed = false;

  // A whole value, the latest row for it, unless the device changed it since the last sync.
  const w = whole.at(-1);
  const wholeDirty = shadow?.[""] != null && raw != null && hashOf(raw) !== shadow[""];
  if (w && !wholeDirty) {
    if (w.deleted) {
      delete next[""];
      if (byId.length === 0 && out !== null) {
        out = null;
        changed = true;
      }
    } else if (typeof w.data === "string") {
      next[""] = hashOf(w.data);
      if (out !== w.data) {
        out = w.data;
        changed = true;
      }
    }
  }

  if (byId.length) {
    const recs = recordsOf(out) ?? new Map<string, Record<string, unknown>>();
    const local = new Map([...recs].map(([id, rec]) => [id, hashOf(rec)]));
    for (const r of byId) {
      // Changed on the device since the last sync (or added there while the shadow knew it): the device's copy goes up next.
      const mine = local.get(r.id);
      if (shadow?.[r.id] != null && mine != null && mine !== shadow[r.id]) continue;
      if (r.deleted) {
        delete next[r.id];
        if (recs.delete(r.id)) changed = true;
      } else if (r.data && typeof r.data === "object") {
        const h = hashOf(r.data);
        next[r.id] = h;
        const had = recs.get(r.id);
        if (!had || hashOf(had) !== h) {
          recs.set(r.id, r.data as Record<string, unknown>);
          changed = true;
        }
      }
    }
    delete next[""];
    if (changed) out = JSON.stringify([...recs.values()]);
  }
  return { raw: out, next, changed };
}

/** Rows grouped by key, each key's rows in server order. */
export function groupByKey(rows: readonly SyncRow[]): Map<string, SyncRow[]> {
  const out = new Map<string, SyncRow[]>();
  for (const r of [...rows].sort((a, b) => ((a.server_at ?? "") < (b.server_at ?? "") ? -1 : 1))) {
    const list = out.get(r.k) ?? [];
    list.push(r);
    out.set(r.k, list);
  }
  return out;
}

// ── Pull cursor ──

/** Seconds a pull reaches back before its cursor, so a write committed late with an earlier server time is not missed. Rows applied twice change nothing. OURS. */
export const PULL_OVERLAP_S = 120;

/** The cursor a pull starts from: the latest server time seen, less the overlap; null for everything. */
export function pullFrom(cursor: string | null): string | null {
  if (!cursor) return null;
  const t = Date.parse(cursor);
  return Number.isFinite(t) ? new Date(t - PULL_OVERLAP_S * 1000).toISOString() : null;
}

/** The latest server time among rows, or the cursor when none is later. */
export function advanceCursor(cursor: string | null, rows: readonly SyncRow[]): string | null {
  let c = cursor;
  for (const r of rows) if (r.server_at && (!c || r.server_at > c)) c = r.server_at;
  return c;
}

// ── One sync ──

/** Rows a push sends at most per call; the server refuses more (`sync_push`). */
export const PUSH_BATCH = 500;

/** What a sync needs from the device and the server; the io layer supplies it. */
export type SyncIo = {
  /** The storage keys that sync. */
  keys: readonly string[];
  read(k: string): StoredValue;
  /** Write a key's raw value, or remove it with null. */
  write(k: string, raw: StoredValue): void;
  loadShadow(): Shadow;
  saveShadow(s: Shadow): void;
  loadCursor(): string | null;
  saveCursor(c: string | null): void;
  /** Upsert rows on the server (newest write wins there). */
  push(rows: SyncRow[]): Promise<void>;
  /** Every row with a server time after `since` (all rows when null). */
  pull(since: string | null): Promise<SyncRow[]>;
  now(): string;
};

export type SyncOutcome = { pushed: number; pulled: number; changedKeys: string[]; first: boolean };

function applyAll(io: SyncIo, shadow: Shadow, rows: readonly SyncRow[]): string[] {
  const changed: string[] = [];
  for (const [k, list] of groupByKey(rows)) {
    if (!io.keys.includes(k)) continue;
    const r = applyRows(io.read(k), list, shadow[k]);
    shadow[k] = r.next;
    if (r.changed) {
      io.write(k, r.raw);
      changed.push(k);
    }
  }
  return changed;
}

/**
 * One sync. The first on a device (no cursor) pulls everything first and
 * takes the server's copy of what both hold, then pushes what only the
 * device has. After that, the device's changes go up first, then
 * everything new on the server comes down. The shadow and cursor are saved
 * only after each step succeeds, so a failed push is retried whole.
 */
export async function syncOnce(io: SyncIo): Promise<SyncOutcome> {
  const shadow: Shadow = { ...io.loadShadow() };
  const cursor = io.loadCursor();
  const first = cursor == null;
  let pulled = 0;
  const changedKeys: string[] = [];

  if (first) {
    const rows = await io.pull(null);
    pulled += rows.length;
    changedKeys.push(...applyAll(io, shadow, rows));
    io.saveShadow(shadow);
    io.saveCursor(advanceCursor(null, rows) ?? new Date(0).toISOString());
  }

  // Push the device's changes.
  const now = io.now();
  const out: SyncRow[] = [];
  const after: Shadow = { ...shadow };
  for (const k of io.keys) {
    const d = diffKey(k, io.read(k), shadow[k], now);
    out.push(...d.rows);
    after[k] = d.next;
  }
  for (let i = 0; i < out.length; i += PUSH_BATCH) await io.push(out.slice(i, i + PUSH_BATCH));
  io.saveShadow(after);

  // Pull what is new on the server.
  if (!first) {
    const rows = await io.pull(pullFrom(cursor));
    pulled += rows.length;
    const s2: Shadow = { ...after };
    changedKeys.push(...applyAll(io, s2, rows));
    io.saveShadow(s2);
    io.saveCursor(advanceCursor(cursor, rows));
  }
  return { pushed: out.length, pulled, changedKeys: [...new Set(changedKeys)], first };
}
