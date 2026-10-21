import { beforeEach, describe, expect, it, vi } from "vitest";
import type { SyncRow } from "@/lib/sync/core";

/**
 * The consent gate on sync (TR1): `runSync` against a stand-in Supabase
 * client that records every call, so "nothing sent" means no call at all.
 */

const fake = vi.hoisted(() => {
  type Row = { k: string; id: string; data: unknown; deleted: boolean; updated_at: string; server_at?: string };
  const state = { signedIn: true, rows: new Map<string, Row>(), clock: Date.parse("2026-10-21T00:00:00Z"), calls: [] as string[], pushes: [] as Row[][] };
  const builder = () => {
    let since: string | null = null;
    let from = 0;
    let to = 999;
    const b = {
      select: () => b,
      order: () => b,
      range: (f: number, t: number) => ((from = f), (to = t), b),
      gt: (_c: string, v: string) => ((since = v), b),
      then: (resolve: (v: { data: Row[]; error: null }) => void) =>
        resolve({ data: [...state.rows.values()].filter((r) => !since || (r.server_at as string) > since).slice(from, to + 1), error: null }),
    };
    return b;
  };
  const client = {
    auth: {
      getSession: async () => {
        state.calls.push("getSession");
        return { data: { session: state.signedIn ? { user: { id: "user-a" }, access_token: "token" } : null } };
      },
    },
    rpc: async (_name: string, args: { rows: Row[] }) => {
      state.calls.push("push");
      state.pushes.push(args.rows);
      for (const r of args.rows) {
        const key = `${r.k}|${r.id}`;
        const had = state.rows.get(key);
        if (had && r.updated_at < had.updated_at) continue;
        state.clock += 1000;
        state.rows.set(key, { ...r, server_at: new Date(state.clock).toISOString() });
      }
      return { error: null };
    },
    from: () => {
      state.calls.push("pull");
      return builder();
    },
  };
  return { state, client };
});

vi.mock("@/lib/sync/client", () => ({ AUTH_STORAGE_KEY: "sync.v1.auth", supabase: () => fake.client }));

const { runSync, stopSyncing } = await import("@/lib/sync/run");
const { giveConsent, CONSENT_KEY } = await import("@/lib/consent");

const W = "physique.v1.weighIns";
const weighIn = (id: string, kg: number) => ({ id, date: "2026-10-20", loggedAt: "2026-10-20T07:00:00.000Z", source: "manual", schemaVersion: 1, kg });
const onServer = (k: string) => [...fake.state.rows.values()].filter((r) => r.k === k);

beforeEach(() => {
  window.localStorage.clear();
  fake.state.signedIn = true;
  fake.state.rows.clear();
  fake.state.calls.length = 0;
  fake.state.pushes.length = 0;
  window.localStorage.setItem(W, JSON.stringify([weighIn("w1", 82.4)]));
});

describe("runSync and consent (TR1)", () => {
  it("sends nothing, not even a sign-in check, before the tick", async () => {
    expect(await runSync()).toBeNull();
    expect(fake.state.calls).toEqual([]);
    expect(fake.state.rows.size).toBe(0);
  });

  it("sends the record of the consent to the account before any data", async () => {
    giveConsent("sync", "2026-10-21T09:00:00.000Z");
    const out = await runSync();
    expect(out).not.toBeNull();
    expect(fake.state.pushes[0].every((r: SyncRow) => r.k === CONSENT_KEY)).toBe(true);
    expect(fake.state.pushes[0]).toHaveLength(1);
    expect(onServer(CONSENT_KEY)[0].data).toMatchObject({ kind: "sync", version: 1, at: "2026-10-21T09:00:00.000Z" });
    expect(onServer(W).map((r) => r.id)).toEqual(["w1"]);
    // Sent once: the next run has no consent push.
    fake.state.pushes.length = 0;
    await runSync();
    expect(fake.state.pushes.flat().some((r: SyncRow) => r.k === CONSENT_KEY)).toBe(false);
  });

  it("after Stop syncing, records the withdrawal and sends nothing else", async () => {
    giveConsent("sync", "2026-10-21T09:00:00.000Z");
    await runSync();
    window.localStorage.setItem(W, JSON.stringify([weighIn("w1", 82.4), weighIn("w2", 82.1)]));
    fake.state.calls.length = 0;
    fake.state.pushes.length = 0;

    expect(await stopSyncing("2026-10-22T10:00:00.000Z")).toBe(true);
    expect(fake.state.pushes.flat().map((r: SyncRow) => r.k)).toEqual([CONSENT_KEY]);
    expect(onServer(CONSENT_KEY)[0].data).toMatchObject({ withdrawnAt: "2026-10-22T10:00:00.000Z" });
    expect(onServer(W).map((r) => r.id)).toEqual(["w1"]);
    expect(fake.state.calls).not.toContain("pull");

    // Later runs: a sign-in check, no upload, no download.
    fake.state.calls.length = 0;
    expect(await runSync()).toBeNull();
    expect(fake.state.calls).toEqual(["getSession"]);
  });

  it("doesn't send the AI choice to an account this device stopped syncing with", async () => {
    giveConsent("sync", "2026-10-21T09:00:00.000Z");
    await runSync();
    await stopSyncing("2026-10-22T10:00:00.000Z");
    fake.state.pushes.length = 0;
    giveConsent("ai", "2026-10-22T11:00:00.000Z");
    await runSync();
    expect(fake.state.pushes).toEqual([]);
    expect(onServer(CONSENT_KEY).map((r) => r.id.split(":")[0])).toEqual(["sync"]);
  });

  it("records the AI choice in the account while syncing", async () => {
    giveConsent("sync", "2026-10-21T09:00:00.000Z");
    giveConsent("ai", "2026-10-21T09:01:00.000Z");
    await runSync();
    expect(onServer(CONSENT_KEY).map((r) => r.id.split(":")[0]).sort()).toEqual(["ai", "sync"]);
  });

  it("sends nothing for a device signed in without ever ticking (signed in before TR1)", async () => {
    window.localStorage.removeItem(CONSENT_KEY);
    expect(await runSync()).toBeNull();
    expect(fake.state.calls).toEqual([]);
  });
});
