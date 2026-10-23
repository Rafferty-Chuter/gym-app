import { describe, expect, it } from "vitest";
import { addDays } from "@/lib/dates";
import { makeScenario } from "@/lib/physique/fixtures";
import {
  bestSessionE1rm,
  deloadWeeks,
  e1rmAdj,
  isCompoundLift,
  liftChangeVsPhaseStart,
  liftDerivedTrainingStatus,
  liftSeries,
  MAIN_LIFT_RULE,
  pickMainLifts,
  repRangeChanges,
  strengthStatus,
  STR_DROP_PCT,
  type LiftExposure,
  type MainLiftRule,
} from "@/lib/physique/strength";
import { nightsByDate } from "@/lib/physique/sleep";
import type { PhysiqueGoal } from "@/lib/physique/types";
import { liftWorkouts, night, pathWith } from "@/lib/physique/__tests__/helpers";

const NOW = (today: string) => ({ today, tz: "UTC" });
const START = "2026-08-01"; // a Saturday; Mon/Thu sessions fall on days 2, 5, 9, 12, 16, 19, 23, 26, 30, 33, ...

function cutGoal(startDate: string, type: PhysiqueGoal["type"] = "lose"): PhysiqueGoal {
  return {
    id: "g",
    createdAt: `${startDate}T07:00:00.000Z`,
    type,
    startDate,
    startTrendKg: 85,
    targetKg: type === "lose" ? 78 : 92,
    ratePctPerWeek: type === "lose" ? -0.6 : type === "gain" ? 0.25 : 0,
    trainingStatusAtCreation: "intermediate",
    phaseStartConfirmedAt: `${startDate}T07:00:00.000Z`,
    schemaVersion: 1,
  };
}

describe("e1RM_adj", () => {
  it("adds RIR to reps, defaults RIR to 0 and matches Epley without RIR", () => {
    expect(e1rmAdj(100, 5, 2)).toBeCloseTo(100 * (1 + 7 / 30), 9);
    expect(e1rmAdj(100, 5)).toBeCloseTo(116.667, 2); // lib/trainingMetrics estimateE1RM(100, 5) = 116.7
  });

  it("takes the best valid set, parses weights in the workout unit, and skips BW, blank and reps + RIR > 12", () => {
    const sets = [
      { weight: "100", reps: "5", rir: 2 },
      { weight: "90", reps: "8", rir: 2 },
      { weight: "60", reps: "15", rir: 0 },
      { weight: "BW", reps: "10", rir: 1 },
      { weight: "", reps: "10" },
    ];
    expect(bestSessionE1rm(sets, "kg")).toBeCloseTo(100 * (1 + 7 / 30), 6);
    expect(bestSessionE1rm(sets, "lb")).toBeCloseTo(100 * 0.45359237 * (1 + 7 / 30), 6);
    expect(bestSessionE1rm([{ weight: "60", reps: "15" }], "kg")).toBeNull();
    expect(bestSessionE1rm([{ weight: "BW", reps: "10" }], "kg")).toBeNull();
  });
});

describe("main lifts", () => {
  it("classifies compounds by library role, then by name", () => {
    expect(isCompoundLift("Back Squat")).toBe(true);
    expect(isCompoundLift("Bench Press")).toBe(true);
    expect(isCompoundLift("Conventional Deadlift")).toBe(true);
    expect(isCompoundLift("Pendlay Row")).toBe(true);
    expect(isCompoundLift("Weighted Pull-Up")).toBe(true);
    expect(isCompoundLift("Biceps Curl")).toBe(false);
    expect(isCompoundLift("Leg Curl")).toBe(false);
    expect(isCompoundLift("Lateral Raise")).toBe(false);
  });

  it("picks loaded compounds trained in ≥5 of the last 6 weeks, at most 4, most frequent first", () => {
    const days = 42;
    const workouts = liftWorkouts({
      startDate: START,
      days,
      weekdays: [1, 3, 5],
      lifts: [
        { name: "Squat", e1rmOnDay: () => 150 },
        { name: "Bench Press", e1rmOnDay: () => 110 },
        { name: "Deadlift", e1rmOnDay: (d) => (d % 7 === 2 ? 180 : null) }, // Mondays only
        { name: "Overhead Press", e1rmOnDay: () => 70 },
        { name: "Barbell Row", e1rmOnDay: (d) => (d < 14 ? 90 : null) }, // only the first 2 weeks
        { name: "Biceps Curl", e1rmOnDay: () => 40 },
        { name: "Pull-Up", e1rmOnDay: () => 100, weightText: "BW" }, // bodyweight only
      ],
    });
    const today = addDays(START, days - 1);
    const mains = pickMainLifts(workouts, "kg", NOW(today));
    expect(mains.map((m) => m.name)).toEqual(["Bench Press", "Overhead Press", "Squat", "Deadlift"]);
    expect(mains.every((m) => m.weeksTrained >= 5)).toBe(true);
    expect(mains[0].recentExposures).toBe(18);
  });

  it("returns nothing for an isolation-only history", () => {
    const workouts = liftWorkouts({ startDate: START, days: 42, lifts: [{ name: "Biceps Curl", e1rmOnDay: () => 40 }] });
    expect(pickMainLifts(workouts, "kg", NOW(addDays(START, 41)))).toEqual([]);
  });
});

describe("exclusions", () => {
  it("flags a week with under 60% of the previous 4-week median sets as a deload", () => {
    // 5 weeks of 3 sessions × 1 lift × 3 sets = 9 sets, then a week of 3 sets.
    const days = 42;
    const workouts = liftWorkouts({
      startDate: START,
      days,
      weekdays: [1, 3, 5],
      lifts: [{ name: "Squat", e1rmOnDay: (d) => (d >= 35 && d % 7 !== 2 ? null : 150) }],
    });
    const today = addDays(START, days - 1);
    const deloads = deloadWeeks(workouts, NOW(today));
    expect(deloads).toHaveLength(1);
    expect(deloads[0]).toMatchObject({ start: addDays(today, -6), end: today, sets: 3, baselineSets: 9 });
  });

  it("excludes the first 2 sessions after the median reps move by more than 3", () => {
    const ex = (i: number, reps: number): LiftExposure => ({ date: addDays(START, i), completedAt: "", e1rm: 100, sets: 3, medianReps: reps });
    const exposures = [5, 5, 5, 10, 10, 10, 10].map((r, i) => ex(i, r));
    expect(repRangeChanges(exposures)).toEqual([addDays(START, 3), addDays(START, 4)]);
    expect(repRangeChanges([5, 6, 8, 7, 5].map((r, i) => ex(i, r)))).toEqual([]);
  });

  it("excludes a session after a 4.5 h night, and after two 6.2 h manual nights", () => {
    // Two lifts, flat, except the last two sessions which are 20% down after short nights.
    const days = 49;
    const goalStart = addDays(START, 14);
    const today = addDays(START, days - 1); // day 48, a Friday; Mon/Thu sessions: 44 (Mon), 47 (Thu)
    const path = pathWith(100, [{ from: 44, to: 48, mult: 0.8 }]);
    const workouts = liftWorkouts({ startDate: START, days, lifts: [{ name: "Squat", e1rmOnDay: path }, { name: "Bench Press", e1rmOnDay: path }] });
    const d44 = addDays(START, 44);
    const d47 = addDays(START, 47);
    const nights = [night(d44, 4.5), night(addDays(d47, -1), 6.2), night(d47, 6.2)];

    const withNights = strengthStatus({ workouts, weightUnit: "kg", goal: cutGoal(goalStart), sleepNights: nights, now: NOW(today) });
    expect(withNights.status).toBe("holding");
    const squat = withNights.lifts.find((l) => l.name === "Squat")!;
    expect(squat.excluded).toEqual(expect.arrayContaining([{ date: d44, reason: "single_night" }, { date: d47, reason: "consecutive_nights" }]));
    expect(squat.postDates).not.toContain(d44);
    expect(squat.postDates).not.toContain(d47);
    expect(squat.changePct).toBeCloseTo(0, 6);

    const withoutNights = strengthStatus({ workouts, weightUnit: "kg", goal: cutGoal(goalStart), sleepNights: [], now: NOW(today) });
    expect(withoutNights.status).toBe("dropping");
  });

  it("keeps a session after a 6.2 h wearable night (under the manual threshold only)", () => {
    const days = 49;
    const today = addDays(START, days - 1);
    const path = pathWith(100, [{ from: 44, to: 48, mult: 0.8 }]);
    const workouts = liftWorkouts({ startDate: START, days, lifts: [{ name: "Squat", e1rmOnDay: path }, { name: "Bench Press", e1rmOnDay: path }] });
    const d47 = addDays(START, 47);
    const nights = [night(addDays(d47, -1), 6.2, "healthkit"), night(d47, 6.2, "healthkit")];
    const r = strengthStatus({ workouts, weightUnit: "kg", goal: cutGoal(addDays(START, 14)), sleepNights: nights, now: NOW(today) });
    expect(r.lifts[0].excluded.map((x) => x.date)).not.toContain(d47);
  });
});

describe("STR-1 status", () => {
  const STEP_SPEC = (seed: number, lifts: Array<{ name: string; changePct: number; cv?: number }>) =>
    makeScenario({
      seed,
      days: 56,
      preDays: 21,
      bodyweightKg: 85,
      goal: { ratePctPerWeek: -0.6 },
      lifts: lifts.map((l) => ({ name: l.name, startE1rm: l.name === "Squat" ? 150 : 110, profile: "step" as const, changePct: l.changePct, atDay: 35, perWeek: 2, cv: l.cv ?? 0.03 })),
    });

  function droppingRate(lifts: Array<{ name: string; changePct: number }>, N = 200): number {
    let hits = 0;
    for (let seed = 1; seed <= N; seed++) {
      const sc = STEP_SPEC(seed, lifts);
      const r = strengthStatus({ workouts: sc.workouts, weightUnit: "kg", goal: sc.goal, sleepNights: [], now: NOW(sc.today) });
      expect(r.reason).toBe("ok");
      if (r.status === "dropping") hits++;
    }
    return hits / N;
  }

  // Research F derived the 80% figure with mean-of-3 blocks; the spec uses median-of-3 (robust to one bad
  // session), whose SD is 1.16× larger, so with exactly two lifts the rate measures ~0.76 (per lift 0.875,
  // squared). We keep the median and accept ≥0.70 for two lifts; three lifts (≥2 of 3) clear 0.80 easily.
  it("two lifts with a −8% step at cut day 14 (5-week cut, 2 sessions/wk, CV 0.03) → dropping in ≥70% of seeds", () => {
    const rate = droppingRate([{ name: "Squat", changePct: -8 }, { name: "Bench Press", changePct: -8 }]);
    expect(rate, `STR-1 dropping rate over 200 seeds was ${rate.toFixed(3)}`).toBeGreaterThanOrEqual(0.7);
  });

  it("three lifts with a −8% step → dropping in ≥80% of seeds", () => {
    const rate = droppingRate([
      { name: "Squat", changePct: -8 },
      { name: "Bench Press", changePct: -8 },
      { name: "Romanian Deadlift", changePct: -8 },
    ]);
    expect(rate, `STR-1 dropping rate over 200 seeds was ${rate.toFixed(3)}`).toBeGreaterThanOrEqual(0.8);
  });

  it("one lift −8% → one-lift", () => {
    const sc = STEP_SPEC(7, [{ name: "Squat", changePct: -8, cv: 0 }, { name: "Bench Press", changePct: 0, cv: 0 }]);
    const r = strengthStatus({ workouts: sc.workouts, weightUnit: "kg", goal: sc.goal, sleepNights: [], now: NOW(sc.today) });
    expect(r.status).toBe("one-lift");
    expect(r.strOk).toBe(false);
    const squat = r.lifts.find((l) => l.name === "Squat")!;
    expect(squat.changePct).toBeLessThanOrEqual(STR_DROP_PCT);
    expect(squat.preN).toBeGreaterThanOrEqual(3);
    expect(squat.postDates).toHaveLength(3);
  });

  it("a drop inside cut days 0–13 is suppressed", () => {
    // Both lifts dip −10% on cut days 0–13 and recover; the early-cut sessions are excluded.
    const days = 56;
    const goalStart = addDays(START, 21);
    const today = addDays(START, days - 1);
    const dip = pathWith(100, [{ from: 21, to: 34, mult: 0.9 }]);
    const workouts = liftWorkouts({ startDate: START, days, lifts: [{ name: "Squat", e1rmOnDay: dip }, { name: "Bench Press", e1rmOnDay: dip }] });
    const r = strengthStatus({ workouts, weightUnit: "kg", goal: cutGoal(goalStart), sleepNights: [], now: NOW(today) });
    expect(r.status).toBe("holding");
    expect(r.strOk).toBe(true);
    for (const l of r.lifts) {
      expect(l.excluded.filter((x) => x.reason === "early_cut").map((x) => x.date)).toEqual([addDays(START, 23), addDays(START, 26), addDays(START, 30), addDays(START, 33)]);
      expect(l.changePct).toBeCloseTo(0, 6);
    }
    // Evaluated on cut day 13 with the step in place, nothing fires either: the phase is too young.
    const sc = STEP_SPEC(3, [{ name: "Squat", changePct: -8, cv: 0 }, { name: "Bench Press", changePct: -8, cv: 0 }]);
    const early = strengthStatus({ workouts: sc.workouts, weightUnit: "kg", goal: sc.goal, sleepNights: [], now: NOW(addDays(sc.goal!.startDate, 13)) });
    expect(early.status).toBe("unclear");
    expect(early.reason).toBe("phase_too_young");
    // The same step with no post-exclusion exposures yet (cut day 20): still unclear.
    const d20 = strengthStatus({ workouts: sc.workouts, weightUnit: "kg", goal: sc.goal, sleepNights: [], now: NOW(addDays(sc.goal!.startDate, 20)) });
    expect(d20.status).toBe("unclear");
  });

  it("zero main lifts → unclear; one main lift → unclear", () => {
    const sc = makeScenario({ seed: 2, days: 56, preDays: 21, bodyweightKg: 85, goal: { ratePctPerWeek: -0.6 } });
    const none = strengthStatus({ workouts: sc.workouts, weightUnit: "kg", goal: sc.goal, sleepNights: [], now: NOW(sc.today) });
    expect(none.status).toBe("unclear");
    expect(none.reason).toBe("few_main_lifts");
    expect(none.mainLifts).toBe(0);
    const one = STEP_SPEC(2, [{ name: "Squat", changePct: -8, cv: 0 }]);
    const r1 = strengthStatus({ workouts: one.workouts, weightUnit: "kg", goal: one.goal, sleepNights: [], now: NOW(one.today) });
    expect(r1.status).toBe("unclear");
    expect(r1.mainLifts).toBe(1);
    const curls = liftWorkouts({ startDate: START, days: 56, lifts: [{ name: "Biceps Curl", e1rmOnDay: () => 40 }, { name: "Leg Curl", e1rmOnDay: () => 80 }] });
    expect(strengthStatus({ workouts: curls, weightUnit: "kg", goal: cutGoal(addDays(START, 21)), sleepNights: [], now: NOW(addDays(START, 55)) }).status).toBe("unclear");
  });

  it("no pre-phase baseline (training and cut started together) → unclear with baselineMissing", () => {
    const sc = makeScenario({
      seed: 5,
      days: 35,
      preDays: 0,
      bodyweightKg: 85,
      goal: { ratePctPerWeek: -0.6 },
      lifts: [
        { name: "Squat", startE1rm: 150, profile: "step", changePct: -8, atDay: 14, perWeek: 2, cv: 0 },
        { name: "Bench Press", startE1rm: 110, profile: "step", changePct: -8, atDay: 14, perWeek: 2, cv: 0 },
      ],
    });
    const r = strengthStatus({ workouts: sc.workouts, weightUnit: "kg", goal: sc.goal, sleepNights: [], now: NOW(sc.today) });
    expect(r.status).toBe("unclear");
    expect(r.reason).toBe("no_baseline");
    expect(r.baselineMissing).toBe(true);
  });

  it("rising and holding, with strOk only inside ±3%", () => {
    const days = 56;
    const goalStart = addDays(START, 21);
    const today = addDays(START, days - 1);
    const up = liftWorkouts({ startDate: START, days, lifts: [{ name: "Squat", e1rmOnDay: pathWith(100, [{ from: 21, to: 55, mult: 1.04 }]) }, { name: "Bench Press", e1rmOnDay: pathWith(100, [{ from: 21, to: 55, mult: 1.03 }]) }] });
    const rising = strengthStatus({ workouts: up, weightUnit: "kg", goal: cutGoal(goalStart, "gain"), sleepNights: [], now: NOW(today) });
    expect(rising.status).toBe("rising");
    expect(rising.strOk).toBe(true);
    const grey = liftWorkouts({ startDate: START, days, lifts: [{ name: "Squat", e1rmOnDay: pathWith(100, [{ from: 21, to: 55, mult: 0.96 }]) }, { name: "Bench Press", e1rmOnDay: () => 100 }] });
    const holding = strengthStatus({ workouts: grey, weightUnit: "kg", goal: cutGoal(goalStart), sleepNights: [], now: NOW(today) });
    expect(holding.status).toBe("holding");
    expect(holding.strOk).toBe(false);
  });

  it("no goal → unclear, and lb weights parse through the workout unit", () => {
    const workouts = liftWorkouts({ startDate: START, days: 56, lifts: [{ name: "Squat", e1rmOnDay: () => 300 }, { name: "Bench Press", e1rmOnDay: () => 220 }] });
    expect(strengthStatus({ workouts, weightUnit: "lb", goal: null, sleepNights: [], now: NOW(addDays(START, 55)) }).reason).toBe("no_goal");
    const series = liftSeries(workouts, "lb", NOW(addDays(START, 55)));
    expect(series.find((s) => s.name === "Squat")!.exposures[0].e1rm).toBeCloseTo(300 * 0.45359237, 2);
  });

  it("liftChangeVsPhaseStart uses the last 3 usable exposures on each side", () => {
    const workouts = liftWorkouts({ startDate: START, days: 56, lifts: [{ name: "Squat", e1rmOnDay: (d) => (d < 21 ? 100 + d : 90) }, { name: "Bench Press", e1rmOnDay: () => 100 }] });
    const today = addDays(START, 55);
    const squat = liftSeries(workouts, "kg", NOW(today)).find((s) => s.name === "Squat")!;
    const change = liftChangeVsPhaseStart(squat, addDays(START, 21), { deloads: [], nights: nightsByDate([]), goal: null });
    // Pre-phase exposures on days 2, 5, 9, 12, 16, 19 → last 3 are 112, 116, 119 → median 116.
    expect(change.preDates).toEqual([addDays(START, 12), addDays(START, 16), addDays(START, 19)]);
    expect(change.preMedian).toBeCloseTo(116, 2);
    expect(change.postMedian).toBeCloseTo(90, 2);
    expect(change.changePct).toBeCloseTo((90 / 116 - 1) * 100, 2);
  });
});

describe("lift-derived training status (02 §5.2)", () => {
  const linear = (start: number, pctPerWeek: number) => (d: number) => start * (1 + (pctPerWeek / 100) * (d / 7));
  const build = (pct: number, days = 84) =>
    liftWorkouts({ startDate: START, days, lifts: [{ name: "Squat", e1rmOnDay: linear(150, pct) }, { name: "Bench Press", e1rmOnDay: linear(110, pct) }] });

  it("maps the median slope to novice / intermediate / advanced", () => {
    const today = addDays(START, 83);
    expect(liftDerivedTrainingStatus({ workouts: build(2.0), weightUnit: "kg", now: NOW(today) })?.status).toBe("novice");
    expect(liftDerivedTrainingStatus({ workouts: build(0.8), weightUnit: "kg", now: NOW(today) })?.status).toBe("intermediate");
    const adv = liftDerivedTrainingStatus({ workouts: build(0.2), weightUnit: "kg", now: NOW(today) });
    expect(adv?.status).toBe("advanced");
    expect(adv?.medianSlopePctPerWeek).toBeCloseTo(0.2, 1);
    expect(adv?.exposures).toBe(48);
  });

  it("returns null below 12 exposures or 2 main lifts, and ignores days inside a cut", () => {
    const today = addDays(START, 83);
    // One session a week: 5 weeks × 2 lifts = 10 exposures is under the gate, 6 weeks × 2 = 12 meets it.
    const twoLifts = [{ name: "Squat", e1rmOnDay: () => 150 }, { name: "Bench Press", e1rmOnDay: () => 110 }];
    const fiveWeeks = liftWorkouts({ startDate: addDays(START, 49), days: 35, weekdays: [1], lifts: twoLifts });
    expect(fiveWeeks).toHaveLength(5);
    expect(liftDerivedTrainingStatus({ workouts: fiveWeeks, weightUnit: "kg", now: NOW(today) })).toBeNull();
    const sixWeeks = liftWorkouts({ startDate: addDays(START, 42), days: 42, weekdays: [1], lifts: twoLifts });
    expect(liftDerivedTrainingStatus({ workouts: sixWeeks, weightUnit: "kg", now: NOW(today) })?.exposures).toBe(12);
    const single = liftWorkouts({ startDate: START, days: 84, lifts: [{ name: "Squat", e1rmOnDay: () => 150 }] });
    expect(liftDerivedTrainingStatus({ workouts: single, weightUnit: "kg", now: NOW(today) })).toBeNull();
    // A cut covering the last 10 weeks leaves 2 weeks of exposures: null.
    const cut = cutGoal(addDays(START, 14));
    expect(liftDerivedTrainingStatus({ workouts: build(2.0), weightUnit: "kg", now: NOW(today), goals: [cut] })).toBeNull();
    // A completed cut in the first 3 weeks leaves 9 weeks: still novice from the remaining exposures.
    const done = { ...cutGoal(START), completedAt: `${addDays(START, 20)}T07:00:00.000Z` };
    const r = liftDerivedTrainingStatus({ workouts: build(2.0), weightUnit: "kg", now: NOW(today), goals: [done] });
    expect(r?.status).toBe("novice");
    expect(r?.exposures).toBe(36);
  });
});

// ── IN14: the main-lift bar for a lifter who trains each lift once a week ──

describe("main lifts at 4 of 6 weeks with a 7-day hold (IN14)", () => {
  const OLD: MainLiftRule = { minWeeks: 5, holdDays: 0 };
  const THREE = ["Squat", "Bench Press", "Seated Cable Row"];
  const lifts = (perWeek: number, attendance: number) => THREE.map((name) => ({ name, startE1rm: name === "Squat" ? 150 : 110, profile: "step" as const, changePct: 0, atDay: 0, perWeek, cv: 0.03, attendance }));

  /** Main-lift set changes over 20 weeks, read daily, and the share of days with ≥2 main lifts (what STR-1 needs). */
  function churn(rule: MainLiftRule, seeds: number) {
    let changes = 0;
    let covered = 0;
    let days = 0;
    for (let seed = 1; seed <= seeds; seed++) {
      const sc = makeScenario({ seed, days: 182, preDays: 0, bodyweightKg: 85, goal: null, lifts: lifts(1, 0.8) });
      let prev: string | null = null;
      for (let d = 42; d < 182; d++) {
        const m = pickMainLifts(sc.workouts, "kg", NOW(addDays(sc.startDate, d)), rule).map((x) => x.key).sort();
        const key = m.join("|");
        if (prev !== null && key !== prev) changes++;
        if (m.length >= 2) covered++;
        prev = key;
        days++;
      }
    }
    return { changes: changes / seeds, coverage: covered / days };
  }

  it("a once-a-week lifter who misses one week in five keeps steady main lifts: fewer changes, reads on nearly every day", () => {
    const old = churn(OLD, 20);
    const now = churn(MAIN_LIFT_RULE, 20);
    // Measured at 50 seeds: old 6.4 changes per 20 weeks and 74 % of days covered; new 2.5 and 99 %.
    expect(now.changes, `changes per 20 weeks: old ${old.changes.toFixed(1)}, new ${now.changes.toFixed(1)}`).toBeLessThanOrEqual(old.changes / 2);
    expect(now.coverage, `days with 2+ main lifts: old ${old.coverage.toFixed(3)}, new ${now.coverage.toFixed(3)}`).toBeGreaterThanOrEqual(0.95);
    expect(now.coverage).toBeGreaterThan(old.coverage);
  });

  it("holds a lift for a week after a missed week, then lets it go", () => {
    // Four weekly Monday sessions, then none: main from the fourth, until the first leaves the 6-week window on day 42, then held 7 more days.
    const START6 = "2026-09-07";
    const days = [0, 7, 14, 21].map((d) => addDays(START6, d));
    const path = () => 100;
    const workouts = liftWorkouts({ startDate: START6, days: 22, lifts: [{ name: "Squat", e1rmOnDay: path }, { name: "Bench Press", e1rmOnDay: path }] }).filter((w) => days.includes(w.completedAt.slice(0, 10)));
    expect(workouts.length).toBeGreaterThan(0);
    const lastMet = days[3];
    expect(pickMainLifts(workouts, "kg", NOW(lastMet)).length).toBe(2);
    const metUntil = addDays(days[0], 41);
    expect(pickMainLifts(workouts, "kg", NOW(addDays(metUntil, 7))).length).toBe(2);
    expect(pickMainLifts(workouts, "kg", NOW(addDays(metUntil, 8))).length).toBe(0);
  });

  /** Flat lifts through a cut, read daily over cut days 35–56: false "down" share of reads, and status changes. */
  function falseDrops(perWeek: number, attendance: number, seeds: number) {
    let reads = 0;
    let down = 0;
    let flips = 0;
    for (let seed = 1; seed <= seeds; seed++) {
      const sc = makeScenario({ seed, days: 21 + 57, preDays: 21, bodyweightKg: 85, goal: { ratePctPerWeek: -0.6 }, lifts: lifts(perWeek, attendance) });
      let prev: string | null = null;
      for (let d = 35; d <= 56; d++) {
        const r = strengthStatus({ workouts: sc.workouts, weightUnit: "kg", goal: sc.goal, sleepNights: [], now: NOW(addDays(sc.goal!.startDate, d)) });
        if (r.status !== "unclear") {
          reads++;
          if (r.status === "dropping" || r.status === "one-lift") down++;
        }
        if (prev !== null && r.status !== prev) flips++;
        prev = r.status;
      }
    }
    return { falseDown: down / Math.max(1, reads), flips: flips / seeds };
  }

  it("STR-1 on flat lifts is no jumpier once a week than at the twice-a-week design case", () => {
    const base = falseDrops(2, 1, 60);
    const weekly = falseDrops(1, 0.8, 60);
    // Measured at 200 seeds: 7.9 % false "down" reads twice a week, 7.6 % once a week at 80 % (9.5 % at 90 %); status changes 0.89 vs 0.35 per 3 weeks.
    expect(weekly.falseDown, `false down: twice a week ${base.falseDown.toFixed(3)}, once a week ${weekly.falseDown.toFixed(3)}`).toBeLessThanOrEqual(base.falseDown + 0.03);
    expect(weekly.flips, `status changes per 3 weeks: twice a week ${base.flips.toFixed(2)}, once a week ${weekly.flips.toFixed(2)}`).toBeLessThanOrEqual(base.flips);
  });
});
