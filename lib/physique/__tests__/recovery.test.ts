import { describe, expect, it } from "vitest";
import { addDays, type LocalDate } from "@/lib/dates";
import { BASELINE_MIN_VALID, RECENT_MIN_VALID, STAGE_TYPICAL_MIN_NIGHTS, recoveryRead, stageSplit, stageTypical } from "@/lib/physique/recovery";
import type { SleepNight } from "@/lib/physique/types";
import { night } from "@/lib/physique/__tests__/helpers";

const TODAY: LocalDate = "2026-10-17";

/** `count` healthkit nights ending today with a deterministic wobble on HRV and RHR, and an override for the last `tail` days. */
function watchNights(count: number, over: (daysAgo: number) => Partial<SleepNight> = () => ({}), method: SleepNight["hrvMethod"] = "sdnn"): SleepNight[] {
  const out: SleepNight[] = [];
  for (let i = count - 1; i >= 0; i--) {
    const date = addDays(TODAY, -i);
    const wobble = ((i * 7) % 5) - 2; // −2..2, mean 0
    out.push({ ...night(date, 7.4, "healthkit"), hrvMs: 50 + wobble, hrvMethod: method, restingHr: 50 + (wobble > 0 ? 1 : wobble < 0 ? -1 : 0), ...over(i) });
  }
  return out;
}

describe("recoveryRead (02 §7.4)", () => {
  it("says nothing without watch data, and calibrates until the windows fill", () => {
    expect(recoveryRead([night("2026-10-16", 7), night(TODAY, 7.5)], TODAY).status).toBe("none");
    const few = recoveryRead(watchNights(10), TODAY);
    expect(few.status).toBe("calibrating");
    expect(few.word).toBe("Calibrating");
    expect(few.detail).toBe(`10 of ${BASELINE_MIN_VALID + RECENT_MIN_VALID} nights with watch data`);
  });

  it("green when the last week sits on the baseline", () => {
    const r = recoveryRead(watchNights(40), TODAY);
    expect(r.status).toBe("green");
    expect(r.word).toBe("As usual");
    expect(r.flags).toEqual([]);
    expect(r.hrv).toMatchObject({ recent: 50, baseline: 50, method: "sdnn", recentDays: 7 });
    expect(r.rhr).toMatchObject({ recent: 50, baseline: 50 });
    expect(r.detail).toBe("HRV 50 ms, usually 50 · resting HR 50, usually 50 · last 7 days");
  });

  it("amber on an HRV drop that held for the last five days, red when resting HR rises too", () => {
    const hrvDown = recoveryRead(watchNights(40, (i) => (i < 6 ? { hrvMs: 40 } : {})), TODAY);
    expect(hrvDown.status).toBe("amber");
    expect(hrvDown.flags).toEqual(["hrv"]);
    expect(hrvDown.word).toBe("Below usual");
    expect(hrvDown.hrv!.z).toBeLessThan(-0.75);
    const both = recoveryRead(watchNights(40, (i) => (i < 6 ? { hrvMs: 40, restingHr: 56 } : {})), TODAY);
    expect(both.status).toBe("red");
    expect(both.flags).toEqual(["hrv", "rhr"]);
    expect(both.word).toBe("Well below usual");
  });

  it("one bad night is not a flag, and short sleep counts as the third flag", () => {
    const oneNight = recoveryRead(watchNights(40, (i) => (i === 0 ? { hrvMs: 30, restingHr: 60 } : {})), TODAY);
    expect(oneNight.flags).toEqual([]);
    const withSleep = recoveryRead(watchNights(40), TODAY, true);
    expect(withSleep.status).toBe("amber");
    expect(withSleep.flags).toEqual(["sleep"]);
    expect(withSleep.detail).toMatch(/sleep short/);
  });

  it("a change of HRV method restarts the HRV baseline; resting HR still reads", () => {
    const nights = watchNights(40, (i) => (i < 5 ? { hrvMethod: "rmssd" as const, hrvMs: 70 } : {}));
    const r = recoveryRead(nights, TODAY);
    expect(r.hrv).toBeNull();
    expect(r.rhr).not.toBeNull();
    expect(r.status).toBe("green");
  });

  it("splits stages for display and returns null without them", () => {
    expect(stageSplit(night(TODAY, 7))).toBeNull();
    expect(stageSplit({ ...night(TODAY, 7, "healthkit"), stages: { deepMin: 70, remMin: 95, coreMin: 240, awakeMin: 21 } })).toEqual({ deepMin: 70, remMin: 95, coreMin: 240, awakeMin: 21, asleepMin: 405 });
    expect(stageSplit({ ...night(TODAY, 7, "healthkit"), stages: { awakeMin: 21 } })).toBeNull();
  });

  it("the usual stage shares need five nights with stages, as medians", () => {
    const staged = (i: number, deep: number) => ({ ...night(addDays(TODAY, -i), 7, "healthkit"), stages: { deepMin: deep, remMin: 90, coreMin: 300 - deep, awakeMin: 30 } });
    const four = [0, 1, 2, 3].map((i) => staged(i, 60));
    expect(stageTypical(four, TODAY)).toBeNull();
    const five = [...four, staged(4, 90)];
    expect(five.length).toBe(STAGE_TYPICAL_MIN_NIGHTS);
    const t = stageTypical(five, TODAY)!;
    expect(t.deep).toBeCloseTo(60 / 420, 5);
    expect(t.awake).toBeCloseTo(30 / 420, 5);
    expect(t.deep + t.rem + t.core + t.awake).toBeCloseTo(1, 5);
  });
});
