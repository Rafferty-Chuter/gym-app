// @vitest-environment happy-dom
import { beforeEach, describe, expect, it } from "vitest";
import { mergeSamples } from "@/lib/physique/io/healthLink";
import { healthOptInStore, setHealthOptIn } from "@/lib/physique/io/healthOptIn";
import { unaskedTypes, wantedTypes } from "@/lib/physique/io/nativeHealth";
import { sleepNightsRepo, stepsRepo, vitalsRepo, weighInsRepo } from "@/lib/physique/io/repos";
import { withHealthPeriods, wristTempRead, WRIST_USUAL_MIN } from "@/lib/physique/healthDays";
import { addDays } from "@/lib/dates";
import type { DailyVitals, DayFlags } from "@/lib/physique/types";

const at = "2026-10-18T08:00:00.000Z";
const row = (metric: string, day: string, value: Record<string, unknown>) => ({ metric, day, value, source: null, received_at: at });
const day = (date: string) => vitalsRepo.snapshot().find((v) => v.id === `hk-v-${date}`);

describe("more from Apple Health into the day records (IN8)", () => {
  beforeEach(async () => {
    await sleepNightsRepo.clear();
    await weighInsRepo.clear();
    await stepsRepo.clear();
    await vitalsRepo.clear();
    await healthOptInStore.clear();
  });

  it("keeps the day totals and workouts on the day's record, beside its HRV", async () => {
    const run = { activity: "run", name: "Outdoor Run", start: "07:02", durationMin: 42, activeKcal: 410 };
    await mergeSamples([
      row("hrv", "2026-10-18", { value: 48, at: "2026-10-18T03:00:00" }),
      row("activeEnergy", "2026-10-18", { value: 512, at: "2026-10-18T00:00:00" }),
      row("water", "2026-10-18", { value: 1800, at: "2026-10-18T00:00:00" }),
      row("caffeine", "2026-10-18", { value: 190, at: "2026-10-18T00:00:00" }),
      row("sodium", "2026-10-18", { value: 2400, at: "2026-10-18T00:00:00" }),
      row("alcohol", "2026-10-18", { value: 3, at: "2026-10-18T00:00:00" }),
      row("workouts", "2026-10-18", { workouts: [run] }),
    ]);
    expect(day("2026-10-18")).toMatchObject({ source: "healthkit", hrvMs: 48, activeKcal: 512, waterMl: 1800, caffeineMg: 190, sodiumMg: 2400, alcoholDrinks: 3, workouts: [run] });
    // A day total is never stored as zero: nothing logged is unknown.
    await mergeSamples([row("caffeine", "2026-10-19", { value: 0, at: "2026-10-19T00:00:00" })]);
    expect(day("2026-10-19")).toBeUndefined();
  });

  it("drops wrist temperature and cycle unless the person opted in", async () => {
    const rows = [row("wristTemp", "2026-10-18", { value: 35.6, at: "2026-10-17T23:10:00" }), row("cycle", "2026-10-18", { flow: "medium", cycleStart: true })];
    await mergeSamples(rows);
    expect(day("2026-10-18")).toBeUndefined();
    await setHealthOptIn("wristTemp", true, at);
    await setHealthOptIn("cycle", true, at);
    await mergeSamples(rows);
    expect(day("2026-10-18")).toMatchObject({ wristTempC: 35.6, menstrualFlow: "medium", cycleStart: true });
  });

  it("turning an opt-in off deletes what was read for it, and nothing else", async () => {
    await setHealthOptIn("wristTemp", true, at);
    await setHealthOptIn("cycle", true, at);
    await mergeSamples([row("wristTemp", "2026-10-18", { value: 35.6, at: "" }), row("cycle", "2026-10-18", { flow: "light", cycleStart: false }), row("activeEnergy", "2026-10-18", { value: 400, at: "" })]);
    await setHealthOptIn("cycle", false, at);
    const v = day("2026-10-18");
    expect(v).toMatchObject({ wristTempC: 35.6, activeKcal: 400 });
    expect(v?.menstrualFlow).toBeUndefined();
    expect(v?.cycleStart).toBeUndefined();
    expect(healthOptInStore.snapshot()).toMatchObject({ wristTemp: true, cycle: false });
  });

  it("a clear from the iPhone's read removes a value from a day held, and makes no empty days", async () => {
    await mergeSamples([row("caffeine", "2026-10-18", { value: 190, at: "" }), row("workouts", "2026-10-18", { workouts: [{ activity: "walk", name: "Walk", start: "12:00", durationMin: 20 }] }), row("water", "2026-10-18", { value: 900, at: "" })]);
    await mergeSamples([row("caffeine", "2026-10-18", { clear: true }), row("workouts", "2026-10-18", { workouts: [] }), row("caffeine", "2026-10-17", { clear: true })]);
    const v = day("2026-10-18");
    expect(v?.caffeineMg).toBeUndefined();
    expect(v?.workouts).toBeUndefined();
    expect(v?.waterMl).toBe(900);
    expect(day("2026-10-17")).toBeUndefined();
  });
});

describe("what the iPhone app asks HealthKit for (IN8)", () => {
  it("asks for the new kinds, the HealthExtras ones only in a build that has it, and the opt-ins only when on", () => {
    expect(wantedTypes({}, false)).toEqual(["sleep", "weight", "bodyFat", "heartRateVariability", "restingHeartRate", "steps", "calories", "dietaryWater", "workouts"]);
    const all = wantedTypes({ wristTemp: true, cycle: true }, true);
    expect(all).toEqual(expect.arrayContaining(["dietaryCaffeine", "dietarySodium", "numberOfAlcoholicBeverages", "appleSleepingWristTemperature", "menstrualFlow"]));
    // Cycle is read through HealthExtras, so an older build never asks for it.
    expect(wantedTypes({ cycle: true }, false)).not.toContain("menstrualFlow");
  });

  it("a link made before IN8 was asked for the standard kinds only", () => {
    expect(unaskedTypes({}, wantedTypes({}, true))).toEqual(["calories", "dietaryWater", "workouts", "dietaryCaffeine", "dietarySodium", "numberOfAlcoholicBeverages"]);
    expect(unaskedTypes({ asked: wantedTypes({}, true) }, wantedTypes({ wristTemp: true }, true))).toEqual(["appleSleepingWristTemperature"]);
  });
});

describe("what the opt-in kinds feed (IN8)", () => {
  const v = (date: string, extra: Partial<DailyVitals>): DailyVitals => ({ id: `hk-v-${date}`, date, loggedAt: "", source: "healthkit", schemaVersion: 1, ...extra });

  it("a period day from Apple Health reads as a logged period, once, and the flags object is kept when there is none", () => {
    const flags: Record<string, DayFlags> = { "2026-10-02": { date: "2026-10-02", status: "partial" }, "2026-10-03": { date: "2026-10-03", events: [{ type: "period" }] } };
    const out = withHealthPeriods(flags, [v("2026-10-01", { menstrualFlow: "medium", cycleStart: true }), v("2026-10-02", { menstrualFlow: "light" }), v("2026-10-03", { menstrualFlow: "light" }), v("2026-10-04", { menstrualFlow: "none" })]);
    expect(out["2026-10-01"]).toEqual({ date: "2026-10-01", events: [{ type: "period" }] });
    expect(out["2026-10-02"]).toEqual({ date: "2026-10-02", status: "partial", events: [{ type: "period" }] });
    expect(out["2026-10-03"].events).toHaveLength(1);
    expect(out["2026-10-04"]).toBeUndefined();
    expect(flags["2026-10-01"]).toBeUndefined();
    expect(withHealthPeriods(flags, [v("2026-10-05", { activeKcal: 300 })])).toBe(flags);
  });

  it("a night's wrist temperature against the usual of the four weeks before, once a week of nights is in", () => {
    const nights = Array.from({ length: WRIST_USUAL_MIN }, (_, i) => v(addDays("2026-10-18", -(i + 1)), { wristTempC: 35.4 + (i % 2) * 0.2 }));
    expect(wristTempRead([...nights, v("2026-10-18", { wristTempC: 36.1 })], "2026-10-18")).toEqual({ c: 36.1, usualC: 35.4 });
    expect(wristTempRead([...nights.slice(1), v("2026-10-18", { wristTempC: 36.1 })], "2026-10-18")).toEqual({ c: 36.1, usualC: null });
    expect(wristTempRead(nights, "2026-10-18")).toBeNull();
  });
});
