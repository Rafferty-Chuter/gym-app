import { describe, expect, it } from "vitest";
import { applyRows, diffKey, hashOf, pullFrom, PULL_OVERLAP_S, recordsOf, syncOnce, type Shadow, type StoredValue, type SyncIo, type SyncRow } from "@/lib/sync/core";

const W = "physique.v1.weighIns";
const GOAL = "physique.v1.goal";
const UNIT = "weightUnit";
const KEYS = [W, GOAL, UNIT];

const w = (id: string, kg: number, date = "2026-10-20") => ({ id, date, kg, loggedAt: `${date}T07:00:00.000Z` });

/** A server like `sync_push` and the select: newest write wins per (k, id); every write gets a later server time. */
function fakeServer() {
  const rows = new Map<string, SyncRow>();
  let clock = Date.parse("2026-10-21T00:00:00Z");
  return {
    rows,
    async push(batch: SyncRow[]) {
      expect(batch.length).toBeLessThanOrEqual(500);
      for (const r of batch) {
        const key = `${r.k}\u0000${r.id}`;
        const had = rows.get(key);
        if (had && r.updated_at < had.updated_at) continue;
        clock += 1000;
        rows.set(key, { ...r, data: r.data == null ? null : JSON.parse(JSON.stringify(r.data)), server_at: new Date(clock).toISOString() });
      }
    },
    async pull(since: string | null) {
      return [...rows.values()].filter((r) => !since || (r.server_at as string) > since).map((r) => ({ ...r }));
    },
  };
}

/** A device: its storage, shadow and cursor in memory, and a clock. */
function device(server: ReturnType<typeof fakeServer>, start: Record<string, unknown> = {}) {
  const store = new Map<string, string>(Object.entries(start).map(([k, v]) => [k, typeof v === "string" ? v : JSON.stringify(v)]));
  let shadow: Shadow = {};
  let cursor: string | null = null;
  let t = Date.parse("2026-10-21T08:00:00Z");
  const io: SyncIo = {
    keys: KEYS,
    read: (k) => store.get(k) ?? null,
    write: (k, raw: StoredValue) => (raw == null ? store.delete(k) : store.set(k, raw)),
    loadShadow: () => shadow,
    saveShadow: (s) => (shadow = JSON.parse(JSON.stringify(s))),
    loadCursor: () => cursor,
    saveCursor: (c) => (cursor = c),
    push: (rows) => server.push(rows),
    pull: (since) => server.pull(since),
    now: () => new Date((t += 60_000)).toISOString(),
  };
  return {
    io,
    sync: () => syncOnce(io),
    get: <T>(k: string) => (store.has(k) ? (JSON.parse(store.get(k) as string) as T) : null),
    getRaw: (k: string) => store.get(k) ?? null,
    set: (k: string, v: unknown) => store.set(k, typeof v === "string" ? v : JSON.stringify(v)),
  };
}

const ids = (list: Array<{ id: string }> | null) => (list ?? []).map((x) => x.id).sort();

describe("sync, the pure parts (PR4)", () => {
  it("hashes a record the same whichever way round its keys are", () => {
    expect(hashOf({ a: 1, b: { c: 2, d: [1, 2] } })).toBe(hashOf({ b: { d: [1, 2], c: 2 }, a: 1 }));
    expect(hashOf({ a: 1 })).not.toBe(hashOf({ a: 2 }));
  });

  it("reads an array of records with unique ids record by record, anything else whole", () => {
    expect(recordsOf(JSON.stringify([w("a", 80), w("b", 81)]))?.size).toBe(2);
    expect(recordsOf(JSON.stringify([w("a", 80), w("a", 81)]))).toBeNull();
    expect(recordsOf(JSON.stringify([{ completedAt: "x" }]))).toBeNull();
    expect(recordsOf("kg")).toBeNull();
    expect(recordsOf(null)).toBeNull();
  });

  it("finds new, changed and deleted records since the shadow", () => {
    const first = diffKey(W, JSON.stringify([w("a", 80), w("b", 81)]), undefined, "T1");
    expect(first.rows.map((r) => [r.id, r.deleted])).toEqual([["a", false], ["b", false]]);
    const second = diffKey(W, JSON.stringify([w("a", 80.4), w("c", 82)]), first.next, "T2");
    expect(second.rows.map((r) => [r.id, r.deleted]).sort()).toEqual([["a", false], ["b", true], ["c", false]]);
    expect(diffKey(W, JSON.stringify([w("a", 80.4), w("c", 82)]), second.next, "T3").rows).toEqual([]);
    expect(diffKey(W, "[]", second.next, "T4").rows.every((r) => r.deleted)).toBe(true);
  });

  it("syncs a value that is not records whole, and its removal", () => {
    const a = diffKey(UNIT, "kg", undefined, "T1");
    expect(a.rows).toEqual([{ k: UNIT, id: "", data: "kg", deleted: false, updated_at: "T1" }]);
    expect(diffKey(UNIT, null, a.next, "T2").rows).toEqual([{ k: UNIT, id: "", data: null, deleted: true, updated_at: "T2" }]);
  });

  it("leaves a record changed on the device since the last sync for the device to push", () => {
    const synced = diffKey(W, JSON.stringify([w("a", 80)]), undefined, "T1");
    const local = JSON.stringify([w("a", 79.5)]);
    const r = applyRows(local, [{ k: W, id: "a", data: w("a", 85), deleted: false, updated_at: "T0" }], synced.next);
    expect(r.changed).toBe(false);
    expect(JSON.parse(r.raw as string)[0].kg).toBe(79.5);
  });

  it("reaches back a little before the cursor, so a late commit is not missed", () => {
    expect(pullFrom(null)).toBeNull();
    expect(Date.parse("2026-10-21T10:00:00.000Z") - Date.parse(pullFrom("2026-10-21T10:00:00.000Z") as string)).toBe(PULL_OVERLAP_S * 1000);
  });
});

describe("sync between two devices (PR4)", () => {
  it("copies a device's data up on its first sync, and down to a new device", async () => {
    const server = fakeServer();
    const phone = device(server, { [W]: [w("a", 80), w("b", 81)], [GOAL]: { targetKg: 78 }, [UNIT]: "kg" });
    const out = await phone.sync();
    expect(out.first).toBe(true);
    expect(out.pushed).toBe(4);
    const laptop = device(server);
    await laptop.sync();
    expect(ids(laptop.get(W))).toEqual(["a", "b"]);
    expect(laptop.get(GOAL)).toEqual({ targetKg: 78 });
    expect(laptop.getRaw(UNIT)).toBe("kg");
  });

  it("never lets a second device's first sync overwrite the account, and keeps what only it has", async () => {
    const server = fakeServer();
    const phone = device(server, { [W]: [w("a", 80)], [GOAL]: { targetKg: 78 } });
    await phone.sync();
    const laptop = device(server, { [W]: [w("a", 99), w("z", 70)], [GOAL]: { targetKg: 60 } });
    await laptop.sync();
    expect(laptop.get<Array<{ id: string; kg: number }>>(W)!.find((x) => x.id === "a")!.kg).toBe(80);
    expect(laptop.get(GOAL)).toEqual({ targetKg: 78 });
    expect(ids(laptop.get(W))).toEqual(["a", "z"]);
    await phone.sync();
    expect(ids(phone.get(W))).toEqual(["a", "z"]);
    expect(phone.get<Array<{ id: string; kg: number }>>(W)!.find((x) => x.id === "a")!.kg).toBe(80);
  });

  it("passes edits and deletes both ways, the later edit winning", async () => {
    const server = fakeServer();
    const phone = device(server, { [W]: [w("a", 80), w("b", 81)] });
    await phone.sync();
    const laptop = device(server);
    await laptop.sync();
    phone.set(W, [w("a", 80.2)]);
    await phone.sync();
    await laptop.sync();
    expect(laptop.get(W)).toEqual([w("a", 80.2)]);
    // Both edit "a"; the laptop syncs later, so its edit is the newer write.
    phone.set(W, [w("a", 1)]);
    laptop.set(W, [w("a", 2)]);
    await phone.sync();
    await laptop.sync();
    await phone.sync();
    expect(phone.get(W)).toEqual([w("a", 2)]);
    expect(laptop.get(W)).toEqual([w("a", 2)]);
  });

  it("sends nothing when nothing changed, and pushes in batches of 500 at most", async () => {
    const server = fakeServer();
    const many = Array.from({ length: 1201 }, (_, i) => w(`r${i}`, 80 + (i % 10) / 10));
    const phone = device(server, { [W]: many });
    expect((await phone.sync()).pushed).toBe(1201);
    expect((await phone.sync()).pushed).toBe(0);
    expect(server.rows.size).toBe(1201);
  });

  it("ignores keys it does not sync", async () => {
    const server = fakeServer();
    await server.push([{ k: "assistantClientId", id: "", data: "someone-else", deleted: false, updated_at: "2026-10-21T00:00:00Z" }]);
    const phone = device(server, { [UNIT]: "kg" });
    const out = await phone.sync();
    expect(out.changedKeys).toEqual([]);
    expect(phone.getRaw("assistantClientId")).toBeNull();
  });
});
