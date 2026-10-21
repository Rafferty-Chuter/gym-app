// @vitest-environment happy-dom
import { beforeEach, describe, expect, it } from "vitest";
import { saveOnboardingProfile } from "@/lib/onboardingProfile";
import { STORAGE_CHANGED_EVENT } from "@/lib/storage/kv";
import { foodEntriesRepo, goalStore, profileStore, programStore, sleepNightsRepo, stepsRepo, weighInsRepo } from "@/lib/physique/io/repos";
import { commitDailyLog, hasImportedData, removeImportedData } from "@/lib/physique/io/dailyLogImport";
import { createGoal, loadGoalContext } from "@/lib/physique/io/goalSetup";
import { computeExpenditure } from "@/lib/physique/expenditure";
import { parseDailyLog } from "@/lib/import/dailyLog";
import { sampleDailyLog } from "@/lib/import/sample";
import { macroFactorWorkbookDays } from "@/lib/import/macroFactor";
import { readXlsx } from "@/lib/import/xlsx";
import { macroFactorSampleXlsx, MF_DAYS, MF_FIRST, MF_TODAY } from "@/lib/import/__tests__/macroFactorSample";

const NOW = { today: "2026-10-18", tz: "Europe/London" };
const NOW_ISO = "2026-10-18T09:00:00.000Z";

describe("daily-log import io (I1)", () => {
  beforeEach(async () => {
    window.localStorage.clear();
    // Drop every store's cached snapshot too (an event with no key reaches them all).
    window.dispatchEvent(new CustomEvent(STORAGE_CHANGED_EVENT));
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

  it("a MacroFactor export after setup: maintenance from its history straight away, a second import adds nothing, removal puts the start back (TR7)", async () => {
    const now = { today: MF_TODAY, tz: "Europe/London" };
    // Setup first, as a tester would: a goal from today fixes where maintenance starts.
    const set = await createGoal(loadGoalContext(now, "kg"), { targetKg: 80, ratePctPerWeek: -0.5, status: "intermediate" }, now, { startToday: true, safety: { pregnantOrEdHistory: false }, nowIso: NOW_ISO });
    expect(set.ok).toBe(true);
    expect(profileStore.snapshot()?.expenditureStartDate).toBe(MF_TODAY);
    expect(computeExpenditure(loadGoalContext(now, "kg").inputs, now)?.maturity.state).toBe("calibrating");

    const parsed = await macroFactorWorkbookDays(await readXlsx(macroFactorSampleXlsx({ compress: true })), MF_TODAY);
    const out = await commitDailyLog(parsed, { setGoal: false, pregnantOrEdHistory: null, now, unit: "kg", nowIso: NOW_ISO });
    expect(out.days).toBe(MF_DAYS);
    expect(out.counts.food).toBe(MF_DAYS - 2);
    expect(profileStore.snapshot()?.expenditureStartDate).toBe(MF_FIRST);
    const exp = computeExpenditure(loadGoalContext(now, "kg").inputs, now)!;
    expect(exp.maturity.state).toBe("stable");
    // The sample eats about 2,200 a day while losing about 0.4 kg a week: maintenance near 2,650.
    expect(exp.maturity.kcal).toBeGreaterThan(2450);
    expect(exp.maturity.kcal).toBeLessThan(2850);
    expect(goalStore.snapshot()?.id).toBe(set.ok ? set.goal.id : null);

    const stored = JSON.stringify([weighInsRepo.snapshot(), foodEntriesRepo.snapshot(), stepsRepo.snapshot()]);
    const again = await commitDailyLog(parsed, { setGoal: false, pregnantOrEdHistory: null, now, unit: "kg", nowIso: "2026-10-18T10:00:00.000Z" });
    expect(again.days).toBe(0);
    expect(again.sameDays).toBe(MF_DAYS);
    expect(again.counts).toEqual({ weighIns: 0, food: 0, nights: 0, steps: 0 });
    expect(JSON.stringify([weighInsRepo.snapshot(), foodEntriesRepo.snapshot(), stepsRepo.snapshot()])).toBe(stored);

    await removeImportedData();
    expect(profileStore.snapshot()?.expenditureStartDate).toBe(MF_TODAY);
    expect(weighInsRepo.snapshot()).toEqual([]);
    expect(goalStore.snapshot()?.id).toBe(set.ok ? set.goal.id : null);
  });
});
