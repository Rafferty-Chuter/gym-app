/**
 * How useful the coach is, by how long someone has used it and how well
 * they log (study for the founder, 2026-10-20). Seeded simulated users
 * with a known truth (true maintenance, true weight path, what they really
 * eat) are run through the real engine at day 3, weeks 1, 2, 3, 4, 6, 8
 * and 12, under four data-quality settings. For each run it records what
 * the coach said and how far its numbers were from the truth.
 *
 *   npx tsx scripts/study-usefulness.ts [seedsPerCell=30] [out=docs/plan/research/H-usefulness-study.json]
 *
 * Writes every cell to the JSON file and
 * prints a summary. Pure engine code only: no storage, no network.
 */

import { writeFileSync } from "node:fs";
import { addDays, type LocalDate } from "@/lib/dates";
import { makeScenario, mulberry32, type LiftSpec, type Scenario, type ScenarioSpec } from "@/lib/physique/fixtures";
import { buildPhysiqueAnalysis } from "@/lib/physique/judge";
import { computeExpenditure } from "@/lib/physique/expenditure";
import { buildWeekReport, reportWeekStart } from "@/lib/physique/weekReport";
import { linkedReasons } from "@/lib/physique/linkedReasons";
import type { FoodEntry, PhysiqueAnalysis } from "@/lib/physique/types";

const SEEDS = Number(process.argv[2] ?? 30);
const OUT = process.argv[3] ?? "docs/plan/research/H-usefulness-study.json";
const START: LocalDate = "2026-06-01";
/** Days since the goal started (a new user, no history before). */
const TIMINGS = [3, 7, 14, 21, 28, 42, 56, 84];
const EARLY = new Set(["DATA-EXP", "DATA-RATE", "DATA-HOLD", "NO-GOAL"]);

const flat = (cv = 0.03): LiftSpec[] => [
  { name: "Squat", startE1rm: 150, profile: "linear", changePct: 0, perWeek: 2, cv },
  { name: "Bench Press", startE1rm: 110, profile: "linear", changePct: 0, perWeek: 2, cv },
];
const rising = (pct: number): LiftSpec[] => [
  { name: "Squat", startE1rm: 140, profile: "linear", changePct: pct, perWeek: 2, cv: 0.03 },
  { name: "Bench Press", startE1rm: 100, profile: "linear", changePct: pct, perWeek: 2, cv: 0.03 },
];
const dropping = (pct: number, atDay: number): LiftSpec[] => [
  { name: "Squat", startE1rm: 150, profile: "step", changePct: pct, atDay, perWeek: 2, cv: 0.03 },
  { name: "Bench Press", startE1rm: 110, profile: "step", changePct: pct, atDay, perWeek: 2, cv: 0.03 },
];
const goodSleep = { meanH: 7.6, sdH: 0.5, source: "healthkit" as const, loggedShare: 0.95 };

type Archetype = {
  id: string;
  label: string;
  /** What a good coach should say once it has enough data: the verdict, or a flag when `asFlag`. DB-1 only fires on a cut over target 6 weeks in; LOSS-2/2u say "faster than needed". */
  expect: string[];
  asFlag?: boolean;
  /** The cause the weekly report should name for weight, when it should name one. */
  cause?: "over" | "under";
  spec: (seed: number, days: number) => ScenarioSpec;
};

const ARCHETYPES: Archetype[] = [
  {
    id: "cut-on-plan",
    label: "Cutting, eats to target",
    expect: ["ON-TRACK", "NO-CHANGE"],
    spec: (seed, days) => ({ seed, days, bodyweightKg: 85, trueTdeeKcal: 2800, intake: "toTarget", goal: { ratePctPerWeek: -0.6, confirmed: true, targetKg: 78 }, lifts: flat(), sleep: goodSleep }),
  },
  {
    id: "cut-over",
    label: "Cutting, eats 400 kcal over target",
    expect: ["ADH-1", "LOSS-6", "DB-1"],
    cause: "over",
    spec: (seed, days) => ({ seed, days, bodyweightKg: 85, trueTdeeKcal: 2800, intake: "toTarget", intakeOffsetKcal: 400, goal: { ratePctPerWeek: -0.6, confirmed: true, targetKg: 78 }, lifts: flat(), sleep: goodSleep }),
  },
  {
    id: "cut-under-lifts-down",
    label: "Cutting hard, 600 under target, lifts dropping",
    expect: ["ADH-1", "LOSS-1", "LOSS-2", "LOSS-2u", "LOSS-3", "STR-1", "STR-2"],
    cause: "under",
    spec: (seed, days) => ({ seed, days, bodyweightKg: 85, trueTdeeKcal: 2800, intake: "toTarget", intakeOffsetKcal: -600, goal: { ratePctPerWeek: -0.6, confirmed: true, targetKg: 78 }, lifts: dropping(-8, 21), sleep: goodSleep }),
  },
  {
    id: "cut-short-sleep",
    label: "Cutting to plan, sleeping 6.2 h",
    expect: ["SLEEP-1", "SLEEP-1i", "SLEEP-2"],
    asFlag: true,
    spec: (seed, days) => ({ seed, days, bodyweightKg: 85, trueTdeeKcal: 2800, intake: "toTarget", goal: { ratePctPerWeek: -0.6, confirmed: true, targetKg: 78 }, lifts: flat(), sleep: { meanH: 6.2, sdH: 0.5, source: "healthkit", loggedShare: 0.95 } }),
  },
  {
    id: "bulk-on-plan",
    label: "Lean bulk, eats to target, lifts rising",
    expect: ["ON-TRACK", "NO-CHANGE", "GAIN-3"],
    spec: (seed, days) => ({ seed, days, bodyweightKg: 75, trueTdeeKcal: 2700, intake: "toTarget", goal: { ratePctPerWeek: 0.25, confirmed: true, targetKg: 80, trainingStatus: "intermediate" }, lifts: rising(4), sleep: goodSleep }),
  },
  {
    id: "bulk-over",
    label: "Lean bulk, eats 500 kcal over target",
    expect: ["GAIN-1", "ADH-1"],
    cause: "over",
    spec: (seed, days) => ({ seed, days, bodyweightKg: 75, trueTdeeKcal: 2700, intake: "toTarget", intakeOffsetKcal: 500, goal: { ratePctPerWeek: 0.25, confirmed: true, targetKg: 80, trainingStatus: "intermediate" }, lifts: rising(4), sleep: goodSleep }),
  },
];

type Variant = { id: string; label: string; weighInDays: "daily" | "4x" | "sparse"; loggedShare: number; partialShare: number; noiseSdKg?: number };

const VARIANTS: Variant[] = [
  { id: "ideal", label: "Ideal: daily weigh-ins, every day logged", weighInDays: "daily", loggedShare: 1, partialShare: 0 },
  { id: "typical", label: "Typical: weigh-ins 4 days a week, 85% of days logged", weighInDays: "4x", loggedShare: 0.85, partialShare: 0.05 },
  { id: "patchy", label: "Patchy: 2 to 3 weigh-ins a week, 55% of days logged, some part-logged", weighInDays: "sparse", loggedShare: 0.55, partialShare: 0.15 },
  { id: "noisy", label: "Noisy scale: daily weigh-ins, ±1 kg day to day", weighInDays: "daily", loggedShare: 1, partialShare: 0, noiseSdKg: 1.0 },
];

/** Drops whole days of food (never logged) and cuts some to one small entry (part-logged), seeded. */
function degradeFood(entries: readonly FoodEntry[], v: Variant, seed: number): FoodEntry[] {
  if (v.loggedShare >= 1 && v.partialShare <= 0) return [...entries];
  const rand = mulberry32(seed * 7919 + v.id.length * 104729);
  const byDate = new Map<LocalDate, FoodEntry[]>();
  for (const e of entries) byDate.set(e.date, [...(byDate.get(e.date) ?? []), e]);
  const out: FoodEntry[] = [];
  for (const [, list] of [...byDate.entries()].sort((a, b) => (a[0] < b[0] ? -1 : 1))) {
    const r = rand();
    if (r > v.loggedShare) continue;
    if (rand() < v.partialShare) {
      const first = list[0];
      out.push({ ...first, kcal: Math.round(first.kcal * 0.25), proteinG: Math.round(first.proteinG * 0.25), carbsG: Math.round(first.carbsG * 0.25), fatG: Math.round(first.fatG * 0.25) });
      continue;
    }
    out.push(...list);
  }
  return out;
}

type Run = {
  verdict: string;
  flags: string[];
  early: boolean;
  correct: boolean;
  expKcal: number | null;
  expState: string;
  expErr: number | null;
  rate: number | null;
  rateErr: number | null;
  causeNamed: boolean | null;
};

function runOne(a: Archetype, v: Variant, t: number, seed: number): Run {
  const days = t + 1;
  const sc: Scenario = makeScenario({ ...a.spec(seed, days), startDate: START, weighInDays: v.weighInDays, ...(v.noiseSdKg ? { noiseSdKg: v.noiseSdKg } : {}) });
  const foodEntries = degradeFood(sc.foodEntries, v, seed);
  const now = { today: sc.today, tz: "UTC" };
  const inputs = { goal: sc.goal, goals: sc.goal ? [sc.goal] : [], program: sc.program, profile: sc.profile, weighIns: sc.weighIns, foodEntries, dayFlags: sc.dayFlags, sleepNights: sc.sleepNights, waist: sc.waist, workouts: sc.workouts, weightUnit: "kg" as const };
  const an: PhysiqueAnalysis = buildPhysiqueAnalysis(inputs, now);
  const verdict = an.verdict.id;
  const flags = an.flags.map((f) => f.id);
  const early = EARLY.has(verdict);
  const correct = a.asFlag ? a.expect.includes(verdict) || flags.some((f) => a.expect.includes(f)) : a.expect.includes(verdict);
  const trueTdee = sc.spec.trueTdeeKcal ?? null;
  const expKcal = an.expenditure.kcal;
  const expErr = expKcal != null && trueTdee != null ? expKcal - trueTdee : null;
  const w = an.weight.rateWindowDays;
  let rateErr: number | null = null;
  if (an.weight.ratePctPerWeek != null && w) {
    const end = sc.trueKg.length - 1;
    const from = Math.max(0, end - w);
    const truth = ((sc.trueKg[end] - sc.trueKg[from]) / sc.trueKg[from]) * 100 * (7 / Math.max(1, end - from));
    rateErr = an.weight.ratePctPerWeek - truth;
  }
  // The weekly report's weight link, for archetypes that should name intake as the cause, from week 4.
  let causeNamed: boolean | null = null;
  if (a.cause && t >= 28) {
    const exp = computeExpenditure({ profile: sc.profile, weighIns: sc.weighIns, foodEntries, dayFlags: sc.dayFlags, goals: sc.goal ? [sc.goal] : [], workouts: sc.workouts, onboarding: {} }, now);
    const start = reportWeekStart(addDays(sc.today, -7));
    const base = { weighIns: sc.weighIns, foodEntries, dayFlags: sc.dayFlags, sleepNights: sc.sleepNights, workouts: sc.workouts, program: sc.program, goal: sc.goal, weightUnit: "kg" as const, expenditure: exp?.series ?? null };
    const report = buildWeekReport(base, start, now);
    const prev = buildWeekReport(base, addDays(start, -7), now);
    const links = linkedReasons({ report, prev, analysis: an, goal: sc.goal, recovery: null, plannedSessions: 2, kg: (x: number) => `${x.toFixed(1)} kg`, current: true });
    const weight = links.find((l) => l.id === "weight");
    // The card reads "400 over the 2,240 target".
    const want = a.cause === "over" ? /over (the [\d,]+ )?target/i : /under (the [\d,]+ )?target/i;
    causeNamed = weight ? weight.causes.some((c) => want.test(c)) : false;
  }
  return { verdict, flags, early, correct, expKcal, expState: an.expenditure.state, expErr, rate: an.weight.ratePctPerWeek, rateErr, causeNamed };
}

const median = (xs: number[]) => {
  if (xs.length === 0) return null;
  const s = [...xs].sort((a, b) => a - b);
  const m = Math.floor(s.length / 2);
  return s.length % 2 ? s[m] : (s[m - 1] + s[m]) / 2;
};
const quantile = (xs: number[], q: number) => {
  if (xs.length === 0) return null;
  const s = [...xs].sort((a, b) => a - b);
  return s[Math.min(s.length - 1, Math.floor(q * s.length))];
};
const share = (xs: boolean[]) => (xs.length ? xs.filter(Boolean).length / xs.length : null);
const round = (x: number | null, d = 2) => (x == null ? null : Math.round(x * 10 ** d) / 10 ** d);

type Cell = {
  archetype: string;
  variant: string;
  day: number;
  runs: number;
  early: number | null;
  correct: number | null;
  /** Said something substantive that was not the expected read. */
  wrong: number | null;
  /** "On track" for someone whose weight is off plan (rate-judged archetypes that don't expect ON-TRACK). */
  falseOnTrack: number | null;
  expMedianAbsErr: number | null;
  expP90AbsErr: number | null;
  expUpdating: number | null;
  rateShare: number | null;
  rateMedianAbsErr: number | null;
  causeNamed: number | null;
  verdicts: Record<string, number>;
};

const cells: Cell[] = [];
const t0 = Date.now();
for (const a of ARCHETYPES) {
  for (const v of VARIANTS) {
    for (const t of TIMINGS) {
      const runs: Run[] = [];
      for (let s = 1; s <= SEEDS; s++) runs.push(runOne(a, v, t, 1000 + s));
      const verdicts: Record<string, number> = {};
      for (const r of runs) verdicts[r.verdict] = (verdicts[r.verdict] ?? 0) + 1;
      const expErrs = runs.map((r) => r.expErr).filter((x): x is number => x != null).map(Math.abs);
      const rateErrs = runs.map((r) => r.rateErr).filter((x): x is number => x != null).map(Math.abs);
      const causes = runs.map((r) => r.causeNamed).filter((x): x is boolean => x != null);
      cells.push({
        archetype: a.id,
        variant: v.id,
        day: t,
        runs: runs.length,
        early: round(share(runs.map((r) => r.early))),
        correct: round(share(runs.map((r) => r.correct))),
        wrong: round(share(runs.map((r) => !r.early && !r.correct))),
        falseOnTrack: a.asFlag || a.expect.includes("ON-TRACK") ? null : round(share(runs.map((r) => r.verdict === "ON-TRACK"))),
        expMedianAbsErr: round(median(expErrs), 0),
        expP90AbsErr: round(quantile(expErrs, 0.9), 0),
        expUpdating: round(share(runs.map((r) => r.expState !== "calibrating" && r.expState !== "holding"))),
        rateShare: round(share(runs.map((r) => r.rate != null))),
        rateMedianAbsErr: round(median(rateErrs), 2),
        causeNamed: causes.length ? round(share(causes)) : null,
        verdicts,
      });
    }
    process.stderr.write(`${a.id} × ${v.id} done (${Math.round((Date.now() - t0) / 1000)} s)\n`);
  }
}

const out = {
  generated: "2026-10-20",
  seedsPerCell: SEEDS,
  timings: TIMINGS,
  archetypes: ARCHETYPES.map((a) => ({ id: a.id, label: a.label, expect: a.expect, asFlag: !!a.asFlag, cause: a.cause ?? null })),
  variants: VARIANTS,
  cells,
};
writeFileSync(OUT, JSON.stringify(out, null, 1));

// ── Summary ──
for (const v of VARIANTS) {
  console.log(`\n== ${v.label}`);
  console.log(`archetype`.padEnd(24) + TIMINGS.map((t) => `d${t}`.padStart(15)).join(""));
  for (const a of ARCHETYPES) {
    const row = TIMINGS.map((t) => {
      const c = cells.find((x) => x.archetype === a.id && x.variant === v.id && x.day === t)!;
      return `${Math.round((c.correct ?? 0) * 100)}/${Math.round((c.early ?? 0) * 100)}/${Math.round((c.wrong ?? 0) * 100)}`.padStart(15);
    });
    console.log(a.id.padEnd(24) + row.join(""));
  }
  const expRow = TIMINGS.map((t) => {
    const xs = cells.filter((x) => x.variant === v.id && x.day === t).map((x) => x.expMedianAbsErr).filter((x): x is number => x != null);
    return `${median(xs) ?? "-"}`.padStart(15);
  });
  console.log("maint |err| kcal".padEnd(24) + expRow.join(""));
}
console.log(`\ncorrect/early/wrong %, ${SEEDS} seeds a cell, ${Math.round((Date.now() - t0) / 1000)} s`);
