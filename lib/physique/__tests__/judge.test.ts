import { describe, expect, it } from "vitest";
import { addDays } from "@/lib/dates";
import { makeScenario } from "@/lib/physique/fixtures";
import { buildPhysiqueAnalysis, isCheckInDue, rateFamilyInCooldown, waistChange, type JudgeInputs } from "@/lib/physique/judge";
import { CALORIE_FLOOR, GAIN_BANDS } from "@/lib/physique/targets";
import type { FoodEntry, PhysiqueAnalysis, PhysiqueGoal, PhysiqueProgram, Recommendation, RuleId, WaistEntry } from "@/lib/physique/types";
import { analyse, fixedBulk, fixedCut, FLAT_LIFTS, inputsOf, loss1Row, NOW, runRow, SCENARIO_TABLE, START, stepLifts } from "@/lib/physique/__tests__/judgeHelpers";
import { night } from "@/lib/physique/__tests__/helpers";

const ids = (a: PhysiqueAnalysis): RuleId[] => [a.verdict.id, ...a.flags.map((f) => f.id)];

// ── Scenario table (04-tickets P5), 200 seeds per row ──

/** 200 full engine runs per row take about 3 s alone and past vitest's 5 s default when the suite runs in parallel. */
const SCENARIO_TIMEOUT_MS = 30_000;

describe("scenario table over 200 seeds", () => {
  for (const row of SCENARIO_TABLE) {
    it(`${row.name} in ≥${Math.round(row.minRate * 100)}% of seeds`, () => {
      const r = runRow(row);
      const summary = Object.entries(r.counts)
        .sort((a, b) => b[1] - a[1])
        .map(([k, v]) => `${k}=${v}`)
        .join(" ");
      expect(r.rate, `${row.name}: hit rate ${r.rate.toFixed(3)} (${summary})`).toBeGreaterThanOrEqual(row.minRate);
      // Exactly one primary, always; copy never empty.
      for (const a of r.analyses) {
        expect(a.verdict.title.length).toBeGreaterThan(0);
        expect(a.verdict.detail.length).toBeGreaterThan(0);
        expect(a.flags.length).toBeLessThanOrEqual(3);
      }
    }, SCENARIO_TIMEOUT_MS);
  }

  it("LOSS-1 row with deterministic lifts: LOSS-1 or LOSS-3 in ≥75% of seeds, always easing −1.0 → −0.6", () => {
    // Isolates the rate half of the rule from STR-1's two-lift power. Measured 0.785.
    let hits = 0;
    const N = 200;
    for (let seed = 1; seed <= N; seed++) {
      const a = analyse(makeScenario(loss1Row(seed, { lifts: stepLifts(-8, 35, 0) })));
      if (a.verdict.id === "LOSS-1" || a.verdict.id === "LOSS-3") {
        hits++;
        expect(a.recommendation).toEqual(expect.objectContaining({ kind: "change_rate", fromPctPerWeek: -1.0, toPctPerWeek: -0.6 }));
      }
    }
    expect(hits / N, `rate ${(hits / N).toFixed(3)}`).toBeGreaterThanOrEqual(0.75);
  });

  it("GAIN-1 row: every GAIN-1 hit eases 0.75 → 0.25; DATA-RATE row: status unknown", () => {
    const gain = runRow(SCENARIO_TABLE[4], 60);
    for (const a of gain.analyses.filter((x) => x.verdict.id === "GAIN-1")) {
      expect(a.recommendation).toEqual(expect.objectContaining({ kind: "change_rate", fromPctPerWeek: 0.75, toPctPerWeek: 0.25 }));
      expect(a.verdict.windowDays).toBe(42);
    }
    const data = runRow(SCENARIO_TABLE[5], 20);
    for (const a of data.analyses.filter((x) => x.verdict.id === "DATA-RATE")) {
      expect(a.status.state).toBe("unknown");
      expect(a.recommendation).toEqual(expect.objectContaining({ kind: "log_more", what: "weight" }));
    }
  });
});

// ── Direction checks (02 §8.2 A) ──

function checkDirection(a: PhysiqueAnalysis) {
  const rec = a.recommendation;
  if (!rec) return;
  const id = a.verdict.id;
  if (rec.kind === "change_rate") {
    if (id.startsWith("LOSS")) expect(Math.abs(rec.toPctPerWeek), `${id} must ease the cut`).toBeLessThan(Math.abs(rec.fromPctPerWeek));
    if (id === "GAIN-1") expect(rec.toPctPerWeek, "GAIN-1 must slow the bulk").toBeLessThan(rec.fromPctPerWeek);
    if (id === "GAIN-2") expect(rec.toPctPerWeek, "GAIN-2 must speed the bulk").toBeGreaterThan(rec.fromPctPerWeek);
  }
  if (rec.kind === "refresh_targets") {
    if (id === "LOSS-6" || id === "GAIN-1") expect(rec.toKcal).toBeLessThan(rec.fromKcal);
    else expect(rec.toKcal).toBeGreaterThan(rec.fromKcal);
  }
}

describe("direction checks", () => {
  it("no recommendation ever makes a LOSS goal more aggressive or a GAIN-1 goal faster, over every table row", () => {
    for (const row of SCENARIO_TABLE) for (const a of runRow(row, 40).analyses) checkDirection(a);
  });

  it("a goal already inside the rule's range gets no change_rate", () => {
    // LOSS-1 with a −0.6 goal (in range): the variant copy and no change_rate.
    const a = analyse(fixedCut({ deficit: 1400, goalRate: -0.6, lifts: stepLifts(-8, 35, 0) }));
    expect(a.verdict.id).toBe("LOSS-1");
    expect(a.verdict.title).toBe("Losing faster than planned");
    expect(a.recommendation?.kind ?? null).not.toBe("change_rate");
    // Z3: the verdict states the numbers; no word on the maintenance estimate.
    expect(a.verdict.detail).not.toMatch(/maintenance estimate/);
  });

  it("LOSS-6 refresh lowers kcal and LOSS-1 refresh raises it (frozen seeds)", () => {
    const sc = makeScenario({ seed: 13, days: 63, preDays: 21, bodyweightKg: 85, trueTdeeKcal: 2800, intake: "toTarget", goal: { ratePctPerWeek: -0.6 }, lifts: FLAT_LIFTS.map((l) => ({ ...l, cv: 0.03 })) });
    const a = analyse(sc);
    expect(a.verdict.id).toBe("LOSS-6");
    expect(a.recommendation?.kind).toBe("refresh_targets");
    const r6 = a.recommendation as Extract<Recommendation, { kind: "refresh_targets" }>;
    expect(r6.toKcal).toBeLessThan(r6.fromKcal);
    expect(a.verdict.detail).toContain("while eating to target");
    expect(a.recommendationLabel).toMatch(/^Update targets now \(−\d+ kcal\/day\)$/);

    // LOSS-1 in range and adherent with a stable, lagging coach: inject a program whose target equals the intake.
    const cut = fixedCut({ deficit: 1400, goalRate: -0.6, lifts: stepLifts(-8, 35, 0), intakeSdKcal: 150 });
    const program: PhysiqueProgram = {
      id: "p",
      goalId: cut.goal!.id,
      history: [{ startDate: cut.goal!.startDate, source: "goal_start", acceptedAt: `${cut.goal!.startDate}T00:00:00.000Z`, kcal: 2100, proteinG: 180, fatG: 70, carbsG: 190, tdeeAtAccept: 2700 }],
      schemaVersion: 1,
    };
    const b = analyse(cut, { program });
    expect(b.verdict.id).toBe("LOSS-1");
    expect(b.adherence.onTarget).toBe(true);
    expect(b.expenditure.state).toBe("stable");
    expect(b.recommendation?.kind).toBe("refresh_targets");
    const r1 = b.recommendation as Extract<Recommendation, { kind: "refresh_targets" }>;
    expect(r1.toKcal).toBeGreaterThan(r1.fromKcal);
    expect(b.verdict.detail).toMatch(/while eating to target/);
  });
});

// ── Group 1: safety ──

describe("SAFE rules", () => {
  it("SAFE-0: under 18 on a cut → primary, targets at maintenance; 18 → not", () => {
    const sc = fixedCut({ deficit: 600 });
    const a = analyse(sc, { profile: { ...sc.profile, age: 17 } });
    expect(a.verdict.id).toBe("SAFE-0");
    expect(a.status.state).toBe("attention");
    expect(a.targets).not.toBeNull();
    expect(a.targets!.kcal).toBe(a.expenditure.kcal);
    expect(a.recommendation).toBeNull();
    expect(ids(analyse(sc, { profile: { ...sc.profile, age: 18 } }))).not.toContain("SAFE-0");
  });

  it("SAFE-5: a yes on the safety screen → primary over SAFE-0 and SAFE-4; a no → not", () => {
    const sc = fixedCut({ deficit: 600, targetKg: 58 });
    const yes = analyse(sc, { profile: { ...sc.profile, age: 17, safety: { pregnantOrEdHistory: true } } });
    expect(yes.verdict.id).toBe("SAFE-5");
    expect(yes.flags.map((f) => f.id)).toEqual(expect.arrayContaining(["SAFE-0", "SAFE-4"]));
    expect(yes.targets!.kcal).toBe(yes.expenditure.kcal);
    expect(ids(analyse(sc, { profile: { ...sc.profile, safety: { pregnantOrEdHistory: false } } }))).not.toContain("SAFE-5");
  });

  it("SAFE-3: a reported red flag → pause; none → not; outranked by SAFE-5", () => {
    const sc = fixedCut({ deficit: 600 });
    const a = analyse(sc, { profile: { ...sc.profile, safety: { redFlags: ["dizziness"] } } });
    expect(a.verdict.id).toBe("SAFE-3");
    expect(a.recommendation).toEqual({ kind: "pause_and_seek_help" });
    expect(ids(analyse(sc, { profile: { ...sc.profile, safety: { redFlags: [] } } }))).not.toContain("SAFE-3");
    expect(analyse(sc, { profile: { ...sc.profile, safety: { redFlags: ["low_mood"], pregnantOrEdHistory: true } } }).verdict.id).toBe("SAFE-5");
  });

  it("SAFE-1: the floor binds (F, 55 kg, −1.0 at 1,700 kcal) → primary; a higher TDEE → not; outranked by SAFE-4", () => {
    const low = makeScenario({ seed: 3, days: 35, bodyweightKg: 55, trueTdeeKcal: 1700, intake: { meanKcal: 1300 }, goal: { ratePctPerWeek: -1.0, targetKg: 50 }, profile: { sex: "F", heightCm: 160, manualInitialTdee: 1700 } });
    const a = analyse(low);
    expect(a.verdict.id).toBe("SAFE-1");
    expect(a.verdict.detail).toContain(`${CALORIE_FLOOR.F.toLocaleString("en-GB")} kcal`);
    const ok = makeScenario({ seed: 3, days: 35, bodyweightKg: 55, trueTdeeKcal: 2100, intake: { meanKcal: 1700 }, goal: { ratePctPerWeek: -1.0, targetKg: 50 }, profile: { sex: "F", heightCm: 160, manualInitialTdee: 2100 } });
    expect(ids(analyse(ok))).not.toContain("SAFE-1");
    const bmi = makeScenario({ seed: 3, days: 35, bodyweightKg: 55, trueTdeeKcal: 1700, intake: { meanKcal: 1300 }, goal: { ratePctPerWeek: -1.0, targetKg: 45 }, profile: { sex: "F", heightCm: 160, manualInitialTdee: 1700 } });
    const b = analyse(bmi);
    expect(b.verdict.id).toBe("SAFE-4");
    expect(b.flags.map((f) => f.id)).toContain("SAFE-1");
  });

  it("SAFE-4 by BMI: target BMI 17.9 → primary; 18.6 → not", () => {
    const sc = fixedCut({ deficit: 600, bodyweightKg: 85, targetKg: 58 });
    const a = analyse(sc);
    expect(a.verdict.id).toBe("SAFE-4");
    expect(a.verdict.title).toBe("Not coaching this goal");
    expect(a.verdict.detail).toContain("BMI of 17.9");
    const near = fixedCut({ deficit: 600, bodyweightKg: 85, targetKg: 60.3 });
    expect(ids(analyse(near))).not.toContain("SAFE-4");
  });

  it("SAFE-4 by rate: LOSS-3 on three consecutive weekly windows → primary; two → LOSS-3 stays primary", () => {
    const fast = fixedCut({ deficit: 2700, days: 63 });
    const a = analyse(fast);
    expect(a.verdict.id).toBe("SAFE-4");
    expect(a.verdict.title).toBe("Not coaching this rate");
    expect(a.flags.map((f) => f.id)).toContain("LOSS-3");
    expect(a.status.state).toBe("attention");
    const shorter = fixedCut({ deficit: 2700, days: 49 });
    const b = analyse(shorter);
    expect(b.verdict.id).toBe("LOSS-3");
    expect(ids(b)).not.toContain("SAFE-4");
  });

  it("G8: a SAFE rule strips every deficit-deepening recommendation", () => {
    const sc = makeScenario({ seed: 13, days: 63, preDays: 21, bodyweightKg: 85, trueTdeeKcal: 2800, intake: "toTarget", goal: { ratePctPerWeek: -0.6 }, lifts: FLAT_LIFTS.map((l) => ({ ...l, cv: 0.03 })) });
    const a = analyse(sc, { profile: { ...sc.profile, safety: { redFlags: ["recurrent_illness"] } } });
    expect(a.verdict.id).toBe("SAFE-3");
    const loss6 = a.flags.find((f) => f.id === "LOSS-6");
    expect(loss6).toBeDefined();
    expect(a.rules.suppressed).toContainEqual({ id: "LOSS-6", by: "G8" });
  });
});

// ── Group 2: data ──

describe("data rules", () => {
  it("NO-GOAL: no goal, or a completed goal → primary with status unknown; an active goal → not", () => {
    const none = analyse(makeScenario({ seed: 1, days: 30, bodyweightKg: 85, trueTdeeKcal: 2800, goal: null }));
    expect(none.verdict.id).toBe("NO-GOAL");
    expect(none.status).toEqual({ state: "unknown", label: "Set a goal" });
    expect(none.phase).toBe("none");
    const sc = fixedCut({ deficit: 600 });
    const done = analyse(sc, { goal: { ...sc.goal!, completedAt: `${addDays(sc.today, -1)}T00:00:00.000Z` } });
    expect(done.verdict.id).toBe("NO-GOAL");
    expect(ids(analyse(sc))).not.toContain("NO-GOAL");
  });

  function withPartialDay(sc: ReturnType<typeof fixedCut>, kcal: number, daysAgo = 3) {
    const date = addDays(sc.today, -daysAgo);
    const foodEntries: FoodEntry[] = sc.foodEntries.map((f) => (f.date === date ? { ...f, kcal } : f));
    return { date, foodEntries };
  }

  it("a suspected partial day is left out, never asked about (C11); marked complete, it counts", () => {
    const sc = fixedCut({ deficit: 600 });
    const { date, foodEntries } = withPartialDay(sc, 600);
    const a = analyse(sc, { foodEntries });
    expect(ids(a)).not.toContain("DATA-PARTIAL");
    expect(a.recommendation?.kind).not.toBe("confirm_days");
    expect(a.data.partialDaysLeftOut).toEqual([date]);
    const kept = analyse(sc, { foodEntries, dayFlags: { ...sc.dayFlags, [date]: { date, partialDismissed: true } } });
    expect(kept.data.partialDaysLeftOut).toEqual([]);
    expect(ids(kept)).not.toContain("DATA-PARTIAL");
  });

  it("DATA-HOLD: food logging stops → holding with log_more food; G-EXP-2 flags; a part-logged day does not change that", () => {
    const sc = fixedCut({ deficit: 600 });
    const stopAt = addDays(sc.today, -9);
    const foodEntries = sc.foodEntries.filter((f) => f.date < stopAt);
    const a = analyse(sc, { foodEntries });
    expect(a.verdict.id).toBe("DATA-HOLD");
    expect(a.expenditure.state).toBe("holding");
    expect(a.recommendation).toEqual({ kind: "log_more", what: "food", needed: 3 });
    expect(a.flags.map((f) => f.id)).toContain("G-EXP-2");
    expect(a.status.state).toBe("watch");
    expect(ids(analyse(sc))).not.toContain("DATA-HOLD");
    const partialDate = addDays(sc.today, -12);
    const b = analyse(sc, { foodEntries: foodEntries.map((f) => (f.date === partialDate ? { ...f, kcal: 500 } : f)) });
    expect(b.verdict.id).toBe("DATA-HOLD");
    expect(ids(b)).not.toContain("DATA-PARTIAL");
  });

  it("DATA-RATE: 10 days → N more weigh-ins; 21 daily days → a rate exists; outranked by DATA-HOLD", () => {
    const ten = analyse(makeScenario({ seed: 2, days: 10, bodyweightKg: 85, trueTdeeKcal: 2800, intake: "toTarget", goal: { ratePctPerWeek: -0.6 } }));
    expect(ten.verdict.id).toBe("DATA-RATE");
    expect(ten.weight.weighInsNeeded).toBe(11);
    expect(ten.verdict.detail).toBe("11 more weigh-ins for a first read on your rate.");
    expect(ten.weight.ratePctPerWeek).toBeNull();
    const three = analyse(makeScenario({ seed: 2, days: 21, bodyweightKg: 85, trueTdeeKcal: 2800, intake: "toTarget", goal: { ratePctPerWeek: -0.6 } }));
    expect(ids(three)).not.toContain("DATA-RATE");
    expect(three.weight.rateWindowDays).toBe(14);
    const sc = makeScenario({ seed: 2, days: 12, bodyweightKg: 85, trueTdeeKcal: 2800, intake: "toTarget", goal: { ratePctPerWeek: -0.6 } });
    const hold = analyse(sc, { foodEntries: sc.foodEntries.filter((f) => f.date < addDays(sc.today, -4)) });
    expect(hold.verdict.id).toBe("DATA-HOLD");
    expect(hold.flags.map((f) => f.id)).toContain("DATA-RATE");
  });

  it("DATA-EXP: calibrating is primary only when nothing in group 3–4 could be judged", () => {
    const young = analyse(makeScenario({ seed: 2, days: 18, bodyweightKg: 85, trueTdeeKcal: 2800, intake: "toTarget", goal: { ratePctPerWeek: -0.6 } }));
    expect(young.verdict.id).toBe("DATA-RATE");
    expect(young.flags.map((f) => f.id)).toContain("DATA-EXP");
    // A rate read exists but no outcome rule fires: DATA-EXP leads.
    const sc = makeScenario({ seed: 2, days: 30, bodyweightKg: 85, trueTdeeKcal: 2800, intake: "toTarget", goal: { ratePctPerWeek: -0.6 }, foodLogFromDay: 9 });
    const a = analyse(sc);
    expect(a.expenditure.state).toBe("calibrating");
    expect(a.weight.ratePctPerWeek).not.toBeNull();
    expect(["DATA-EXP", "ON-TRACK", "ADH-1"]).toContain(a.verdict.id);
    if (a.verdict.id === "ON-TRACK") expect(a.flags.map((f) => f.id)).toContain("DATA-EXP");
    const stable = analyse(fixedCut({ deficit: 600 }));
    expect(ids(stable)).not.toContain("DATA-EXP");
  });

  it("G-EXP-2: logged intake down 20% with a flat trend → primary; down 10% → not; holding outranks", () => {
    const sc = makeScenario({ seed: 5, days: 70, preDays: 21, bodyweightKg: 85, trueTdeeKcal: 2800, intake: { meanKcal: 2800, sdKcal: 100 }, goal: { ratePctPerWeek: -0.6 }, waterStepKg: 0 });
    const from = addDays(sc.today, -13);
    const scaled = (k: number): FoodEntry[] => sc.foodEntries.map((f) => (f.date >= from ? { ...f, kcal: Math.round(f.kcal * k) } : f));
    const a = analyse(sc, { foodEntries: scaled(0.8) });
    expect(a.verdict.id).toBe("G-EXP-2");
    expect(a.verdict.detail).toMatch(/fell \d+%/);
    expect(ids(analyse(sc, { foodEntries: scaled(0.9) }))).not.toContain("G-EXP-2");
  });
});

// ── Group 3: adherence ──

describe("adherence rules", () => {
  it("ADH-1: 500 under target → eat_to_target; 100 under → not; a part-logged day is left out, not a reason to wait", () => {
    const sc = makeScenario(loss1Row(3, { goal: { ratePctPerWeek: -0.6, confirmed: true, targetKg: 75 }, intakeOffsetKcal: -500, lifts: [] }));
    const a = analyse(sc);
    expect(a.verdict.id).toBe("ADH-1");
    expect(a.recommendation?.kind).toBe("eat_to_target");
    expect((a.recommendation as { deltaKcal: number }).deltaKcal).toBeLessThan(-300);
    expect(a.verdict.title).toMatch(/^\d+ kcal under target$/);
    expect(a.verdict.detail).toBe("On average over the last 14 days.");
    expect(a.status.state).toBe("watch");
    const near = makeScenario(loss1Row(3, { goal: { ratePctPerWeek: -0.6, confirmed: true, targetKg: 75 }, intakeOffsetKcal: -100, intakeSdKcal: 100, lifts: [] }));
    expect(ids(analyse(near))).not.toContain("ADH-1");
    const date = addDays(sc.today, -2);
    const b = analyse(sc, { foodEntries: sc.foodEntries.map((f) => (f.date === date ? { ...f, kcal: 500 } : f)) });
    expect(b.verdict.id).toBe("ADH-1");
    expect(b.data.partialDaysLeftOut).toEqual([date]);
  });

  it("DB-1: a 6-week cut, over target on 3+ days a week for 2 weeks → diet break primary, ADH-1 a flag; a 5-week cut → ADH-1", () => {
    const over = (days: number) => makeScenario({ seed: 4, days, preDays: 21, bodyweightKg: 90, trueTdeeKcal: 3500, intake: "toTarget", intakeOffsetKcal: 450, intakeSdKcal: 100, goal: { ratePctPerWeek: -0.6, confirmed: true, targetKg: 75 } });
    const a = analyse(over(21 + 45));
    expect(a.verdict.id).toBe("DB-1");
    expect(a.recommendation).toEqual({ kind: "diet_break", weeks: 1 });
    expect(a.flags.map((f) => f.id)).toContain("ADH-1");
    const b = analyse(over(21 + 35));
    expect(b.verdict.id).toBe("ADH-1");
    expect(ids(b)).not.toContain("DB-1");
    const sc = over(21 + 45);
    const c = analyse(sc, { goal: { ...sc.goal!, targetKg: 58 } });
    expect(c.verdict.id).toBe("SAFE-4");
    expect(c.flags.map((f) => f.id)).toContain("DB-1");
  });
});

// ── Group 4: cut outcomes ──

describe("cut outcome rules", () => {
  it("LOSS-1: −1.4 %/wk with two lifts −8% → ease −1.0 → −0.6 (+~400 kcal/day); lifts −4% → not; outranked by ADH-1", () => {
    const a = analyse(fixedCut({ deficit: 1400, lifts: stepLifts(-8, 35, 0) }));
    expect(a.verdict.id).toBe("LOSS-1");
    expect(a.verdict.title).toBe("Losing faster than planned");
    expect(a.verdict.windowDays).toBe(28);
    expect(a.verdict.n).toBeGreaterThanOrEqual(12);
    expect(a.strength.status).toBe("dropping");
    const rec = a.recommendation as Extract<Recommendation, { kind: "change_rate" }>;
    expect(rec.kind).toBe("change_rate");
    expect(rec.toPctPerWeek).toBe(-0.6);
    expect(rec.kcalDeltaAtCurrentBW).toBeGreaterThan(350);
    expect(rec.kcalDeltaAtCurrentBW).toBeLessThan(450);
    expect(a.recommendationLabel).toMatch(/^Ease goal to 0\.6 %\/wk \(about \+\d+ kcal\/day\)$/);
    expect(a.verdict.detail).toContain("down 8% since the cut began");
    expect(a.status.state).toBe("watch");
    // Lifts −4%: not dropping, not STR-OK, so no LOSS rule; −1.4 is confidently outside a −0.6 goal, so no ON-TRACK either.
    const mild = analyse(fixedCut({ deficit: 1400, goalRate: -0.6, lifts: stepLifts(-4, 35, 0) }));
    expect(ids(mild)).not.toContain("LOSS-1");
    expect(mild.verdict).toMatchObject({ id: "NO-CHANGE", title: "Off the planned rate" });
    expect(mild.verdict.detail).toMatch(/^Losing 1\.\d %\/wk over 28 days \(\d+ weigh-ins\) against a −0\.6 %\/wk goal\.$/);
    const adh = analyse(makeScenario({ ...SCENARIO_TABLE[2].spec(5), lifts: stepLifts(-8, 35, 0) }));
    expect(adh.verdict.id).toBe("ADH-1");
    expect(adh.flags.map((f) => f.id)).toContain("LOSS-1");
  });

  it("LOSS-3: −2.2 %/wk → attention, lifts irrelevant; −1.6 → not; outranks LOSS-1", () => {
    const a = analyse(fixedCut({ deficit: 2200, days: 49, lifts: stepLifts(-8, 35, 0) }));
    expect(a.verdict.id).toBe("LOSS-3");
    expect(a.status.state).toBe("attention");
    expect([21, 14]).toContain(a.verdict.windowDays);
    expect(a.flags.map((f) => f.id)).toContain("LOSS-1");
    expect(a.recommendation).toEqual(expect.objectContaining({ kind: "change_rate", toPctPerWeek: -0.6 }));
    expect(ids(analyse(fixedCut({ deficit: 1600, days: 49 })))).not.toContain("LOSS-3");
  });

  it("LOSS-4: near goal, −1.0 %/wk with lifts dropping → ease to −0.5; far from goal → not; outranked by LOSS-1", () => {
    const a = analyse(fixedCut({ deficit: 1000, targetKg: 84, lifts: stepLifts(-8, 35, 0) }));
    expect(a.verdict.id).toBe("LOSS-4");
    expect(a.recommendation).toEqual(expect.objectContaining({ kind: "change_rate", fromPctPerWeek: -1.0, toPctPerWeek: -0.5 }));
    expect(a.verdict.title).toBe("Losing fast, lifts down");
    expect(ids(analyse(fixedCut({ deficit: 1000, targetKg: 70, lifts: stepLifts(-8, 35, 0) })))).not.toContain("LOSS-4");
    // A 1,500 kcal deficit from day 0 ends near 77 kg, so 77 is "near goal" there.
    const b = analyse(fixedCut({ deficit: 1500, targetKg: 77, lifts: stepLifts(-8, 35, 0) }));
    expect(b.verdict.id).toBe("LOSS-1");
    expect(b.flags.map((f) => f.id)).toContain("LOSS-4");
    const adv = analyse(fixedCut({ deficit: 1000, targetKg: 70, trainingStatus: "advanced", lifts: stepLifts(-8, 35, 0) }));
    expect(adv.verdict.id).toBe("LOSS-4");
    expect(adv.verdict.title).toBe("Losing fast, lifts down");
  });

  it("LOSS-2: −1.3 %/wk with lifts holding → no recommendation; near goal → ease; −1.0 → not yet clear, never on track; outranked by LOSS-3", () => {
    const a = analyse(fixedCut({ deficit: 1300, lifts: FLAT_LIFTS }));
    expect(a.verdict.id).toBe("LOSS-2");
    expect(a.recommendation).toBeNull();
    expect(a.verdict.detail).toMatch(/against a 1\.0 goal, lifts holding\.$/);
    const near = analyse(fixedCut({ deficit: 1300, targetKg: 78, lifts: FLAT_LIFTS }));
    expect(near.verdict.id).toBe("LOSS-2");
    expect(near.recommendation).toEqual(expect.objectContaining({ kind: "change_rate", toPctPerWeek: -0.5 }));
    const slow = analyse(fixedCut({ deficit: 950, goalRate: -0.6, lifts: FLAT_LIFTS }));
    expect(ids(slow)).not.toContain("LOSS-2");
    // −1.0 against −0.6 is outside the ±0.25 band but not confidently so: shown as it is, not called on track.
    expect(slow.verdict).toMatchObject({ id: "NO-CHANGE", title: "Not clear yet" });
    expect(slow.status.state).toBe("watch");
    expect(slow.verdict.detail).toMatch(/^Losing \d\.\d %\/wk over 28 days \(\d+ weigh-ins\) against a −0\.6 %\/wk goal\.$/);
    const fast = analyse(fixedCut({ deficit: 2200, days: 49, lifts: FLAT_LIFTS }));
    expect(fast.verdict.id).toBe("LOSS-3");
    expect(fast.flags.map((f) => f.id)).toContain("LOSS-2");
  });

  it("LOSS-2u: the same rate with no lift data → LOSS-2u; with lifts → LOSS-2 instead", () => {
    const a = analyse(fixedCut({ deficit: 1300 }));
    expect(a.verdict.id).toBe("LOSS-2u");
    expect(a.strength.status).toBe("unclear");
    expect(a.verdict.detail).toMatch(/against a 1\.0 goal\.$/);
    expect(ids(analyse(fixedCut({ deficit: 1300, lifts: FLAT_LIFTS })))).not.toContain("LOSS-2u");
  });

  it("LOSS-6: a flat trend against −0.6 → stalled; −0.3 → not; suppressed by RECOMP-1 and RECOMP-WAIST", () => {
    const a = analyse(fixedCut({ deficit: 0, goalRate: -0.6 }));
    expect(a.verdict.id).toBe("LOSS-6");
    expect(a.verdict.title).toBe("Weight loss has stalled");
    expect(a.verdict.detail).toMatch(/against a −0\.6 goal\.$/);
    expect(a.recommendation).toBeNull();
    expect(a.status.state).toBe("watch");
    expect(ids(analyse(fixedCut({ deficit: 300, goalRate: -0.6 })))).not.toContain("LOSS-6");
    // Lifts up, no waist: RECOMP-WAIST takes over and asks for waist logs.
    const rising = fixedCut({ deficit: 0, goalRate: -0.6, lifts: stepLifts(4, 21, 0) });
    const w = analyse(rising);
    expect(w.verdict.id).toBe("RECOMP-WAIST");
    expect(w.recommendation).toEqual({ kind: "log_more", what: "waist", needed: 4 });
    expect(w.rules.suppressed).toContainEqual({ id: "LOSS-6", by: "RECOMP-WAIST" });
    // Waist down 2.5 cm: RECOMP-1.
    const waist = (cms: number[]): WaistEntry[] => cms.map((cm, i) => ({ id: `w${i}`, date: addDays(rising.today, -27 + 6 * i), loggedAt: "", source: "manual", schemaVersion: 1, cm }));
    const r = analyse(rising, { waist: waist([86, 86, 86, 83.5, 83.5]) });
    expect(r.verdict.id).toBe("RECOMP-1");
    expect(r.status.state).toBe("good");
    expect(r.verdict.detail).toContain("waist down 2.5 cm");
    expect(r.rules.suppressed).toContainEqual({ id: "LOSS-6", by: "RECOMP-1" });
    // Waist down only 1.5 cm: neither recomposition rule; LOSS-6 returns.
    const n = analyse(rising, { waist: waist([86, 86, 86, 84.5, 84.5]) });
    expect(n.verdict.id).toBe("LOSS-6");
  });

  it("ON-TRACK cites its window and lifts; NO-CHANGE is the floor; a maintain goal reads the band", () => {
    const a = analyse(fixedCut({ deficit: 1000, goalRate: -1.0, lifts: FLAT_LIFTS }));
    expect(a.verdict.id).toBe("ON-TRACK");
    expect(a.verdict.detail).toMatch(/^Losing \d\.\d %\/wk over 28 days \(\d+ weigh-ins\), lifts holding\.$/);
    expect(a.status).toEqual({ state: "good", label: "On track" });
    const noLifts = analyse(fixedCut({ deficit: 1000, goalRate: -1.0 }));
    expect(noLifts.verdict.detail).not.toContain("lifts");
    const nothing = analyse(fixedCut({ deficit: 1400, goalRate: -0.6, lifts: stepLifts(-4, 35, 0) }));
    expect(nothing.verdict).toMatchObject({ id: "NO-CHANGE" });
    expect(["Off the planned rate", "Not clear yet"]).toContain(nothing.verdict.title);
    expect(nothing.status.state).toBe("watch");
    const hold = makeScenario({ seed: 9, days: 42, bodyweightKg: 85, trueTdeeKcal: 2800, intake: { meanKcal: 2800 }, goal: { ratePctPerWeek: 0, targetKg: 85 } });
    const m = analyse(hold);
    expect(m.phase).toBe("maintain");
    expect(["ON-TRACK", "NO-CHANGE"]).toContain(m.verdict.id);
  });

  it("cooldown: an accepted recommendation 5 days ago silences the rate family; 20 days ago does not", () => {
    const sc = fixedCut({ deficit: 1400, lifts: stepLifts(-8, 35, 0) });
    const goal = (daysAgo: number): PhysiqueGoal => ({ ...sc.goal!, rateHistory: [{ date: addDays(sc.today, -daysAgo), fromPctPerWeek: -1.0, toPctPerWeek: -0.9, reason: "recommendation" }] });
    const quiet = analyse(sc, { goal: goal(5) });
    expect(ids(quiet)).not.toContain("LOSS-1");
    expect(["ON-TRACK", "NO-CHANGE"]).toContain(quiet.verdict.id);
    expect(quiet.rules.suppressed).toContainEqual({ id: "LOSS-1", by: "cooldown" });
    expect(analyse(sc, { goal: goal(20) }).verdict.id).toBe("LOSS-1");
    expect(rateFamilyInCooldown(goal(13), null, sc.today)).toBe(true);
    expect(rateFamilyInCooldown(goal(14), null, sc.today)).toBe(false);
    const refreshed: PhysiqueProgram = { id: "p", goalId: sc.goal!.id, history: [{ startDate: addDays(sc.today, -3), source: "refresh", acceptedAt: "", kcal: 2300, proteinG: 180, fatG: 70, carbsG: 200, tdeeAtAccept: 3000 }], schemaVersion: 1 };
    expect(rateFamilyInCooldown(sc.goal, refreshed, sc.today)).toBe(true);
  });
});

// ── Group 4: bulk outcomes ──

describe("bulk outcome rules", () => {
  it("GAIN-1: +0.68 %/wk on an intermediate 0.75 goal → ease to 0.25 (−kcal); +0.4 → not; one evaluation → not", () => {
    const a = analyse(fixedBulk({ surplus: 600 }));
    expect(a.verdict.id).toBe("GAIN-1");
    expect(a.verdict.windowDays).toBe(42);
    expect(a.recommendation).toEqual(expect.objectContaining({ kind: "change_rate", fromPctPerWeek: 0.75, toPctPerWeek: GAIN_BANDS.intermediate.default }));
    expect((a.recommendation as { kcalDeltaAtCurrentBW: number }).kcalDeltaAtCurrentBW).toBeLessThan(0);
    expect(a.recommendationLabel).toMatch(/^Ease goal to 0\.25 %\/wk \(about −\d+ kcal\/day\)$/);
    expect(a.verdict.title).toBe("Gaining faster than planned");
    expect(a.verdict.detail).not.toMatch(/studies/);
    expect(ids(analyse(fixedBulk({ surplus: 350 })))).not.toContain("GAIN-1");
    // 35 bulk days: a window today but none a week earlier.
    const one = analyse(fixedBulk({ surplus: 600, days: 56 }));
    expect(ids(one)).not.toContain("GAIN-1");
  });

  it("GAIN-2: flat weight on a 0.35 goal with lifts flat → not gaining; lifts rising → GAIN-3 suppresses it; +0.15 → not", () => {
    const a = analyse(fixedBulk({ surplus: 0, goalRate: 0.35, lifts: FLAT_LIFTS }));
    expect(a.verdict.id).toBe("GAIN-2");
    expect(a.strength.status).toBe("holding");
    expect(a.recommendation).toBeNull();
    const rising = analyse(fixedBulk({ surplus: 0, goalRate: 0.35, lifts: stepLifts(4, 21, 0) }));
    expect(rising.verdict.id).toBe("GAIN-3");
    expect(rising.status.state).toBe("good");
    expect(ids(rising)).not.toContain("GAIN-2");
    // With no waist log, RECOMP-WAIST rides along as a flag asking for one.
    expect(rising.flags.map((f) => f.id)).toContain("RECOMP-WAIST");
    expect(ids(analyse(fixedBulk({ surplus: 130, goalRate: 0.35, lifts: FLAT_LIFTS })))).not.toContain("GAIN-2");
    // Goal under the band floor: GAIN-2 raises it by 0.1, never past the default. The goal-relative stall
    // threshold is 0.06 here, so only a falling scale clears the 0.15 margin.
    const low = analyse(fixedBulk({ surplus: -300, goalRate: 0.1, lifts: FLAT_LIFTS }));
    expect(low.verdict.id).toBe("GAIN-2");
    expect(low.recommendation).toEqual(expect.objectContaining({ kind: "change_rate", fromPctPerWeek: 0.1, toPctPerWeek: 0.2 }));
    expect(low.recommendationLabel).toMatch(/^Raise goal to 0\.20 %\/wk/);
  });

  it("GAIN-4: waist up 2+ cm over 4+ weeks at or above the ceiling → a flag beside GAIN-1; +1 cm → no flag", () => {
    const a = analyse(fixedBulk({ surplus: 600, waist: { startCm: 85, changeCm: 8 } }));
    expect(a.verdict.id).toBe("GAIN-1");
    expect(a.flags.map((f) => f.id)).toContain("GAIN-4");
    const b = analyse(fixedBulk({ surplus: 600, waist: { startCm: 85, changeCm: 3 } }));
    expect(ids(b)).not.toContain("GAIN-4");
  });

  it("ON-TRACK on a bulk reads 'Gaining … lifts rising'", () => {
    const a = analyse(fixedBulk({ surplus: 220, goalRate: 0.25, lifts: stepLifts(4, 21, 0) }));
    expect(["ON-TRACK", "GAIN-3"]).toContain(a.verdict.id);
    if (a.verdict.id === "ON-TRACK") expect(a.verdict.detail).toMatch(/^Gaining 0\.\d\d %\/wk over 28 days \(\d+ weigh-ins\), lifts rising\.$/);
  });
});

// ── Sleep, strength and macro flags ──

describe("sleep rules", () => {
  it("SLEEP-1: short sleep with corroborating lifts → primary with a sleep target; sleep ok → not; LOSS-1 outranks it and keeps its easing", () => {
    const row = makeScenario({ seed: 3, days: 42, preDays: 7, bodyweightKg: 85, trueTdeeKcal: 2800, intake: "toTarget", intakeSdKcal: 150, goal: { ratePctPerWeek: -0.6 }, sleep: { meanH: 6.6, sdH: 0.3, source: "manual" }, lifts: stepLifts(-3, 28, 0) });
    const a = analyse(row);
    expect(a.verdict.id).toBe("SLEEP-1");
    expect(a.recommendation).toEqual({ kind: "sleep", targetHours: expect.any(Number) });
    expect((a.recommendation as { targetHours: number }).targetHours).toBeLessThanOrEqual(8);
    expect(a.verdict.title).toBe("Sleep is short");
    expect(a.verdict.detail).toMatch(/^Averaging \dh\d\dm over 1[34] nights, and .* are down 3%\.$/);
    expect(a.status.state).toBe("watch");
    const ok = makeScenario({ seed: 3, days: 42, preDays: 7, bodyweightKg: 85, trueTdeeKcal: 2800, intake: "toTarget", intakeSdKcal: 150, goal: { ratePctPerWeek: -0.6 }, sleep: { meanH: 7.6, sdH: 0.3, source: "manual" }, lifts: stepLifts(-3, 28, 0) });
    expect(ids(analyse(ok))).not.toContain("SLEEP-1");
    // LOSS-1 and SLEEP-1 together: LOSS-1 leads with its less-aggressive change_rate; SLEEP-1 is a flag.
    // Nights of 6.8 h are short (manual threshold 7.0) without excluding sessions (acute 6.5); the step sits
    // inside the corroboration's last 2 weeks and still gives STR-1 its 3 post exposures.
    const both = fixedCut({ deficit: 1400, lifts: stepLifts(-8, 49, 0), sleep: { meanH: 6.8, sdH: 0.1, source: "manual" } });
    const b = analyse(both);
    expect(b.verdict.id).toBe("LOSS-1");
    expect(b.flags.map((f) => f.id)).toContain("SLEEP-1");
    expect(b.recommendation?.kind).toBe("change_rate");
  });

  it("SLEEP-1 blocks a LOSS-6 refresh and takes the primary slot", () => {
    const sc = makeScenario({ seed: 13, days: 63, preDays: 21, bodyweightKg: 85, trueTdeeKcal: 2800, intake: "toTarget", goal: { ratePctPerWeek: -0.6 }, lifts: stepLifts(-3, 49, 0), sleep: { meanH: 6.3, sdH: 0.3, source: "manual" } });
    const a = analyse(sc);
    expect(a.verdict.id).toBe("SLEEP-1");
    const loss6 = a.flags.find((f) => f.id === "LOSS-6");
    expect(loss6).toBeDefined();
    expect(a.rules.suppressed).toContainEqual({ id: "LOSS-6", by: "SLEEP-1 block" });
    expect(a.recommendation?.kind).toBe("sleep");
  });

  it("SLEEP-1i: short sleep without corroboration is a flag only; SLEEP-OK marks sleep as not to blame", () => {
    const a = analyse(fixedCut({ deficit: 1000, sleep: { meanH: 6.3, sdH: 0.3, source: "manual" } }));
    expect(a.flags.map((f) => f.id)).toContain("SLEEP-1i");
    expect(a.verdict.id).not.toBe("SLEEP-1i");
    expect(a.status.state).toBe("watch");
    const okSleep = analyse(fixedCut({ deficit: 1400, lifts: stepLifts(-8, 35, 0), sleep: { meanH: 7.8, sdH: 0.2, source: "manual" } }));
    expect(okSleep.sleep.sleepOk).toBe(true);
    expect(ids(okSleep)).not.toContain("SLEEP-1i");
  });

  it("SLEEP-2: eating 400 kcal more after short nights on a flat cut → a flag; 150 more → not", () => {
    const base = fixedCut({ deficit: 0, goalRate: -0.6, intakeSdKcal: 50 });
    const build = (extra: number) => {
      const nights = [];
      const food: FoodEntry[] = [];
      for (let d = 0; d < 63; d++) {
        const date = addDays(START, d);
        const short = d % 2 === 0;
        nights.push(night(date, short ? 6.0 : 7.5, "manual"));
        const f = base.foodEntries.find((x) => x.date === date)!;
        food.push(short ? { ...f, kcal: f.kcal + extra } : f);
      }
      return analyse(base, { sleepNights: nights, foodEntries: food });
    };
    expect(build(400).flags.map((f) => f.id)).toContain("SLEEP-2");
    expect(ids(build(150))).not.toContain("SLEEP-2");
  });
});

describe("strength and macro flags", () => {
  it("STR-2: one lift down 8% → a flag beside the primary, never primary; −4% → no flag", () => {
    const lifts = [stepLifts(-8, 35, 0)[0], stepLifts(0, 35, 0)[1]];
    const a = analyse(fixedCut({ deficit: 1000, goalRate: -1.0, lifts }));
    expect(a.flags.map((f) => f.id)).toContain("STR-2");
    expect(a.verdict.id).not.toBe("STR-2");
    expect(a.flags.find((f) => f.id === "STR-2")!.detail).toContain("Squat is down 8%");
    expect(ids(analyse(fixedCut({ deficit: 1000, goalRate: -1.0, lifts: [stepLifts(-4, 35, 0)[0], lifts[1]] })))).not.toContain("STR-2");
  });

  it("PRO-1: 1.5 g/kg in all 3 weeks of a cut → a flag with a protein target; low in one week → not", () => {
    const sc = fixedCut({ deficit: 1000, goalRate: -1.0 });
    const protein = (gPerKg: number, fromDaysAgo: number): FoodEntry[] => sc.foodEntries.map((f) => (f.date >= addDays(sc.today, -fromDaysAgo) ? { ...f, proteinG: Math.round(gPerKg * 90) } : f));
    const a = analyse(sc, { foodEntries: protein(1.5, 30) });
    expect(a.flags.map((f) => f.id)).toContain("PRO-1");
    // Per kg of the current trend weight (the fixed deficit has taken the user to about 83 kg).
    expect(a.flags.find((f) => f.id === "PRO-1")!.detail).toMatch(/^1\.[4-7] g\/kg in 3 of the last 3 weeks; your target is \d+ g\./);
    expect(ids(analyse(sc, { foodEntries: protein(1.5, 6) }))).not.toContain("PRO-1");
  });

  it("PRO-2: 1.4 g/kg on a bulk → a flag; 1.7 → not. FAT-1: 30 g fat at 13% → a flag; 40 g at 17% → not", () => {
    const bulk = fixedBulk({ surplus: 220, goalRate: 0.25 });
    const withProtein = (g: number): FoodEntry[] => bulk.foodEntries.map((f) => ({ ...f, proteinG: g }));
    expect(analyse(bulk, { foodEntries: withProtein(112) }).flags.map((f) => f.id)).toContain("PRO-2");
    expect(ids(analyse(bulk, { foodEntries: withProtein(140) }))).not.toContain("PRO-2");
    const cut = fixedCut({ deficit: 1400, lifts: FLAT_LIFTS, intakeSdKcal: 0 });
    const withFat = (g: number): FoodEntry[] => cut.foodEntries.map((f) => ({ ...f, fatG: g }));
    expect(analyse(cut, { foodEntries: withFat(30) }).flags.map((f) => f.id)).toContain("FAT-1");
    expect(ids(analyse(cut, { foodEntries: withFat(40) }))).not.toContain("FAT-1");
  });
});

// ── Output shape, status and helpers ──

describe("analysis shape and helpers", () => {
  it("fills every section the UI reads, with the training status from lifts when the gate passes", () => {
    const sc = makeScenario({ seed: 1, days: 91, preDays: 7, bodyweightKg: 85, trueTdeeKcal: 2800, intake: "toTarget", goal: { ratePctPerWeek: 0.25, trainingStatus: "intermediate" }, lifts: [{ name: "Squat", startE1rm: 150, profile: "linear", changePct: 10, perWeek: 3, cv: 0 }, { name: "Bench Press", startE1rm: 110, profile: "linear", changePct: 10, perWeek: 3, cv: 0 }] });
    const a = analyse(sc);
    expect(a.asOf).toBe(sc.today);
    expect(a.phase).toBe("gain");
    expect(a.training.source).toBe("lifts");
    expect(a.training.medianSlopePctPerWeek).toBeGreaterThan(0);
    expect(a.weight.trendKg).not.toBeNull();
    expect(a.weight.latestKg).not.toBeNull();
    expect(a.targets).not.toBeNull();
    expect(a.data.weighIns14).toBe(14);
    expect(a.expenditure.state).toBe("stable");
    expect(a.strength.mainLifts).toBe(2);
    expect(a.goal?.id).toBe(sc.goal!.id);
    expect(a.rules.fired).toContain(a.verdict.id);
    expect(a.rules.fired[a.rules.fired.length - 1]).toBe("NO-CHANGE");
    const noBand = buildPhysiqueAnalysis(inputsOf(fixedCut({ deficit: 600 })), NOW(fixedCut({ deficit: 600 }).today));
    expect(noBand.training.source).toBe("default");
    expect(noBand.training.status).toBe("intermediate");
    const band = buildPhysiqueAnalysis(inputsOf(fixedCut({ deficit: 600 }), { onboarding: { yearsTrainingBand: "5+" } }), NOW(fixedCut({ deficit: 600 }).today));
    expect(band.training).toMatchObject({ status: "advanced", source: "onboarding" });
  });

  it("status is the most severe of the primary and the flags; flag-only rules cap at watch", () => {
    const a = analyse(fixedCut({ deficit: 2200, days: 49, lifts: FLAT_LIFTS }));
    expect(a.verdict.id).toBe("LOSS-3");
    expect(a.status.state).toBe("attention");
    const b = analyse(makeScenario(loss1Row(3, { goal: { ratePctPerWeek: -0.6, confirmed: true, targetKg: 75 }, intakeOffsetKcal: -500, lifts: [], days: 49, preDays: 21 })));
    expect(b.verdict.id).toBe("ADH-1");
    if (b.flags.some((f) => f.id === "LOSS-3")) expect(b.status.state).toBe("attention");
    else expect(b.status.state).toBe("watch");
  });

  it("checkInDue is true from the check-in weekday until a record for that week exists", () => {
    const goal: PhysiqueGoal = { id: "g", createdAt: "", type: "lose", startDate: "2026-09-01", startTrendKg: 85, targetKg: 80, ratePctPerWeek: -0.6, trainingStatusAtCreation: "intermediate", schemaVersion: 1 };
    const program: PhysiqueProgram = { id: "p", goalId: "g", history: [], schemaVersion: 1 };
    // 2026-09-14 is a Monday (check-in weekday 1).
    expect(isCheckInDue(goal, program, [], "2026-09-14", 1)).toBe(true);
    expect(isCheckInDue(goal, program, [], "2026-09-17", 1)).toBe(true);
    expect(isCheckInDue(goal, program, [{ id: "c", date: "2026-09-14", weekStart: "2026-09-14", accepted: true, fast: false, completedAt: "", schemaVersion: 1 }], "2026-09-17", 1)).toBe(false);
    expect(isCheckInDue(goal, program, [], "2026-09-01", 1)).toBe(false);
    expect(isCheckInDue(null, program, [], "2026-09-14", 1)).toBe(false);
  });

  it("waistChange compares the first 3 entries with the last 2 and needs 4 entries", () => {
    const w = (cms: number[]): WaistEntry[] => cms.map((cm, i) => ({ id: `w${i}`, date: addDays("2026-09-01", 7 * i), loggedAt: "", source: "manual", schemaVersion: 1, cm }));
    expect(waistChange(w([86, 86, 86]), "2026-09-01", "2026-10-01").deltaCm).toBeNull();
    const r = waistChange(w([86, 85, 84, 83, 82]), "2026-09-01", "2026-10-01");
    expect(r.deltaCm).toBeCloseTo(82.5 - 85, 6);
    expect(r.weeks).toBe(4);
  });

  it("is pure: the same inputs give the same analysis, and never read the clock", () => {
    const sc = fixedCut({ deficit: 1400, lifts: stepLifts(-8, 35, 0) });
    const inputs: JudgeInputs = inputsOf(sc);
    const a = JSON.stringify(buildPhysiqueAnalysis(inputs, NOW(sc.today)));
    const b = JSON.stringify(buildPhysiqueAnalysis(inputs, NOW(sc.today)));
    expect(a).toBe(b);
    const earlier = buildPhysiqueAnalysis(inputs, NOW(addDays(sc.today, -30)));
    expect(earlier.asOf).toBe(addDays(sc.today, -30));
    expect(earlier.verdict.id).not.toBe("LOSS-1");
  });
});
