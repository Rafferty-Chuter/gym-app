import { describe, expect, it } from "vitest";
import { addDays } from "@/lib/dates";
import { makeScenario } from "@/lib/physique/fixtures";
import { computeExpenditure } from "@/lib/physique/expenditure";
import { buildWeekReport, reportWeekStart } from "@/lib/physique/weekReport";
import { kgPerWeekFromKcal, linkedReasons, liftsLink, recoveryLink, weightLink, type LinkInputs } from "@/lib/physique/linkedReasons";
import { bannedPhrasesIn } from "@/lib/physique/copy";
import { planMargin, rateVsPlan } from "@/lib/physique/weekScorecard";
import type { JudgeInputs } from "@/lib/physique/judge";
import type { RecoveryRead } from "@/lib/physique/recovery";
import type { WeekReport } from "@/lib/physique/weekReport";
import type { DailySteps, DayFlags, ExpenditurePoint, FoodEntry, PhysiqueAnalysis } from "@/lib/physique/types";
import { analyse, inputsOf, NOW } from "@/lib/physique/__tests__/judgeHelpers";

const FLAT = [
  { name: "Squat", startE1rm: 150, profile: "linear" as const, changePct: 0, perWeek: 2, cv: 0.01 },
  { name: "Bench Press", startE1rm: 110, profile: "linear" as const, changePct: 0, perWeek: 2, cv: 0.01 },
];
const kg = (x: number) => `${x.toFixed(1)} kg`;

function scenario(over: Partial<Parameters<typeof makeScenario>[0]> = {}) {
  return makeScenario({ seed: 21, days: 63, preDays: 21, bodyweightKg: 85, trueTdeeKcal: 2800, intake: "toTarget", goal: { ratePctPerWeek: -0.6, targetKg: 78 }, waterStepKg: 0, lifts: FLAT, sleep: { meanH: 7.8, sdH: 0.2, source: "manual", loggedShare: 1 }, ...over });
}

/** Inputs for the last complete week, as the report page builds them. */
function inputs(sc: ReturnType<typeof scenario>, over: Partial<JudgeInputs> = {}, extra: Partial<LinkInputs> = {}): LinkInputs {
  const base = inputsOf(sc, over);
  const now = NOW(sc.today);
  const exp = computeExpenditure({ profile: base.profile, weighIns: base.weighIns, foodEntries: base.foodEntries, dayFlags: base.dayFlags, goals: base.goals }, now);
  const build = (start: string) =>
    buildWeekReport(
      { weighIns: base.weighIns, foodEntries: base.foodEntries, dayFlags: base.dayFlags, sleepNights: base.sleepNights, workouts: base.workouts, program: base.program, goal: base.goal, weightUnit: "kg", expenditure: exp?.series ?? null },
      start,
      now
    );
  const start = addDays(reportWeekStart(sc.today), -7);
  return { report: build(start), prev: build(addDays(start, -7)), analysis: analyse(sc, over), goal: base.goal ?? null, recovery: null, plannedSessions: 2, kg, ...extra };
}

const LOW_HRV: RecoveryRead = {
  status: "amber",
  state: "watch",
  word: "Below usual",
  flags: ["hrv"],
  hrv: { recent: 41, baseline: 52, z: -1.4, recentDays: 6, baselineDays: 28, method: "sdnn" },
  rhr: { recent: 56, baseline: 55, z: 0.3, recentDays: 6, baselineDays: 28 },
  validNights: 34,
  detail: "HRV 41 ms against 52",
};

type Patch = {
  /** Rate over the window, %/wk; the plan is −0.6. */
  ratePct?: number;
  /** The rate's own margin, %/wk; 0.1 unless set. */
  marginPct?: number;
  win?: Partial<NonNullable<WeekReport["rateWindow"]>>;
  food?: Partial<WeekReport["food"]>;
  sleep?: Partial<WeekReport["sleep"]>;
  health?: Partial<WeekReport["health"]>;
  strength?: Partial<PhysiqueAnalysis["strength"]>;
  rate?: number;
};

/** A real week from the generator, then set to exact numbers so each case is precise: 84.5 kg, a 4-week window, 2,700 maintenance, 2,150 target. */
function week(p: Patch, over: Partial<Parameters<typeof makeScenario>[0]> = {}, extra: Partial<LinkInputs> = {}): LinkInputs {
  const i = inputs(scenario(over), {}, extra);
  const r = i.report;
  const report: WeekReport = {
    ...r,
    weight: { ...r.weight, endTrendKg: 84.5, ratePctPerWeek: p.ratePct ?? -0.6, rateMarginPct: p.marginPct ?? 0.1, rateWindowDays: 28 },
    rateWindow: { from: addDays(r.through, -27), days: 28, foodDays: 28, unlogged: 0, partial: 0, meanKcal: 2140, meanTargetKcal: 2150, meanMaintenanceKcal: 2700, ...p.win },
    food: { ...r.food, daysLogged: 7, unlogged: [], partial: 0, meanKcal: p.win?.meanKcal ?? 2140, targetKcal: p.win?.meanTargetKcal ?? 2150, deltaKcal: (p.win?.meanKcal ?? 2140) - (p.win?.meanTargetKcal ?? 2150), proteinGPerKg: 2.0, ...p.food },
    sleep: { ...r.sleep, nights: 7, meanH: 7.8, goalH: 8, shortNights: 0, ...p.sleep },
    health: { ...r.health, ...p.health },
  };
  const analysis: PhysiqueAnalysis = { ...i.analysis, strength: { ...i.analysis.strength, ...p.strength }, weight: { ...i.analysis.weight, ratePctPerWeek: p.rate ?? -0.6 } };
  return { ...i, report, analysis };
}

type Records = NonNullable<LinkInputs["records"]>;

/**
 * IN3: made-up records behind a week from `week()`: steps and carbs that
 * step halfway through the 4-week window, unlogged days, maintenance
 * moving from the goal's start. The report's own numbers stay as `week()`
 * set them; these only feed the reasons.
 */
function records(i: LinkInputs, p: { stepsAtStart?: number; steps?: [number, number]; carbs?: [number, number]; unlogged?: number; maint?: [number, number]; flags?: Record<string, DayFlags> } = {}): Records {
  const through = i.report.through;
  const from = addDays(through, -27);
  const start = i.goal!.startDate;
  const steps: DailySteps[] = [];
  const foodEntries: FoodEntry[] = [];
  const expenditure: ExpenditurePoint[] = [];
  const total = 1 + Math.round((Date.parse(through) - Date.parse(start)) / 86_400_000);
  for (let k = 0; k < total; k++) {
    const date = addDays(start, k);
    const di = Math.round((Date.parse(date) - Date.parse(from)) / 86_400_000);
    const late = di >= 14;
    const st = di >= 0 ? (p.steps ? p.steps[late ? 1 : 0] : 9000) : (p.stepsAtStart ?? p.steps?.[0] ?? 9000);
    steps.push({ id: `s${k}`, date, loggedAt: `${date}T23:00:00.000Z`, source: "healthkit", schemaVersion: 1, steps: st });
    const carbs = di >= 0 && p.carbs ? p.carbs[late ? 1 : 0] : 220;
    if (!(di >= 0 && di % 5 === 2 && Math.floor(di / 5) < (p.unlogged ?? 0))) foodEntries.push({ id: `f${k}`, date, loggedAt: `${date}T20:00:00.000Z`, source: "manual", schemaVersion: 1, label: "Day", kcal: 2140, proteinG: 170, carbsG: carbs, fatG: 70, method: "quick" });
    const [m0, m1] = p.maint ?? [2700, 2700];
    expenditure.push({ date, tdee: Math.round(m0 + (k / Math.max(1, total - 1)) * (m1 - m0)), state: "updating", trendKg: null } as ExpenditurePoint);
  }
  const settled = Array.from({ length: 35 }, (_, k) => ({ date: addDays(start, k - 35), tdee: (p.maint ?? [2700, 2700])[0], state: "updating", trendKg: null }) as ExpenditurePoint);
  return { foodEntries, dayFlags: p.flags ?? {}, steps, expenditure: [...settled, ...expenditure], today: addDays(through, 3) };
}

describe("why the weight isn't moving (IN3)", () => {
  it("steps down 5,000 a day: named with their share, and the rest said as such", () => {
    const base = week({ ratePct: -0.1 });
    const l = weightLink({ ...base, records: records(base, { steps: [11000, 6000] }) })!;
    expect(l.title).toBe("Weight came down slower than planned");
    expect(l.causes).toContain("The scale trend is 0.4 kg a week above what your calories predict.");
    expect(l.causes.some((c) => /^Steps fell from 11,000 to 6,000 a day over the 4 weeks: about 170 kcal a day less burned, about 0\.1 kg a week of it\.$/.test(c))).toBe(true);
    expect(l.causes.some((c) => /^That leaves about 0\.\d kg a week nothing logged accounts for/.test(c))).toBe(true);
    // The generic water note gives way to the numbers.
    expect(l.note).toBeNull();
  });

  it("carbs rising: the water they hold, sized", () => {
    const base = week({ ratePct: -0.1 });
    const l = weightLink({ ...base, records: records(base, { carbs: [150, 320] }) })!;
    expect(l.causes.some((c) => /^Carbs rose from 150 to 320 g a day over the 4 weeks; the water they hold adds about 0\.1 kg a week to the trend\.$/.test(c))).toBe(true);
  });

  it("under-logging: days not logged are named", () => {
    const base = week({ ratePct: -0.1 });
    const l = weightLink({ ...base, records: records(base, { unlogged: 4 }) })!;
    expect(l.causes).toContain("4 days not logged in the last 4 weeks, so the intake above may read low.");
  });

  it("maintenance falling since the goal began, with the steps behind it, when the target has drifted from the plan", () => {
    const base = week({ ratePct: -0.2, win: { meanKcal: 2500, meanTargetKcal: 2500, meanMaintenanceKcal: 2700 } });
    const l = weightLink({ ...base, records: records(base, { stepsAtStart: 11200, steps: [11200, 6900], maint: [2950, 2700] }) })!;
    expect(l.title).toBe("Weight came down slower than planned");
    expect(l.causes.some((c) => /^The 2,500 target now sits 200 kcal under maintenance/.test(c))).toBe(true);
    expect(l.causes.some((c) => /^Maintenance has gone from about 2,950 to 2,700 kcal since \d+\u00a0[A-Z][a-z]{2}; steps fell from 11,200 to 6,900 a day in that time, about 150 kcal of it\.$/.test(c))).toBe(true);
  });

  it("not clear yet still says what the scale and calories disagree by, and why", () => {
    const base = week({ ratePct: -0.2, marginPct: 0.5 });
    const l = weightLink({ ...base, records: records(base, { steps: [11000, 6000] }) })!;
    expect(l.title).toBe("Weight against the plan: not clear yet");
    expect(l.causes.some((c) => c.startsWith("Steps fell from 11,000"))).toBe(true);
  });

  it("controls: on plan, or records with nothing in them, add nothing new", () => {
    const on = week({});
    expect(weightLink({ ...on, records: records(on, { steps: [11000, 6000], carbs: [150, 320] }) })!.causes).toEqual(weightLink(on)!.causes);
    const plain = week({ ratePct: -0.1 });
    const l = weightLink({ ...plain, records: records(plain) })!;
    expect(l.causes.filter((c) => /^(Steps|Carbs|Maintenance|\d+ days not logged)/.test(c))).toEqual([]);
    for (const c of l.causes) expect(bannedPhrasesIn(c)).toEqual([]);
  });
});

describe("linked reasons (W5)", () => {
  it("energy balance: 7,716 kcal a kg, so a 500 kcal daily deficit is about 0.45 kg a week", () => {
    expect(kgPerWeekFromKcal(-500)).toBeCloseTo(-0.454, 2);
  });

  it("a cut eaten to target reads on plan, with plan, intake and trend over the same four weeks", () => {
    const w = weightLink(week({}))!;
    expect(w.state).toBe("good");
    expect(w.title).toBe("Weight moving as planned");
    expect(w.figures.map((f) => `${f.label}: ${f.value}`)).toEqual(["Planned: −0.5 kg", "Calories predict: −0.5 kg", "Scale trend: −0.5 kg"]);
    expect(w.figuresCaption).toBe("Per week, over the last 4 weeks");
    expect(w.causes[0]).toBe("Over the last 4 weeks you ate 2,140 kcal a day, on the 2,150 target. Against maintenance of about 2,700, that is a 560 kcal deficit, about 0.5 kg of fat loss a week.");
    expect(w.note).toBe("The scale trend matches what your calories predict.");
  });

  it("eating over target links to the weight not coming down as planned, and says the trend matches the intake", () => {
    const w = weightLink(week({ ratePct: -0.2, win: { meanKcal: 2500 } }))!;
    expect(w.state).toBe("watch");
    expect(w.title).toBe("Weight came down slower than planned");
    expect(w.causes[0]).toBe("Over the last 4 weeks you ate 2,500 kcal a day, 350 over the 2,150 target. Against maintenance of about 2,700, that is a 200 kcal deficit, about 0.2 kg of fat loss a week.");
    expect(w.note).toBe("The scale trend matches what your calories predict, so the plan works when the target is hit.");
    expect(weightLink(week({ ratePct: 0.05, win: { meanKcal: 2650 } }))!.title).toBe("Weight did not come down");
  });

  it("says this week's intake too when it differs from the window's, so the card and the calorie tile tell one story", () => {
    const w = weightLink(week({ ratePct: -0.2, win: { meanKcal: 2450 }, food: { meanKcal: 2730, targetKcal: 2150, deltaKcal: 580 } }))!;
    expect(w.causes[0]).toMatch(/^Over the last 4 weeks you ate 2,450 kcal a day, 300 over the 2,150 target\./);
    expect(w.causes[1]).toBe("This week alone averaged 2,730 kcal a day, 580 over target.");
    expect(weightLink(week({ ratePct: -0.2, win: { meanKcal: 2450 }, food: { meanKcal: 2480, targetKcal: 2150, deltaKcal: 330 } }))!.causes.some((c) => c.startsWith("This week alone"))).toBe(false);
  });

  it("agrees with the scorecard and the judge (TR12): inside the plan's tolerance is as planned; inside it only by the rate's margin is not clear yet", () => {
    expect(weightLink(week({ ratePct: -0.4 }))!).toMatchObject({ state: "good", title: "Weight moving as planned" });
    const unclear = weightLink(week({ ratePct: -0.3 }))!;
    expect(unclear).toMatchObject({ state: "watch", title: "Weight against the plan: not clear yet", detail: "The gap is inside the trend's margin of error." });
    expect(rateVsPlan(-0.3, -0.6, "cut", null, 0.1)!.text).toBe("Not clear yet");
    expect(weightLink(week({ ratePct: -0.2 }))!.title).toBe("Weight came down slower than planned");
  });

  it("a wide margin keeps a noisy rate from reading off plan (not clear yet), unless the intake points the same way (and the scorecard agrees)", () => {
    const noisy = week({ ratePct: -1.1, marginPct: 0.5 });
    expect(weightLink(noisy)!).toMatchObject({ state: "watch", title: "Weight against the plan: not clear yet" });
    expect(planMargin(noisy.report, -0.6)).toBe(0.5);
    const backed = week({ ratePct: -1.1, marginPct: 0.5, win: { meanKcal: 1750 } });
    expect(planMargin(backed.report, -0.6)).toBe(0);
    expect(weightLink(backed)!.title).toBe("Weight came down faster than planned");
    expect(rateVsPlan(-1.1, -0.6, "cut", null, planMargin(backed.report, -0.6))!.text).toBe("Faster than plan");
  });

  it("on target but slower: unlogged days or fewer steps are named; with neither, water is the likely reason", () => {
    const steps = week({ ratePct: -0.1, health: { meanSteps: 5500 } });
    const withPrev: LinkInputs = { ...steps, prev: { ...steps.report, health: { ...steps.report.health, meanSteps: 9500 } } };
    expect(weightLink(withPrev)!.causes[1]).toBe("Steps fell to 5,500 a day from 9,500 last week, about 140 kcal a day less burned.");
    expect(weightLink(week({ ratePct: -0.1, win: { unlogged: 3, partial: 1 } }))!.causes[1]).toBe("3 days not logged and 1 day logged in part in the last 4 weeks, so the intake above may read low.");
    const water = weightLink(week({ ratePct: -0.1 }))!;
    expect(water.causes).toHaveLength(1);
    expect(water.note).toMatch(/^Intake was on target, so it does not explain this\. Weight can hold for one to two weeks/);
    const under = weightLink(week({ ratePct: -0.1, win: { meanKcal: 1900 } }))!;
    expect(under.note).toMatch(/^You ate under the target, so intake does not explain this\./);
  });

  it("eating to a target that has drifted from the plan names the target, not the eating", () => {
    // Maintenance has risen to 3,300 since the 2,150 target was set: on target is now a 1,150 kcal deficit.
    const w = weightLink(week({ ratePct: -1.2, win: { meanKcal: 2150, meanMaintenanceKcal: 3300 } }))!;
    expect(w.title).toBe("Weight came down faster than planned");
    expect(w.causes[1]).toBe("The 2,150 target now sits 1,150 kcal under maintenance, a −1.0 kg a week pace against the plan's −0.5 kg.");
    expect(w.note).toMatch(/the target is what needs moving/);
  });

  it("eating well under target links to losing faster than planned, and names the cost", () => {
    const w = weightLink(week({ ratePct: -1.2, win: { meanKcal: 1700 } }))!;
    expect(w.title).toBe("Weight came down faster than planned");
    expect(w.causes[0]).toMatch(/450 under the 2,150 target/);
    expect(w.note).toMatch(/losing faster than planned costs more muscle and strength/);
  });

  it("a gain eaten over target goes up faster, and the note says the extra is mostly fat", () => {
    const w = weightLink(week({ ratePct: 0.8, win: { meanKcal: 3400, meanTargetKcal: 2900 } }, { goal: { ratePctPerWeek: 0.25, targetKg: 90 } }))!;
    expect(w.title).toBe("Weight went up faster than planned");
    expect(w.note).toMatch(/adds more fat than muscle/);
  });

  it("stays silent without a goal or without enough food logged across the window", () => {
    expect(weightLink(week({}, { goal: null }))).toBeNull();
    expect(weightLink(week({ win: { foodDays: 10 } }))).toBeNull();
  });

  it("lifts down with short sleep and low HRV: both named, sleep first, with the program left alone", () => {
    const l = liftsLink(week({ sleep: { meanH: 6.1, shortNights: 4 }, strength: { status: "dropping", lifts: [{ name: "Bench Press", changePct: -6.2 }, { name: "Squat", changePct: -3.1 }] } }, {}, { recovery: LOW_HRV }))!;
    expect(l.state).toBe("attention");
    expect(l.title).toBe("Lifts are down");
    expect(l.detail).toBe("Bench press −6.2% and squat −3.1% since your goal started.");
    expect(l.causes[0]).toBe("Sleep averaged 6h 06m a night, 1h 54m under 8 hours, with 4 short nights.");
    expect(liftsLink(week({ sleep: { meanH: 7.3, shortNights: 1 }, strength: { status: "dropping" } }))!.causes[0]).toBe("Sleep averaged 7h 18m a night, 42 min under 8 hours, with 1 short night.");
    expect(l.causes[1]).toBe("HRV ran 21% below usual (41 ms against 52).");
    expect(l.note).toMatch(/fix those before changing the program/);
  });

  it("flat lifts on a gain with a clean week: says what was checked and points at the program", () => {
    const l = liftsLink(week({ food: { meanKcal: 2900, targetKcal: 2900, deltaKcal: 0 }, strength: { status: "holding" } }, { goal: { ratePctPerWeek: 0.25, targetKg: 90 } }))!;
    expect(l.title).toMatch(/^Lifts holding, not yet growing/);
    expect(l.causes[0]).toBe("Sleep, protein and sessions were on plan this week.");
    expect(l.note).toMatch(/program is the next thing to look at/);
  });

  it("lifts rising on a clean week say what supported them; holding lifts on a cut are the aim, not a problem", () => {
    const up = liftsLink(week({ strength: { status: "rising", lifts: [{ name: "Squat", changePct: 4.2 }] } }))!;
    expect(up.state).toBe("good");
    expect(up.detail).toBe("Squat +4.2% since your goal started.");
    expect(up.causes[0]).toMatch(/^Sleep 7h 48m a night, protein 2\.0 g\/kg and \d sessions?\.$/);
    expect(liftsLink(week({ strength: { status: "holding" } }))).toBeNull();
  });

  it("recovery below usual links to sleep when the lifts link has not said it", () => {
    const i = week({ sleep: { meanH: 6.2, shortNights: 4 } }, {}, { recovery: LOW_HRV });
    const r = recoveryLink(i, false)!;
    expect(r.title).toBe("Recovery below usual");
    expect(r.causes).toHaveLength(2);
    expect(r.note).toMatch(/Short sleep is the likeliest driver/);
    expect(recoveryLink(i, true)).toBeNull();
  });

  it("weight comes first, and the copy stays calm", () => {
    const cases: Patch[] = [{}, { ratePct: -0.2, win: { meanKcal: 2500 } }, { ratePct: -1.2, win: { meanKcal: 1700 } }, { sleep: { meanH: 6.1, shortNights: 4 }, strength: { status: "dropping" } }];
    for (const p of cases) {
      const links = linkedReasons(week(p, {}, { recovery: LOW_HRV }));
      expect(links[0]?.id).toBe("weight");
      for (const l of links) {
        for (const t of [l.title, l.detail ?? "", ...l.causes, l.note ?? ""]) {
          expect(bannedPhrasesIn(t)).toEqual([]);
          expect(t).not.toMatch(/—|!/);
        }
      }
    }
  });
});
