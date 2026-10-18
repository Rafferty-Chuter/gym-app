// @vitest-environment happy-dom
import { beforeEach, describe, expect, it } from "vitest";
import { saveOnboardingProfile } from "@/lib/onboardingProfile";
import { foodEntriesRepo, goalStore, programStore, sleepNightsRepo, stepsRepo, weighInsRepo } from "@/lib/physique/io/repos";
import { commitDailyLog, hasImportedData, removeImportedData } from "@/lib/physique/io/dailyLogImport";
import { parseDailyLog } from "@/lib/import/dailyLog";
import { sampleDailyLog } from "@/lib/import/sample";

const NOW = { today: "2026-10-18", tz: "Europe/London" };
const NOW_ISO = "2026-10-18T09:00:00.000Z";

describe("daily-log import io (I1)", () => {
  beforeEach(async () => {
    window.localStorage.clear();
    saveOnboardingProfile({ units: "kg", sex: "M", heightCm: 180, bodyweightKg: 86, age: 30, yearsTrainingBand: "3-5", completedAt: "2026-08-01T00:00:00Z" });
  });

  it("imports the sample, sets its goal from its own start date, and takes it all away again", async () => {
    await weighInsRepo.upsert({ id: "mine", date: "2026-10-18", loggedAt: NOW_ISO, source: "manual", schemaVersion: 1, kg: 81.5 });
    const parsed = parseDailyLog(sampleDailyLog(NOW.today).csv, NOW.today);
    const out = await commitDailyLog(parsed, { setGoal: true, pregnantOrEdHistory: false, now: NOW, unit: "kg", nowIso: NOW_ISO });
    expect(out.goal).toBe("set");
    expect(out.kept).toBe(1);
    expect(out.counts.weighIns).toBeGreaterThan(60);
    const goal = goalStore.snapshot()!;
    expect(goal).toMatchObject({ type: "lose", startDate: parsed.goal!.start, targetKg: 80, ratePctPerWeek: -0.6 });
    expect(goal.startTrendKg).toBeGreaterThan(83);
    expect(programStore.snapshot()).not.toBeNull();
    expect(hasImportedData()).toBe(true);

    await removeImportedData();
    expect(weighInsRepo.snapshot().map((w) => w.id)).toEqual(["mine"]);
    expect(foodEntriesRepo.snapshot()).toEqual([]);
    expect(sleepNightsRepo.snapshot()).toEqual([]);
    expect(stepsRepo.snapshot()).toEqual([]);
    expect(goalStore.snapshot()).toBeNull();
    expect(programStore.snapshot()).toBeNull();
    expect(hasImportedData()).toBe(false);
  });

  it("does not set the goal without the safety answer, or with a yes", async () => {
    const parsed = parseDailyLog(sampleDailyLog(NOW.today).csv, NOW.today);
    expect((await commitDailyLog(parsed, { setGoal: true, pregnantOrEdHistory: null, now: NOW, unit: "kg", nowIso: NOW_ISO })).goal).toMatch(/Answer/);
    expect((await commitDailyLog(parsed, { setGoal: true, pregnantOrEdHistory: true, now: NOW, unit: "kg", nowIso: NOW_ISO })).goal).toMatch(/maintenance/);
    expect(goalStore.snapshot()).toBeNull();
  });
});
