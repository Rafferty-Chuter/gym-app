import { describe, expect, it } from "vitest";
import { addDays } from "@/lib/dates";
import { makeScenario } from "@/lib/physique/fixtures";
import {
  acute,
  debt7,
  mean14h,
  nightsByDate,
  nightsFromHealthKitSamples,
  sessionSleepExclusion,
  sleepCorroboration,
  sleepStatus,
  thresholdsForWindow,
  weekdayMeanH,
  windowSource,
  nightsInWindow,
  SLEEP_REFERENCE_H,
} from "@/lib/physique/sleep";
import { mainLiftSeries } from "@/lib/physique/strength";
import { liftWorkouts, night, nightsRun, pathWith } from "@/lib/physique/__tests__/helpers";

const TODAY = "2026-09-04";
const NOW = { today: TODAY, tz: "UTC" };

describe("sleep status thresholds (02 §7.2)", () => {
  function scenarioStatus(meanH: number, source: "manual" | "healthkit") {
    const sc = makeScenario({ seed: 1, days: 28, bodyweightKg: 85, goal: null, sleep: { meanH, sdH: 0, source } });
    return sleepStatus({ nights: sc.sleepNights, now: { today: sc.today, tz: "UTC" } });
  }

  it("manual 6.8 h → short", () => {
    const r = scenarioStatus(6.8, "manual");
    expect(r.status).toBe("short");
    expect(r.mean14h).toBeCloseTo(6.8, 6);
    expect(r.source).toBe("manual");
    expect(r.thresholds).toMatchObject({ kind: "manual", severeH: 6.5, shortH: 7.0 });
    expect(r.nightsLogged14).toBe(14);
  });

  it("manual 6.4 h → severe", () => {
    expect(scenarioStatus(6.4, "manual").status).toBe("severe");
  });

  it("wearable 6.8 h → ok", () => {
    const r = scenarioStatus(6.8, "healthkit");
    expect(r.status).toBe("ok");
    expect(r.source).toBe("wearable");
    expect(r.thresholds.kind).toBe("wearable");
  });

  it("wearable 6.4 h → short, 5.9 h → severe", () => {
    expect(scenarioStatus(6.4, "healthkit").status).toBe("short");
    expect(scenarioStatus(5.9, "healthkit").status).toBe("severe");
  });

  it("9 of 14 nights → unknown; 10 of 14 → a status", () => {
    const nine = nightsRun(TODAY, 14, 6.4, "manual", [TODAY, addDays(TODAY, -2), addDays(TODAY, -4), addDays(TODAY, -6), addDays(TODAY, -8)]);
    expect(nine).toHaveLength(9);
    const r = sleepStatus({ nights: nine, now: NOW });
    expect(r.status).toBe("unknown");
    expect(r.nightsLogged14).toBe(9);
    expect(r.mean14h).toBeNull();
    const ten = nightsRun(TODAY, 14, 6.4, "manual", [TODAY, addDays(TODAY, -2), addDays(TODAY, -4), addDays(TODAY, -6)]);
    expect(sleepStatus({ nights: ten, now: NOW }).status).toBe("severe");
  });

  it("a low weekday mean makes an otherwise-ok window short", () => {
    // Wearable: weekdays 6.3 h, weekends 9 h → 14-night mean ≈ 7.1 but weekday mean < 6.5.
    const nights = nightsRun(TODAY, 14, (d) => (["2026-08-22", "2026-08-23", "2026-08-29", "2026-08-30"].includes(d) ? 9 : 6.3), "healthkit");
    const r = sleepStatus({ nights, now: NOW });
    expect(r.mean14h!).toBeGreaterThan(6.5);
    expect(r.weekdayMeanH).toBeCloseTo(6.3, 6);
    expect(r.status).toBe("short");
  });

  it("mixed windows use manual thresholds at ≥50% manual", () => {
    const half = [...nightsRun(TODAY, 7, 6.8, "manual"), ...nightsRun(addDays(TODAY, -7), 7, 6.8, "healthkit")];
    expect(sleepStatus({ nights: half, now: NOW }).status).toBe("short");
    expect(sleepStatus({ nights: half, now: NOW }).source).toBe("mixed");
    const mostlyWearable = [...nightsRun(TODAY, 6, 6.8, "manual"), ...nightsRun(addDays(TODAY, -6), 8, 6.8, "healthkit")];
    expect(sleepStatus({ nights: mostlyWearable, now: NOW }).status).toBe("ok");
    expect(thresholdsForWindow(nightsInWindow(nightsByDate(mostlyWearable), TODAY)).kind).toBe("wearable");
  });

  it("keeps but never averages nights under 2 h or over 14 h", () => {
    const nights = [...nightsRun(addDays(TODAY, -1), 13, 7.5, "manual"), night(TODAY, 1.5)];
    const r = sleepStatus({ nights, now: NOW });
    expect(r.nightsLogged14).toBe(14);
    expect(r.nightsValid14).toBe(13);
    expect(r.mean14h).toBeCloseTo(7.5, 6);
    expect(r.lastNightH).toBeNull();
  });

  it("HealthKit beats a manual entry on the same wake date", () => {
    const nights = [night(TODAY, 6.0, "manual"), night(TODAY, 7.2, "healthkit")];
    const chosen = nightsByDate(nights).get(TODAY)!;
    expect(chosen.source).toBe("wearable");
    expect(chosen.asleepH).toBeCloseTo(7.2, 6);
    expect(windowSource([chosen])).toBe("wearable");
  });
});

describe("acute, debt and session exclusion", () => {
  it("acute needs two consecutive nights under the threshold, each by its own source", () => {
    const two = nightsByDate([night(addDays(TODAY, -1), 6.2), night(TODAY, 6.3)]);
    expect(acute(two, TODAY)).toBe(true);
    const one = nightsByDate([night(addDays(TODAY, -1), 7.5), night(TODAY, 6.3)]);
    expect(acute(one, TODAY)).toBe(false);
    const wearable = nightsByDate([night(addDays(TODAY, -1), 6.2, "healthkit"), night(TODAY, 6.3, "healthkit")]);
    expect(acute(wearable, TODAY)).toBe(false);
    expect(sleepStatus({ nights: [night(addDays(TODAY, -1), 6.2), night(TODAY, 6.3)], now: NOW }).acute).toBe(true);
  });

  it("debt7 sums the shortfall against the goal over logged nights", () => {
    const by = nightsByDate(nightsRun(TODAY, 7, 7));
    expect(debt7(by, TODAY, 8)).toBeCloseTo(7, 6);
    expect(debt7(by, TODAY, 7)).toBeCloseTo(0, 6);
    expect(debt7(nightsByDate([]), TODAY, 8)).toBeNull();
    // A fixed 8-hour reference since the sleep goal setting went (C8).
    expect(sleepStatus({ nights: nightsRun(TODAY, 7, 7), now: NOW }).goalH).toBe(SLEEP_REFERENCE_H);
    expect(SLEEP_REFERENCE_H).toBe(8);
  });

  it("session exclusion: under 5 h (manual 5.5 h) alone, or two nights under 6 h (manual 6.5 h)", () => {
    expect(sessionSleepExclusion(nightsByDate([night(TODAY, 4.5)]), TODAY)).toBe("single_night");
    expect(sessionSleepExclusion(nightsByDate([night(TODAY, 5.4)]), TODAY)).toBe("single_night");
    expect(sessionSleepExclusion(nightsByDate([night(TODAY, 5.4, "healthkit")]), TODAY)).toBeNull();
    expect(sessionSleepExclusion(nightsByDate([night(TODAY, 4.9, "healthkit")]), TODAY)).toBe("single_night");
    expect(sessionSleepExclusion(nightsByDate([night(addDays(TODAY, -1), 6.2), night(TODAY, 6.2)]), TODAY)).toBe("consecutive_nights");
    expect(sessionSleepExclusion(nightsByDate([night(TODAY, 6.2)]), TODAY)).toBeNull();
    expect(sessionSleepExclusion(nightsByDate([]), TODAY)).toBeNull();
  });

  it("mean14h and weekdayMeanH gate on their minimums", () => {
    expect(mean14h(nightsByDate(nightsRun(TODAY, 9, 7)), TODAY)).toBeNull();
    expect(mean14h(nightsByDate(nightsRun(TODAY, 10, 7)), TODAY)).toBeCloseTo(7, 6);
    expect(weekdayMeanH(nightsByDate(nightsRun(TODAY, 4, 7)), TODAY)).toBeNull();
  });
});

describe("SLEEP-1 corroboration", () => {
  const START = "2026-07-01";
  const days = 66;
  const today = addDays(START, days - 1);

  it("fires when ≥2 main lifts are ≥2.5% down over the last 2 weeks vs the 3 before", () => {
    const drop = pathWith(100, [{ from: days - 14, to: days, mult: 0.97 }]);
    const workouts = liftWorkouts({ startDate: START, days, lifts: [{ name: "Squat", e1rmOnDay: drop }, { name: "Bench Press", e1rmOnDay: drop }, { name: "Deadlift", e1rmOnDay: () => 100 }] });
    const r = sleepCorroboration(mainLiftSeries(workouts, "kg", { today, tz: "UTC" }), { today, tz: "UTC" });
    expect(r.liftsEligible).toBe(3);
    expect(r.liftsDown).toBe(2);
    expect(r.corroborated).toBe(true);
    const squat = r.lifts.find((l) => l.name === "Squat")!;
    expect(squat.changePct).toBeCloseTo(-3, 2);
    expect(squat.recentN).toBeGreaterThanOrEqual(2);
    expect(squat.priorN).toBeGreaterThanOrEqual(2);
  });

  it("stays quiet with one lift down, a 2% dip, or under 5 weeks of history", () => {
    const now = { today, tz: "UTC" };
    const drop = pathWith(100, [{ from: days - 14, to: days, mult: 0.97 }]);
    const one = liftWorkouts({ startDate: START, days, lifts: [{ name: "Squat", e1rmOnDay: drop }, { name: "Bench Press", e1rmOnDay: () => 100 }] });
    expect(sleepCorroboration(mainLiftSeries(one, "kg", now), now).corroborated).toBe(false);
    const small = pathWith(100, [{ from: days - 14, to: days, mult: 0.98 }]);
    const two = liftWorkouts({ startDate: START, days, lifts: [{ name: "Squat", e1rmOnDay: small }, { name: "Bench Press", e1rmOnDay: small }] });
    expect(sleepCorroboration(mainLiftSeries(two, "kg", now), now).corroborated).toBe(false);
    // 5 weeks of sessions, but the first exposure is only 33 days back: main lifts exist, SLEEP-1's history gate fails.
    const shortStart = addDays(today, -34);
    const shortDrop = pathWith(100, [{ from: 21, to: 35, mult: 0.97 }]);
    const short = liftWorkouts({ startDate: shortStart, days: 35, lifts: [{ name: "Squat", e1rmOnDay: shortDrop }, { name: "Bench Press", e1rmOnDay: shortDrop }] });
    const r = sleepCorroboration(mainLiftSeries(short, "kg", now), now);
    expect(r.lifts).toHaveLength(2);
    expect(r.lifts.every((l) => !l.eligible && l.changePct !== null && l.changePct < -2.5)).toBe(true);
    expect(r.corroborated).toBe(false);
  });
});

describe("HealthKit samples (M3 shape)", () => {
  it("merges gaps ≤15 min into one main sleep ending in the morning and drops naps", () => {
    const nights = nightsFromHealthKitSamples(
      [
        { start: "2026-09-03T22:30:00Z", end: "2026-09-04T01:00:00Z", value: "asleepCore" },
        { start: "2026-09-04T01:10:00Z", end: "2026-09-04T03:00:00Z", value: "asleepDeep" },
        { start: "2026-09-04T03:05:00Z", end: "2026-09-04T06:00:00Z", value: "asleepREM" },
        { start: "2026-09-04T22:20:00Z", end: "2026-09-04T22:45:00Z", value: "awake" },
        { start: "2026-09-04T14:00:00Z", end: "2026-09-04T14:40:00Z", value: "asleep" }, // nap
      ],
      "UTC"
    );
    expect(nights).toHaveLength(1);
    expect(nights[0]).toMatchObject({ date: "2026-09-04", source: "healthkit", bedtime: "22:30", wakeTime: "06:00", asleepMin: 435, inBedMin: 450 });
  });

  it("splits sessions across a gap over 15 min and keeps the longest one as the night", () => {
    const nights = nightsFromHealthKitSamples(
      [
        { start: "2026-09-03T20:00:00Z", end: "2026-09-04T03:30:00Z", value: "asleep" },
        { start: "2026-09-04T04:00:00Z", end: "2026-09-04T05:30:00Z", value: "asleep" },
      ],
      "UTC"
    );
    expect(nights).toHaveLength(1);
    expect(nights[0].asleepMin).toBe(450);
    expect(nights[0].wakeTime).toBe("03:30");
    expect(nights[0].date).toBe("2026-09-04");
    // A session ending before 03:00 local is not a main sleep.
    expect(nightsFromHealthKitSamples([{ start: "2026-09-03T21:00:00Z", end: "2026-09-04T02:00:00Z", value: "asleep" }], "UTC")).toEqual([]);
  });

  it("respects the timezone for the wake date", () => {
    const nights = nightsFromHealthKitSamples([{ start: "2026-09-04T13:00:00Z", end: "2026-09-04T20:30:00Z", value: "asleep" }], "Asia/Tokyo");
    // Ends 05:30 on 2026-09-05 in Tokyo.
    expect(nights[0].date).toBe("2026-09-05");
    expect(nights[0].wakeTime).toBe("05:30");
  });
});
