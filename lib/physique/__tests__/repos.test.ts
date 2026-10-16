import { beforeEach, describe, expect, it } from "vitest";
import { clearPhysiqueData, dayFlagsStore, goalStore, newId, weighInsRepo } from "@/lib/physique/io/repos";
import { exportAppLocalStorageSnapshot, importAppLocalStorageSnapshot } from "@/lib/devDataTransfer";
import { firstLoggedDate, resolveProfile } from "@/lib/physique/io/profile";

beforeEach(() => {
  window.localStorage.clear();
});

describe("physique repos", () => {
  it("round-trip through backup export/import", async () => {
    await weighInsRepo.upsert({ id: newId(), date: "2026-10-15", loggedAt: "2026-10-15T07:00:00Z", source: "manual", schemaVersion: 1, kg: 82.4 });
    await dayFlagsStore.set("2026-10-15", { date: "2026-10-15", status: "fasting" });
    await goalStore.set({
      id: "g1",
      createdAt: "2026-10-15T07:00:00Z",
      type: "gain",
      startDate: "2026-10-15",
      startTrendKg: 82.4,
      targetKg: 90,
      ratePctPerWeek: 0.25,
      trainingStatusAtCreation: "intermediate",
      schemaVersion: 1,
    });
    const json = exportAppLocalStorageSnapshot();
    await clearPhysiqueData();
    expect((await weighInsRepo.list()).length).toBe(0);
    const r = importAppLocalStorageSnapshot(json);
    expect(r.ok).toBe(true);
    expect(JSON.parse(json).keys["physique.v1.weighIns"]).toContain("82.4");
    expect(window.localStorage.getItem("physique.v1.weighIns")).toContain("82.4");
    expect(weighInsRepo.snapshot().length).toBe(1);
    expect((await weighInsRepo.list())[0]?.kg).toBe(82.4);
    expect((await dayFlagsStore.get("2026-10-15"))?.status).toBe("fasting");
    expect((await goalStore.get())?.targetKg).toBe(90);
  });
});

describe("profile resolution", () => {
  it("merges onboarding basics, applies defaults and reports missing fields", () => {
    const r = resolveProfile({ units: "kg", sex: "M", heightCm: 180 }, null, "2026-10-01");
    expect(r.sex).toBe("M");
    expect(r.age).toBe(30);
    expect(r.heightCm).toBe(180);
    expect(r.missing).toEqual([]);
    expect(r.expenditureStartDate).toBe("2026-10-01");
    expect(r.proteinLevel).toBe("moderate");
    const bare = resolveProfile(null, null, null);
    expect(bare.missing).toEqual(["heightCm", "sex"]);
    expect(bare.sex).toBe("prefer_not_to_say");
  });

  it("firstLoggedDate needs both a weigh-in and food on the same day", () => {
    expect(firstLoggedDate(["2026-10-01", "2026-10-03"], ["2026-10-02", "2026-10-03"])).toBe("2026-10-03");
    expect(firstLoggedDate(["2026-10-01"], [])).toBeNull();
  });
});
