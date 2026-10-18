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
import type { PhysiqueAnalysis } from "@/lib/physique/types";
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

describe("linked reasons (W5)", () => {
  it("energy balance: 7,716 kcal a kg, so a 500 kcal daily deficit is about 0.45 kg a week", () => {
    expect(kgPerWeekFromKcal(-500)).toBeCloseTo(-0.454, 2);
  });

  it("a cut eaten to target reads on plan, with plan, intake and trend over the same four weeks", () => {
    const w = weightLink(week({}))!;
    expect(w.state).toBe("good");
    expect(w.title).toBe("Weight moving as planned");
    expect(w.figures.map((f) => `${f.label}: ${f.value}`)).toEqual(["Plan: −0.5 kg", "From what you ate: −0.5 kg", "Trend: −0.5 kg"]);
    expect(w.figuresCaption).toBe("Per week, over the last 4 weeks");
    expect(w.causes[0]).toBe("Over the last 4 weeks you ate 2,140 kcal a day, on the 2,150 target. Against maintenance of about 2,700, that is a 560 kcal deficit, about 0.5 kg of fat loss a week.");
    expect(w.note).toBe("The scale matches what you ate.");
  });

  it("eating over target links to the weight not coming down as planned, and says the trend matches the intake", () => {
    const w = weightLink(week({ ratePct: -0.2, win: { meanKcal: 2500 } }))!;
    expect(w.state).toBe("watch");
    expect(w.title).toBe("Weight came down slower than planned");
    expect(w.causes[0]).toBe("Over the last 4 weeks you ate 2,500 kcal a day, 350 over the 2,150 target. Against maintenance of about 2,700, that is a 200 kcal deficit, about 0.2 kg of fat loss a week.");
    expect(w.note).toBe("The trend matches what you ate, so the plan works when the target is hit.");
    expect(weightLink(week({ ratePct: 0.05, win: { meanKcal: 2650 } }))!.title).toBe("Weight did not come down");
  });

  it("says this week's intake too when it differs from the window's, so the card and the calorie tile tell one story", () => {
    const w = weightLink(week({ ratePct: -0.2, win: { meanKcal: 2450 }, food: { meanKcal: 2730, targetKcal: 2150, deltaKcal: 580 } }))!;
    expect(w.causes[0]).toMatch(/^Over the last 4 weeks you ate 2,450 kcal a day, 300 over the 2,150 target\./);
    expect(w.causes[1]).toBe("This week alone averaged 2,730 kcal a day, 580 over target.");
    expect(weightLink(week({ ratePct: -0.2, win: { meanKcal: 2450 }, food: { meanKcal: 2480, targetKcal: 2150, deltaKcal: 330 } }))!.causes.some((c) => c.startsWith("This week alone"))).toBe(false);
  });

  it("agrees with the scorecard: inside the plan's tolerance plus the rate's margin is on plan", () => {
    expect(weightLink(week({ ratePct: -0.3 }))!.state).toBe("good");
    expect(weightLink(week({ ratePct: -0.2 }))!.state).toBe("watch");
  });

  it("a wide margin keeps a noisy rate on plan, unless the intake points the same way (and the scorecard agrees)", () => {
    const noisy = week({ ratePct: -1.1, marginPct: 0.5 });
    expect(weightLink(noisy)!.state).toBe("good");
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
    expect(l.detail).toBe("Bench press −6.2% and squat −3.1% since the phase began.");
    expect(l.causes[0]).toBe("Sleep averaged 6h 06m a night, 1h 54m under your 8h 00m goal, with 4 short nights.");
    expect(liftsLink(week({ sleep: { meanH: 7.3, shortNights: 1 }, strength: { status: "dropping" } }))!.causes[0]).toBe("Sleep averaged 7h 18m a night, 42 min under your 8h 00m goal, with 1 short night.");
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
    expect(up.detail).toBe("Squat +4.2% since the phase began.");
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
