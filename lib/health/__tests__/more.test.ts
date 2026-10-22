import { describe, expect, it } from "vitest";
import { parseHaePayload, sampleValue, type HealthSample } from "@/lib/health/hae";
import { clearRows, nativeSamples, type NativeRead } from "@/lib/health/native";
import { entryDays, healthActivity, menstrualFlow, mergeWorkoutDay, toCelsius, toKcal, toMg, toMl, workoutsFromValue, wristTempDay } from "@/lib/health/extras";
import type { HealthWorkout } from "@/lib/physique/types";

const TZ = "Europe/London";
const of = <K extends HealthSample["kind"]>(samples: readonly HealthSample[], kind: K) => samples.filter((s): s is Extract<HealthSample, { kind: K }> => s.kind === kind);

describe("more from Apple Health: shared mapping (IN8)", () => {
  it("groups HealthKit's activity types and Health Auto Export's names the same way", () => {
    expect(healthActivity("running")).toBe("run");
    expect(healthActivity("Outdoor Run")).toBe("run");
    expect(healthActivity("traditionalStrengthTraining")).toBe("strength");
    expect(healthActivity("Functional Strength Training")).toBe("strength");
    expect(healthActivity("cycling")).toBe("cycle");
    expect(healthActivity("Indoor Walk")).toBe("walk");
    expect(healthActivity("hiking")).toBe("walk");
    expect(healthActivity("highIntensityIntervalTraining")).toBe("cardio");
    expect(healthActivity("stairClimbing")).toBe("cardio");
    expect(healthActivity("Skipping")).toBe("cardio");
    expect(healthActivity("rowingMachine")).toBe("row");
    expect(healthActivity("yoga")).toBe("mobility");
    expect(healthActivity("soccer")).toBe("sport");
    expect(healthActivity("curling")).toBe("sport");
    expect(healthActivity("wheelchairRunPace")).toBe("other");
    expect(healthActivity("Something new")).toBe("other");
  });

  it("converts the units an export can name into the stored ones", () => {
    expect(toKcal(418.4, "kJ")).toBeCloseTo(100);
    expect(toKcal(250, "kcal")).toBe(250);
    expect(toMl(1.5, "L")).toBe(1500);
    expect(toMl(10, "fl_oz_us")).toBeCloseTo(295.7, 1);
    expect(toMl(250, "mL")).toBe(250);
    expect(toMg(0.2, "g")).toBe(200);
    expect(toMg(95, "mg")).toBe(95);
    expect(toCelsius(96.8, "degF")).toBeCloseTo(36);
    expect(toCelsius(35.6, "degC")).toBe(35.6);
  });

  it("spreads a period entry over its days, ending a day's entry at the next midnight on that day", () => {
    expect(entryDays({ day: "2026-02-01", clock: "00:00" }, { day: "2026-02-05", clock: "23:59" })).toEqual(["2026-02-01", "2026-02-02", "2026-02-03", "2026-02-04", "2026-02-05"]);
    expect(entryDays({ day: "2026-02-01", clock: "00:00" }, { day: "2026-02-02", clock: "00:00" })).toEqual(["2026-02-01"]);
    expect(entryDays({ day: "2026-02-01", clock: "00:00" }, { day: "2026-03-01", clock: "00:00" })).toBeNull();
    expect(menstrualFlow("Medium")).toBe("medium");
    expect(menstrualFlow(4)).toBe("heavy");
    expect(menstrualFlow(5)).toBe("none");
    expect(menstrualFlow("Spotting")).toBeNull();
  });

  it("puts an evening wrist-temperature reading on the night that wakes the next day", () => {
    expect(wristTempDay({ day: "2026-10-18", clock: "23:10" })).toBe("2026-10-19");
    expect(wristTempDay({ day: "2026-10-19", clock: "00:40" })).toBe("2026-10-19");
  });

  it("merges a day's workouts with the ones already held, one per start and kind", () => {
    const a: HealthWorkout = { activity: "run", name: "Outdoor Run", start: "07:00", durationMin: 30 };
    const b: HealthWorkout = { activity: "strength", name: "Traditional Strength Training", start: "18:00", durationMin: 60 };
    expect(mergeWorkoutDay([a], [b])).toEqual([a, b]);
    expect(mergeWorkoutDay([a, b], [{ ...a, durationMin: 32 }])).toEqual([{ ...a, durationMin: 32 }, b]);
    expect(workoutsFromValue({ workouts: [a, { name: "x", start: "bad", durationMin: 3 }, { ...b, durationMin: -1 }] })).toEqual([a]);
    expect(workoutsFromValue({})).toBeNull();
  });
});

describe("Health Auto Export: more metrics, workouts and cycle (IN8)", () => {
  const payload = {
    data: {
      metrics: [
        { name: "active_energy", units: "kJ", data: [{ date: "2026-10-18 00:00:00 +0100", qty: 2092, source: "Watch" }] },
        { name: "dietary_water", units: "L", data: [{ date: "2026-10-18 00:00:00 +0100", qty: 1.8 }] },
        { name: "dietary_caffeine", units: "mg", data: [{ date: "2026-10-18 00:00:00 +0100", qty: 190 }, { date: "2026-10-17 00:00:00 +0100", qty: 0 }] },
        { name: "sodium", units: "g", data: [{ date: "2026-10-18 00:00:00 +0100", qty: 2.4 }] },
        { name: "number_of_alcoholic_beverages", units: "count", data: [{ date: "2026-10-18 00:00:00 +0100", qty: 3 }] },
        { name: "apple_sleeping_wrist_temperature", units: "degF", data: [{ date: "2026-10-18 23:20:00 +0100", qty: 96.26 }] },
      ],
      workouts: [
        { id: "a", name: "Outdoor Run", start: "2026-10-18 07:02:00 +0100", end: "2026-10-18 07:44:00 +0100", duration: 2520, activeEnergyBurned: { qty: 410, units: "kcal" }, distance: { qty: 5.2, units: "km" } },
        { id: "b", name: "Traditional Strength Training", start: "2026-10-18 18:00:00 +0100", end: "2026-10-18 19:05:00 +0100", duration: 3900 },
        // Version 1: no duration, energy as `activeEnergy`.
        { name: "Cycling", start: "2026-10-17 12:00:00 +0100", end: "2026-10-17 13:30:00 +0100", activeEnergy: { qty: 2510, units: "kJ" } },
        { name: "Broken", start: "nope", end: "2026-10-17 13:30:00 +0100", duration: 60 },
      ],
      cycleTracking: [
        { start: "2026-10-01 00:00:00 +0100", end: "2026-10-03 23:59:59 +0100", name: "Menstrual Flow", value: "Medium", isCycleStart: true },
        { start: "2026-10-05 00:00:00 +0100", end: "2026-10-05 23:59:59 +0100", name: "Ovulation Test Result", value: "Positive" },
      ],
    },
  };
  const samples = parseHaePayload(payload);

  it("reads the day totals in their stored units, and leaves a zero day as unknown", () => {
    expect(of(samples, "activeEnergy")).toMatchObject([{ day: "2026-10-18", value: 500 }]);
    expect(of(samples, "water")).toMatchObject([{ value: 1800 }]);
    expect(of(samples, "caffeine")).toEqual([expect.objectContaining({ day: "2026-10-18", value: 190 })]);
    expect(of(samples, "sodium")).toMatchObject([{ value: 2400 }]);
    expect(of(samples, "alcohol")).toMatchObject([{ value: 3 }]);
    expect(of(samples, "wristTemp")).toMatchObject([{ day: "2026-10-19", value: 35.7 }]);
  });

  it("reads workouts by start day, version 2 and version 1", () => {
    const [day17, day18] = of(samples, "workouts").sort((a, b) => (a.day < b.day ? -1 : 1));
    expect(day18.day).toBe("2026-10-18");
    expect(day18.workouts).toEqual([
      { activity: "run", name: "Outdoor Run", start: "07:02", durationMin: 42, activeKcal: 410, distanceM: 5200 },
      { activity: "strength", name: "Traditional Strength Training", start: "18:00", durationMin: 65 },
    ]);
    expect(day17.workouts).toEqual([{ activity: "cycle", name: "Cycling", start: "12:00", durationMin: 90, activeKcal: 600 }]);
    expect(sampleValue(day18)).toEqual({ workouts: day18.workouts });
  });

  it("spreads a period over its days, with the cycle start on the first, and skips other cycle entries", () => {
    expect(of(samples, "cycle").map((c) => [c.day, c.flow, c.cycleStart])).toEqual([
      ["2026-10-01", "medium", true],
      ["2026-10-02", "medium", false],
      ["2026-10-03", "medium", false],
    ]);
  });

  it("a payload of metrics only still parses as before", () => {
    expect(parseHaePayload({ data: { metrics: [{ name: "step_count", units: "count", data: [{ date: "2026-10-18 00:00:00 +0100", qty: 9000 }] }] } })).toMatchObject([{ kind: "steps", value: 9000 }]);
    expect(parseHaePayload({ data: { workouts: [] } })).toEqual([]);
  });
});

describe("iPhone app: more from HealthKit (IN8)", () => {
  const read: NativeRead = {
    sleep: [],
    weight: [],
    bodyFat: [],
    hrv: [],
    rhr: [],
    steps: [],
    activeEnergy: [{ startDate: "2026-10-17T23:00:00.000Z", value: 512.6 }],
    water: [{ startDate: "2026-10-17T23:00:00.000Z", value: 2.25 }],
    caffeine: [{ startDate: "2026-10-17T23:00:00.000Z", value: 180 }],
    sodium: [{ startDate: "2026-10-17T23:00:00.000Z", value: 2300 }],
    alcohol: [{ startDate: "2026-10-17T23:00:00.000Z", value: 2 }],
    workouts: [
      { workoutType: "running", duration: 1800, totalEnergyBurned: 350, totalDistance: 5000, startDate: "2026-10-18T06:00:00.000Z", endDate: "2026-10-18T06:30:00.000Z", sourceId: "com.apple.health.ABC" },
      { workoutType: "traditionalStrengthTraining", duration: 3600, startDate: "2026-10-18T17:00:00.000Z", endDate: "2026-10-18T18:00:00.000Z", sourceId: "com.hevyapp.hevy" },
    ],
    wristTemp: [{ value: 35.62, startDate: "2026-10-17T22:30:00.000Z", endDate: "2026-10-18T05:40:00.000Z", sourceName: "Watch" }],
    menstrual: [
      { startDate: "2026-10-17T23:00:00.000Z", endDate: "2026-10-18T23:00:00.000Z", value: 3, cycleStart: true },
      { startDate: "2026-10-18T23:00:00.000Z", endDate: "2026-10-19T23:00:00.000Z", value: 2 },
    ],
  };
  const samples = nativeSamples(read, TZ);

  it("reads the day sums on the phone's local day, water from litres", () => {
    expect(of(samples, "activeEnergy")).toMatchObject([{ day: "2026-10-18", value: 513 }]);
    expect(of(samples, "water")).toMatchObject([{ value: 2250 }]);
    expect(of(samples, "caffeine")).toMatchObject([{ value: 180 }]);
    expect(of(samples, "sodium")).toMatchObject([{ value: 2300 }]);
    expect(of(samples, "alcohol")).toMatchObject([{ value: 2 }]);
  });

  it("reads workouts with local start times, keeping another app's id but not Apple's device name", () => {
    expect(of(samples, "workouts")).toEqual([
      {
        kind: "workouts",
        day: "2026-10-18",
        workouts: [
          { activity: "run", name: "running", start: "07:00", durationMin: 30, activeKcal: 350, distanceM: 5000 },
          { activity: "strength", name: "traditionalStrengthTraining", start: "18:00", durationMin: 60, app: "com.hevyapp.hevy" },
        ],
        source: null,
      },
    ]);
  });

  it("puts the night's wrist temperature on its wake day, and a period's days with the start flagged", () => {
    expect(of(samples, "wristTemp")).toMatchObject([{ day: "2026-10-18", value: 35.62 }]);
    expect(of(samples, "cycle").map((c) => [c.day, c.flow, c.cycleStart])).toEqual([
      ["2026-10-18", "medium", true],
      ["2026-10-19", "light", false],
    ]);
  });

  it("clears days the read covered and found nothing for, only for the kinds it read", () => {
    const rows = clearRows({ ...read, caffeine: undefined, menstrual: undefined }, samples, "2026-10-17", "2026-10-18", "2026-10-18T20:00:00.000Z");
    const key = (r: { metric: string; day: string }) => `${r.metric} ${r.day}`;
    expect(rows.map(key).sort()).toEqual(["activeEnergy 2026-10-17", "alcohol 2026-10-17", "sodium 2026-10-17", "water 2026-10-17", "workouts 2026-10-17", "wristTemp 2026-10-17"]);
    expect(rows.find((r) => r.metric === "workouts")?.value).toEqual({ workouts: [] });
    expect(rows.find((r) => r.metric === "water")?.value).toEqual({ clear: true });
  });

  it("a read from an app build before IN8 has none of the new kinds and clears nothing", () => {
    const old: NativeRead = { sleep: [], weight: [], bodyFat: [], hrv: [], rhr: [], steps: [] };
    expect(nativeSamples(old, TZ)).toEqual([]);
    expect(clearRows(old, [], "2026-10-01", "2026-10-18", "2026-10-18T20:00:00.000Z")).toEqual([]);
  });
});
