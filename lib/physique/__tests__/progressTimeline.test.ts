import { describe, expect, it } from "vitest";
import { addDays, dayDiff } from "@/lib/dates";
import { makeScenario } from "@/lib/physique/fixtures";
import { computeExpenditure } from "@/lib/physique/expenditure";
import { weekStart } from "@/lib/physique/food/week";
import { defaultRange, LIFT_FIT_MIN_DAYS, MAX_COLUMNS, progressTimeline, rangeStart, RANGE_WEEKS, WEEK_MIN_DAYS, type TimelineInputs } from "@/lib/physique/progressTimeline";

const sc = makeScenario({
  seed: 5,
  days: 120,
  preDays: 21,
  startDate: "2026-06-20",
  bodyweightKg: 85,
  trueTdeeKcal: 2800,
  intake: "toTarget",
  goal: { ratePctPerWeek: -0.5, targetKg: 78 },
  sleep: { meanH: 7.2, sdH: 0.4, source: "manual", loggedShare: 1 },
  lifts: [
    { name: "Squat", startE1rm: 140, profile: "linear", changePct: 8, perWeek: 2, cv: 0.01 },
    { name: "Bench Press", startE1rm: 100, profile: "linear", changePct: 6, perWeek: 2, cv: 0.01 },
  ],
});
const now = { today: sc.today, tz: "UTC" };
const exp = computeExpenditure({ profile: sc.profile, weighIns: sc.weighIns, foodEntries: sc.foodEntries, dayFlags: sc.dayFlags, goals: sc.goal ? [sc.goal] : [], workouts: sc.workouts, onboarding: {} }, now);
const inputs: TimelineInputs = { weighIns: sc.weighIns, foodEntries: sc.foodEntries, dayFlags: sc.dayFlags, sleepNights: sc.sleepNights, workouts: sc.workouts, program: sc.program, expenditure: exp?.series ?? null, unit: "kg" };

describe("Progress timeline (PR1)", () => {
  it("runs Monday to Sunday, the right number of weeks a range, ending today", () => {
    for (const r of ["1M", "3M", "6M"] as const) {
      const t = progressTimeline(inputs, r, now);
      expect(t.weeks).toHaveLength(RANGE_WEEKS[r]);
      expect(t.weeks[0].start).toBe(weekStart(t.weeks[0].start));
      expect(t.weeks.at(-1)!.end).toBe(sc.today);
      expect(t.weeks.at(-1)!.current).toBe(true);
      for (let k = 1; k < t.weeks.length; k++) expect(dayDiff(t.weeks[k - 1].start, t.weeks[k].start)).toBe(7);
    }
  });

  it("starts All at the week of the first data", () => {
    expect(rangeStart("All", sc.today, sc.startDate)).toBe(weekStart(sc.startDate));
    const t = progressTimeline(inputs, "All", now);
    expect(t.from).toBe(weekStart(sc.startDate));
  });

  it("takes each week's means from the days themselves", () => {
    const t = progressTimeline(inputs, "3M", now);
    const w = t.weeks.at(-2)!;
    const days = new Set(Array.from({ length: 7 }, (_, k) => addDays(w.start, k)));
    const food = sc.foodEntries.filter((e) => days.has(e.date));
    const byDay = new Map<string, number>();
    for (const e of food) byDay.set(e.date, (byDay.get(e.date) ?? 0) + e.kcal);
    const meanKcal = [...byDay.values()].reduce((a, b) => a + b, 0) / byDay.size;
    expect(w.kcal).toBeCloseTo(meanKcal, 5);
    const scale = sc.weighIns.filter((x) => days.has(x.date));
    expect(w.weightKg).toBeCloseTo(scale.reduce((a, x) => a + x.kg, 0) / scale.length, 5);
    expect(w.balanceKcal).toBeCloseTo((w.kcal as number) - (w.maintenanceKcal as number), 5);
    expect(w.sessions).toBeGreaterThan(0);
    expect(w.hardSets).toBeGreaterThan(0);
    expect(w.sleepH).toBeGreaterThan(6);
  });

  it("leaves a measure out of a week with fewer than three days of it", () => {
    const last = progressTimeline(inputs, "3M", now).weeks.at(-2)!;
    const keep = new Set([last.start, addDays(last.start, 1)]);
    const sparse = { ...inputs, foodEntries: sc.foodEntries.filter((e) => e.date < last.start || e.date > last.end || keep.has(e.date)) };
    const w = progressTimeline(sparse, "3M", now).weeks.at(-2)!;
    expect(w.foodDays).toBe(2);
    expect(WEEK_MIN_DAYS).toBe(3);
    expect(w.kcal).toBeNull();
    expect(w.balanceKcal).toBeNull();
  });

  it("reads strength rising when the lifts rise, and weight falling on a cut", () => {
    const t = progressTimeline(inputs, "3M", now);
    expect(t.summary.strengthPct).toBeGreaterThan(1);
    expect(t.summary.trendChangeKg).toBeLessThan(0);
    expect(t.summary.balanceKcal).toBeLessThan(0);
    expect(t.lifts).toEqual(expect.arrayContaining(["Squat", "Bench Press"]));
  });

  it("is empty but well formed with no data at all", () => {
    const t = progressTimeline({ ...inputs, weighIns: [], foodEntries: [], sleepNights: [], workouts: [], program: null, expenditure: null }, "All", now);
    expect(t.weeks).toHaveLength(1);
    expect(t.summary.kcal).toBeNull();
    expect(t.days).toEqual([]);
  });

  it("puts a long history into columns of several weeks, never more than MAX_COLUMNS (C7)", () => {
    const first = addDays(sc.today, -7 * 60);
    const old = Array.from({ length: 60 * 7 }, (_, k) => ({ ...sc.weighIns[0], id: `old-${k}`, date: addDays(first, k), kg: 90 - k * 0.01 }));
    const t = progressTimeline({ ...inputs, weighIns: [...old, ...sc.weighIns] }, "All", now);
    expect(t.periodWeeks).toBe(3);
    expect(t.weeks.length).toBeLessThanOrEqual(MAX_COLUMNS);
    expect(t.from <= first).toBe(true);
    expect(t.weeks.at(-1)!.end).toBe(sc.today);
    expect(t.weeks.at(-1)!.current).toBe(true);
    for (let k = 1; k < t.weeks.length; k++) expect(dayDiff(t.weeks[k - 1].start, t.weeks[k].start)).toBe(21);
    expect(progressTimeline(inputs, "6M", now).periodWeeks).toBe(1);
  });
});

describe("Progress timeline: each main lift in kg (PR3, X1)", () => {
  it("gives each main lift its best estimated 1RM a week, on the same columns", () => {
    const t = progressTimeline(inputs, "3M", now);
    expect(t.liftWeeks.map((l) => l.name)).toEqual(t.lifts);
    for (const l of t.liftWeeks) {
      expect(l.e1rmKg).toHaveLength(t.weeks.length);
      const present = l.e1rmKg.filter((v): v is number => v != null);
      expect(present.length).toBeGreaterThanOrEqual(t.weeks.length - 1);
    }
    const squat = t.liftWeeks.find((l) => l.name === "Squat")!;
    // Squat starts at 140 kg and rises 8% over the 120 days: the weekly bests sit in that range.
    for (const v of squat.e1rmKg) {
      if (v == null) continue;
      expect(v).toBeGreaterThan(130);
      expect(v).toBeLessThan(160);
    }
  });

  it("draws a rising line through a rising lift, and none from too few weeks", () => {
    const t = progressTimeline(inputs, "3M", now);
    const squat = t.liftWeeks.find((l) => l.name === "Squat")!;
    expect(squat.fit).not.toBeNull();
    expect(squat.fit!.toKg - squat.fit!.fromKg).toBeGreaterThan(2);
    const few = progressTimeline(inputs, "1M", { ...now, today: addDays(sc.startDate, 20) });
    expect(LIFT_FIT_MIN_DAYS).toBe(21);
    for (const l of few.liftWeeks) expect(l.fit).toBeNull();
  });

  it("reads sleep against the person's usual over the range, not a fixed number", () => {
    const t = progressTimeline(inputs, "3M", now);
    expect(t.summary.usualSleepH).not.toBeNull();
    expect(t.summary.usualSleepH!).toBeGreaterThan(6.8);
    expect(t.summary.usualSleepH!).toBeLessThan(7.6);
    const none = progressTimeline({ ...inputs, sleepNights: sc.sleepNights.slice(-3) }, "3M", now);
    expect(none.summary.usualSleepH).toBeNull();
  });
});

describe("Progress timeline: a lift's change only when it is clear (PR3)", () => {
  const flat = (seed: number) =>
    makeScenario({
      seed,
      days: 63,
      preDays: 21,
      startDate: addDays(sc.today, -62),
      bodyweightKg: 85,
      trueTdeeKcal: 2800,
      intake: "toTarget",
      goal: { ratePctPerWeek: -0.6, targetKg: 78 },
      sleep: { meanH: 7.2, sdH: 0.4, source: "manual", loggedShare: 1 },
      lifts: [
        { name: "Squat", startE1rm: 150, profile: "linear", changePct: 0, perWeek: 2, cv: 0.03 },
        { name: "Bench Press", startE1rm: 110, profile: "linear", changePct: 0, perWeek: 2, cv: 0.03 },
      ],
    });

  it("calls flat lifts with session-to-session noise clear at most rarely", () => {
    let clear = 0;
    let lifts = 0;
    for (let seed = 100; seed < 130; seed++) {
      const f = flat(seed);
      const t = progressTimeline({ ...inputs, weighIns: f.weighIns, foodEntries: f.foodEntries, dayFlags: f.dayFlags, sleepNights: f.sleepNights, workouts: f.workouts, program: f.program, expenditure: null }, "3M", { today: f.today, tz: "UTC" });
      for (const l of t.liftWeeks) {
        lifts += 1;
        if (l.changeKg != null) clear += 1;
      }
    }
    expect(lifts).toBe(60);
    expect(clear).toBeLessThanOrEqual(3);
  });

  it("calls a lift dropping 8% in 8 weeks clear, through 3% session noise", () => {
    const f = makeScenario({ seed: 7, days: 63, preDays: 21, startDate: addDays(sc.today, -62), bodyweightKg: 90, trueTdeeKcal: 2800, intake: "toTarget", goal: { ratePctPerWeek: -1, targetKg: 75 }, sleep: { meanH: 7.2, sdH: 0.4, source: "manual", loggedShare: 1 }, lifts: [{ name: "Squat", startE1rm: 150, profile: "linear", changePct: -8, perWeek: 2, cv: 0.03 }] });
    const t = progressTimeline({ ...inputs, weighIns: f.weighIns, foodEntries: f.foodEntries, dayFlags: f.dayFlags, sleepNights: f.sleepNights, workouts: f.workouts, program: f.program, expenditure: null }, "3M", { today: f.today, tz: "UTC" });
    const squat = t.liftWeeks.find((l) => l.name === "Squat")!;
    expect(squat.fit?.clear).toBe(true);
    expect(squat.fit!.toKg - squat.fit!.fromKg).toBeLessThan(-6);
  });

  it("calls a steadily rising lift clear, with a level from its recent weeks", () => {
    const t = progressTimeline(inputs, "3M", now);
    const squat = t.liftWeeks.find((l) => l.name === "Squat")!;
    expect(squat.fit?.clear).toBe(true);
    expect(squat.changeKg).toBeGreaterThan(2);
    expect(squat.levelKg).not.toBeNull();
    expect(squat.levelKg!).toBeGreaterThan(squat.fit!.fromKg);
  });
});

describe("Progress timeline: the range it opens on (PR3e)", () => {
  it("opens on the whole history while it is shorter than three months, then on three months", () => {
    const short = { ...inputs, weighIns: sc.weighIns.slice(-20), foodEntries: sc.foodEntries.slice(-20), sleepNights: sc.sleepNights.slice(-20), workouts: sc.workouts.slice(-6) };
    expect(defaultRange(short, now)).toBe("All");
    expect(defaultRange(inputs, now)).toBe("3M");
    expect(defaultRange({ ...inputs, weighIns: [], foodEntries: [], sleepNights: [], workouts: [] }, now)).toBe("3M");
  });
});
