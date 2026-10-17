/**
 * Repository seam over localStorage. Async signatures (so a later move to
 * IndexedDB or a server changes nothing at call sites), with a synchronous
 * `snapshot()` for `useSyncExternalStore`.
 *
 * Snapshots are referentially stable until the data changes.
 */

import { kvGet, kvRemove, kvSet, subscribeKey, type KvResult } from "@/lib/storage/kv";

export type Entity = { id: string; date?: string; loggedAt?: string };

export type ListQuery = { from?: string; to?: string };

export type Repo<T extends Entity> = {
  key: string;
  list(query?: ListQuery): Promise<T[]>;
  get(id: string): Promise<T | null>;
  upsert(item: T): Promise<void>;
  bulkUpsert(items: readonly T[]): Promise<void>;
  remove(id: string): Promise<void>;
  clear(): Promise<void>;
  subscribe(cb: () => void): () => void;
  /** Sorted by date, then loggedAt. Stable reference until the data changes. */
  snapshot(): readonly T[];
};

function fail(result: KvResult): never {
  throw new Error(`Storage write failed: ${result.ok ? "unknown" : result.error}`);
}

function sortEntities<T extends Entity>(items: T[]): T[] {
  return items.sort((a, b) => {
    const da = a.date ?? "";
    const db = b.date ?? "";
    if (da !== db) return da < db ? -1 : 1;
    const la = a.loggedAt ?? "";
    const lb = b.loggedAt ?? "";
    if (la !== lb) return la < lb ? -1 : 1;
    return a.id < b.id ? -1 : a.id > b.id ? 1 : 0;
  });
}

const EMPTY: readonly never[] = Object.freeze([]);

export function createRepo<T extends Entity>(key: string): Repo<T> {
  let cache: readonly T[] | null = null;

  function load(): readonly T[] {
    ensureKeySubscription();
    if (cache) return cache;
    const raw = kvGet<unknown>(key);
    const items = Array.isArray(raw) ? (raw as T[]).filter((x) => x && typeof x.id === "string") : [];
    cache = Object.freeze(sortEntities(items));
    return cache;
  }

  function write(next: T[]) {
    const sorted = Object.freeze(sortEntities(next));
    const result = kvSet(key, sorted);
    if (!result.ok) fail(result);
    cache = sorted;
  }

  const subscribers = new Set<() => void>();
  let unsubscribeKey: (() => void) | null = null;
  function ensureKeySubscription() {
    if (unsubscribeKey) return;
    unsubscribeKey = subscribeKey(key, () => {
      cache = null;
      for (const s of subscribers) s();
    });
  }

  return {
    key,
    async list(query) {
      const all = load();
      if (!query || (!query.from && !query.to)) return [...all];
      return all.filter((x) => {
        const d = x.date ?? "";
        if (query.from && d < query.from) return false;
        if (query.to && d > query.to) return false;
        return true;
      });
    },
    async get(id) {
      return load().find((x) => x.id === id) ?? null;
    },
    async upsert(item) {
      const all = load();
      const idx = all.findIndex((x) => x.id === item.id);
      const next = idx === -1 ? [...all, item] : all.map((x, i) => (i === idx ? item : x));
      write(next);
    },
    async bulkUpsert(items) {
      const byId = new Map(load().map((x) => [x.id, x] as const));
      for (const it of items) byId.set(it.id, it);
      write([...byId.values()]);
    },
    async remove(id) {
      const all = load();
      if (!all.some((x) => x.id === id)) return;
      write(all.filter((x) => x.id !== id));
    },
    async clear() {
      ensureKeySubscription();
      const result = kvRemove(key);
      if (!result.ok) fail(result);
      cache = EMPTY as readonly T[];
    },
    subscribe(cb) {
      ensureKeySubscription();
      subscribers.add(cb);
      return () => subscribers.delete(cb);
    },
    snapshot() {
      return load();
    },
  };
}

export type Singleton<T> = {
  key: string;
  get(): Promise<T | null>;
  set(value: T): Promise<void>;
  clear(): Promise<void>;
  subscribe(cb: () => void): () => void;
  snapshot(): T | null;
};

export function createSingleton<T>(key: string): Singleton<T> {
  let cache: T | null | undefined;
  const subscribers = new Set<() => void>();
  let unsub: (() => void) | null = null;
  function ensure() {
    if (unsub) return;
    unsub = subscribeKey(key, () => {
      cache = undefined;
      for (const s of subscribers) s();
    });
  }
  function load(): T | null {
    ensure();
    if (cache !== undefined) return cache;
    cache = kvGet<T>(key);
    return cache;
  }
  return {
    key,
    async get() {
      return load();
    },
    async set(value) {
      ensure();
      const result = kvSet(key, value);
      if (!result.ok) fail(result);
      cache = value;
    },
    async clear() {
      ensure();
      const result = kvRemove(key);
      if (!result.ok) fail(result);
      cache = null;
    },
    subscribe(cb) {
      ensure();
      subscribers.add(cb);
      return () => subscribers.delete(cb);
    },
    snapshot() {
      return load();
    },
  };
}

export type RecordStore<T> = {
  key: string;
  get(k: string): Promise<T | null>;
  set(k: string, value: T): Promise<void>;
  remove(k: string): Promise<void>;
  all(): Promise<Readonly<Record<string, T>>>;
  clear(): Promise<void>;
  subscribe(cb: () => void): () => void;
  snapshot(): Readonly<Record<string, T>>;
};

const EMPTY_RECORD: Readonly<Record<string, never>> = Object.freeze({});

/** A date-keyed map (e.g. day flags). */
export function createRecordStore<T>(key: string): RecordStore<T> {
  let cache: Readonly<Record<string, T>> | null = null;
  const subscribers = new Set<() => void>();
  let unsub: (() => void) | null = null;
  function ensure() {
    if (unsub) return;
    unsub = subscribeKey(key, () => {
      cache = null;
      for (const s of subscribers) s();
    });
  }
  function load(): Readonly<Record<string, T>> {
    ensure();
    if (cache) return cache;
    const raw = kvGet<unknown>(key);
    cache = raw && typeof raw === "object" && !Array.isArray(raw) ? Object.freeze({ ...(raw as Record<string, T>) }) : EMPTY_RECORD;
    return cache;
  }
  function write(next: Record<string, T>) {
    const frozen = Object.freeze(next);
    const result = kvSet(key, frozen);
    if (!result.ok) fail(result);
    cache = frozen;
  }
  return {
    key,
    async get(k) {
      return load()[k] ?? null;
    },
    async set(k, value) {
      write({ ...load(), [k]: value });
    },
    async remove(k) {
      const all = load();
      if (!(k in all)) return;
      const next = { ...all };
      delete next[k];
      write(next);
    },
    async all() {
      return load();
    },
    async clear() {
      ensure();
      const result = kvRemove(key);
      if (!result.ok) fail(result);
      cache = EMPTY_RECORD;
    },
    subscribe(cb) {
      ensure();
      subscribers.add(cb);
      return () => subscribers.delete(cb);
    },
    snapshot() {
      return load();
    },
  };
}
