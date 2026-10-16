import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { createRecordStore, createRepo, createSingleton } from "@/lib/storage/repo";
import { kvSet, subscribeKey } from "@/lib/storage/kv";
import { backupKeys } from "@/lib/storage/keys";
import {
  APP_LOCAL_STORAGE_KEYS,
  exportAppLocalStorageSnapshot,
  importAppLocalStorageSnapshot,
} from "@/lib/devDataTransfer";

type Item = { id: string; date: string; loggedAt: string; kg: number };

beforeEach(() => {
  window.localStorage.clear();
});
afterEach(() => {
  vi.restoreAllMocks();
});

describe("createRepo", () => {
  it("round-trips: upsert, list by range, remove, subscribe fires", async () => {
    const repo = createRepo<Item>("test.items");
    const calls: number[] = [];
    const unsub = repo.subscribe(() => calls.push(1));
    await repo.upsert({ id: "b", date: "2026-10-02", loggedAt: "2026-10-02T07:00:00Z", kg: 82 });
    await repo.upsert({ id: "a", date: "2026-10-01", loggedAt: "2026-10-01T07:00:00Z", kg: 83 });
    await repo.upsert({ id: "c", date: "2026-10-03", loggedAt: "2026-10-03T07:00:00Z", kg: 81 });
    expect((await repo.list()).map((x) => x.id)).toEqual(["a", "b", "c"]);
    expect((await repo.list({ from: "2026-10-02" })).map((x) => x.id)).toEqual(["b", "c"]);
    expect((await repo.list({ from: "2026-10-01", to: "2026-10-02" })).map((x) => x.id)).toEqual(["a", "b"]);
    await repo.upsert({ id: "b", date: "2026-10-02", loggedAt: "2026-10-02T07:00:00Z", kg: 82.5 });
    expect((await repo.get("b"))?.kg).toBe(82.5);
    await repo.remove("a");
    expect((await repo.list()).length).toBe(2);
    expect(calls.length).toBeGreaterThanOrEqual(4);
    // snapshot is stable until a write
    const s1 = repo.snapshot();
    const s2 = repo.snapshot();
    expect(s1).toBe(s2);
    unsub();
    // persisted
    const fresh = createRepo<Item>("test.items");
    expect((await fresh.list()).map((x) => x.id)).toEqual(["b", "c"]);
  });

  it("rejects when the write fails (quota)", async () => {
    const repo = createRepo<Item>("test.quota");
    const spy = vi.spyOn(window.localStorage, "setItem").mockImplementation(() => {
      const err = new Error("quota");
      err.name = "QuotaExceededError";
      throw err;
    });
    try {
      await expect(
        repo.upsert({ id: "x", date: "2026-10-01", loggedAt: "2026-10-01T07:00:00Z", kg: 80 })
      ).rejects.toThrow(/QuotaExceededError/);
    } finally {
      spy.mockRestore();
    }
  });
});

describe("singleton and record store", () => {
  it("singleton get/set/clear", async () => {
    const s = createSingleton<{ a: number }>("test.single");
    expect(await s.get()).toBeNull();
    await s.set({ a: 1 });
    expect(await s.get()).toEqual({ a: 1 });
    expect(s.snapshot()).toEqual({ a: 1 });
    await s.clear();
    expect(await s.get()).toBeNull();
  });

  it("record store set/get/remove/all", async () => {
    const r = createRecordStore<{ fasting?: boolean }>("test.record");
    await r.set("2026-10-01", { fasting: true });
    await r.set("2026-10-02", {});
    expect(await r.get("2026-10-01")).toEqual({ fasting: true });
    expect(Object.keys(await r.all())).toEqual(["2026-10-01", "2026-10-02"]);
    await r.remove("2026-10-01");
    expect(await r.get("2026-10-01")).toBeNull();
  });

  it("subscribeKey sees same-tab writes", () => {
    let hits = 0;
    const unsub = subscribeKey("test.sub", () => hits++);
    kvSet("test.sub", 1);
    kvSet("test.other", 2);
    unsub();
    expect(hits).toBe(1);
  });
});

describe("backup registry", () => {
  const OLD_ALLOWLIST = [
    "workoutHistory",
    "workoutTemplates",
    "userCoachingProfile",
    "assistantThreadsV1",
    "assistantActiveThreadIdV1",
    "assistantUserId",
    "assistantSelectiveMemoryV1",
    "userExerciseLibrary",
    "activeWorkout",
    "weightUnit",
    "priorityGoal",
    "onboardingComplete",
    "onboardingProfile",
    "assistantClientId",
    "experienceLevel",
    "trainingFocus",
  ];

  it("covers every pre-F3 key (minus session keys) plus the ones the audit found missing", () => {
    const keys = new Set(backupKeys());
    for (const k of OLD_ALLOWLIST) expect(keys.has(k), k).toBe(true);
    for (const k of ["assistantMemory", "restTimerNotifySettings", "volumeEnabledOptionalGroups"]) {
      expect(keys.has(k), k).toBe(true);
    }
    expect(keys.has("workoutFromTemplate")).toBe(false);
    expect(keys.has("workoutSuggestedMuscle")).toBe(false);
    expect([...keys].some((k) => k.startsWith("physique.v1."))).toBe(true);
    expect(APP_LOCAL_STORAGE_KEYS).toEqual(backupKeys());
  });

  it("a pre-F3 export imports losslessly", () => {
    const legacy = {
      v: 1,
      exportedAt: "2026-05-01T00:00:00Z",
      keys: {
        workoutHistory: JSON.stringify([{ completedAt: "2026-04-30T10:00:00Z", exercises: [] }]),
        weightUnit: "kg",
        onboardingProfile: JSON.stringify({ units: "kg", bodyweightKg: 82 }),
      },
    };
    const result = importAppLocalStorageSnapshot(JSON.stringify(legacy));
    expect(result.ok).toBe(true);
    expect(window.localStorage.getItem("weightUnit")).toBe("kg");
    const exported = JSON.parse(exportAppLocalStorageSnapshot());
    expect(exported.keys.workoutHistory).toBe(legacy.keys.workoutHistory);
    expect(exported.keys.onboardingProfile).toBe(legacy.keys.onboardingProfile);
  });
});
