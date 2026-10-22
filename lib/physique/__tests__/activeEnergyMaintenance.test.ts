import { describe, expect, it } from "vitest";
import { computeExpenditure, type ExpenditureInputs } from "@/lib/physique/expenditure";
import type { JudgeInputs } from "@/lib/physique/judge";
import type { DailyVitals } from "@/lib/physique/types";
import { analyse, fixedCut, inputsOf, NOW } from "@/lib/physique/__tests__/judgeHelpers";

/**
 * IN8: active energy from Apple Health explains stalls; it never feeds the
 * maintenance estimate, which is worked back from intake and the trend. A
 * watch's energy figure is rough, and adding "calories burned" to the
 * budget is the double count this app avoids.
 */

// Compile-time: neither the estimate's inputs nor the judge's take Apple Health's day records.
type Takes<T> = "vitals" extends keyof T ? true : false;
const expenditureTakesVitals: Takes<ExpenditureInputs> = false;
const judgeTakesVitals: Takes<JudgeInputs> = false;

/** Every day of the scenario with a big, rising active energy and a long run, as a heavy watch user would have. */
function vitalsFor(dates: readonly string[]): DailyVitals[] {
  return dates.map((date, i) => ({
    id: `hk-v-${date}`,
    date,
    loggedAt: `${date}T23:00:00.000Z`,
    source: "healthkit",
    schemaVersion: 1,
    activeKcal: 600 + i * 20,
    workouts: [{ activity: "run", name: "running", start: "07:00", durationMin: 60, activeKcal: 700 }],
  }));
}

describe("active energy never changes maintenance (IN8)", () => {
  it("the inputs have no place for it", () => {
    expect(expenditureTakesVitals).toBe(false);
    expect(judgeTakesVitals).toBe(false);
  });

  it("the expenditure series is the same with or without a year of active energy beside it", () => {
    const sc = fixedCut({ deficit: 600, days: 120 });
    const base: ExpenditureInputs = { profile: sc.profile, weighIns: sc.weighIns, foodEntries: sc.foodEntries, dayFlags: sc.dayFlags, workouts: sc.workouts };
    const withHealth = { ...base, vitals: vitalsFor(sc.weighIns.map((w) => w.date)) };
    const a = computeExpenditure(base, NOW(sc.today));
    const b = computeExpenditure(withHealth, NOW(sc.today));
    expect(a).not.toBeNull();
    expect(b).toEqual(a);
  });

  it("the judge's maintenance and verdict are the same too", () => {
    const sc = fixedCut({ deficit: 600, days: 120 });
    const plain = analyse(sc);
    const withHealth = analyse(sc, { ...inputsOf(sc), ...({ vitals: vitalsFor(sc.weighIns.map((w) => w.date)) } as object) });
    expect(JSON.stringify(withHealth)).toBe(JSON.stringify(plain));
  });
});
