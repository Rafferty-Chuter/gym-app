/**
 * Do the report's findings say the right thing? (E1, for the founder,
 * 2026-10-21.) Simulated people with a known truth (what they really eat,
 * how much of it they log, how they sleep, what their lifts do) are run
 * through the real engine for ten weeks. For each, the report's findings
 * (`lib/physique/findings.ts`) are checked against what should be said,
 * and healthy controls are checked for false alarms.
 *
 *   npx tsx scripts/study-findings.ts [seeds=30] [out=docs/plan/research/J-findings-study.json]
 *
 * Also traces what the engine does for someone who logs only part of what
 * they eat: the maintenance estimate, the targets, and the weight.
 * Pure engine code only: no storage, no network.
 */

import { writeFileSync } from "node:fs";
import { type LocalDate } from "@/lib/dates";
import { makeScenario, type LiftSpec, type ScenarioSpec } from "@/lib/physique/fixtures";
import { buildPhysiqueAnalysis } from "@/lib/physique/judge";
import { findings, type FindingId } from "@/lib/physique/findings";
import { linkedReasons } from "@/lib/physique/linkedReasons";
import { buildWeekReport, reportWeekStart } from "@/lib/physique/weekReport";
import { computeExpenditure } from "@/lib/physique/expenditure";
import { targetInEffect } from "@/lib/physique/intake";
import { addDays } from "@/lib/dates";

const SEEDS = Number(process.argv[2] ?? 30);
const OUT = process.argv[3] ?? "docs/plan/research/J-findings-study.json";
const START: LocalDate = "2026-07-01";
const DAYS = 77;
/** Three weeks of training before the goal, as the app's seed presets use, so the strength read has its baseline. */
const PRE = 21;

const lifts = (changePct: number, profile: "linear" | "step" = "linear", atDay = 42): LiftSpec[] => [
  { name: "Squat", startE1rm: 150, profile, changePct, atDay, perWeek: 2, cv: 0.02 },
  { name: "Bench Press", startE1rm: 110, profile, changePct, atDay, perWeek: 2, cv: 0.02 },
];
const goodSleep = { meanH: 7.6, sdH: 0.5, source: "manual" as const, loggedShare: 0.95 };
const shortSleep = { meanH: 6.1, sdH: 0.5, source: "manual" as const, loggedShare: 0.95 };
const base = { days: DAYS, preDays: PRE, startDate: START, bodyweightKg: 85, trueTdeeKcal: 2800 };

type Persona = { id: string; label: string; expect: FindingId[]; spec: (seed: number) => ScenarioSpec };

const PERSONAS: Persona[] = [
  // ── Should be found ──
  { id: "sleep-gain", label: "Lean gain, sleeps 6.1 h, lifts flat", expect: ["sleep-lifts"], spec: (seed) => ({ ...base, seed, bodyweightKg: 80, intake: "toTarget", goal: { ratePctPerWeek: 0.25, trainingStatus: "intermediate" }, sleep: shortSleep, lifts: lifts(0) }) },
  { id: "sleep-cut", label: "Cut, sleeps 6.1 h, lifts down 7%", expect: ["sleep-lifts"], spec: (seed) => ({ ...base, seed, intake: "toTarget", goal: { ratePctPerWeek: -0.5, targetKg: 78 }, sleep: shortSleep, lifts: lifts(-7, "step", 49) }) },
  { id: "protein-cut", label: "Cut, protein about 1.1 g/kg", expect: ["protein-low"], spec: (seed) => ({ ...base, seed, intake: "toTarget", goal: { ratePctPerWeek: -0.5, targetKg: 78 }, sleep: goodSleep, lifts: lifts(0), proteinShare: 0.16 }) },
  { id: "protein-gain", label: "Lean gain, protein about 1.3 g/kg", expect: ["protein-low"], spec: (seed) => ({ ...base, seed, bodyweightKg: 80, intake: "toTarget", goal: { ratePctPerWeek: 0.25, trainingStatus: "intermediate" }, sleep: goodSleep, lifts: lifts(3), proteinShare: 0.15 }) },
  { id: "gain-over", label: "Lean gain, eats 600 over target", expect: ["gain-fast"], spec: (seed) => ({ ...base, seed, bodyweightKg: 80, intake: "toTarget", intakeOffsetKcal: 600, goal: { ratePctPerWeek: 0.25, trainingStatus: "intermediate" }, sleep: goodSleep, lifts: lifts(3) }) },
  { id: "cut-fast", label: "Cut, 1,100 kcal deficit, lifts down 7% (protein kept high)", expect: ["cut-fast-lifts"], spec: (seed) => ({ ...base, seed, intake: { meanKcal: 1700, sdKcal: 250 }, goal: { ratePctPerWeek: -1.0, targetKg: 75 }, sleep: goodSleep, lifts: lifts(-7, "step", 49), proteinShare: 0.42 }) },
  { id: "underlog-60", label: "Eats maintenance, logs 60% of it, 'can't lose'", expect: ["underlog"], spec: (seed) => ({ ...base, seed, intake: { meanKcal: 2800, sdKcal: 250 }, logShare: 0.6, goal: { ratePctPerWeek: -0.5, targetKg: 78 }, sleep: goodSleep, lifts: lifts(0) }) },
  // ── Should stay quiet ──
  { id: "ok-cut", label: "Control: cut on target, sleeps 7.6 h, 2 g/kg protein", expect: [], spec: (seed) => ({ ...base, seed, intake: "toTarget", goal: { ratePctPerWeek: -0.5, targetKg: 78 }, sleep: goodSleep, lifts: lifts(0) }) },
  { id: "ok-gain", label: "Control: lean gain on target, lifts rising", expect: [], spec: (seed) => ({ ...base, seed, bodyweightKg: 80, intake: "toTarget", goal: { ratePctPerWeek: 0.25, trainingStatus: "intermediate" }, sleep: goodSleep, lifts: lifts(4) }) },
  { id: "ok-honest-low", label: "Control: eats 2,200, logs all, losing", expect: [], spec: (seed) => ({ ...base, seed, intake: { meanKcal: 2200, sdKcal: 250 }, goal: { ratePctPerWeek: -0.5, targetKg: 78 }, sleep: goodSleep, lifts: lifts(0) }) },
  { id: "ok-small", label: "Control: 58 kg woman, eats 1,500, logs all, losing", expect: [], spec: (seed) => ({ ...base, seed, bodyweightKg: 58, trueTdeeKcal: 1900, intake: { meanKcal: 1500, sdKcal: 200 }, goal: { ratePctPerWeek: -0.5, targetKg: 54 }, sleep: goodSleep, lifts: lifts(0), profile: { sex: "F", age: 35, heightCm: 160 } }) },
  { id: "ok-short-progressing", label: "Control: lean gain, sleeps 6.1 h, lifts rising 6%", expect: [], spec: (seed) => ({ ...base, seed, bodyweightKg: 80, intake: "toTarget", goal: { ratePctPerWeek: 0.25, trainingStatus: "intermediate" }, sleep: shortSleep, lifts: lifts(6) }) },
  { id: "ok-flat-sleeps", label: "Control: lean gain, sleeps 7.6 h, lifts flat", expect: [], spec: (seed) => ({ ...base, seed, bodyweightKg: 80, intake: "toTarget", goal: { ratePctPerWeek: 0.25, trainingStatus: "intermediate" }, sleep: goodSleep, lifts: lifts(0) }) },
  { id: "ok-light-underlog", label: "Eats maintenance, logs 85% (mild under-logging)", expect: [], spec: (seed) => ({ ...base, seed, intake: { meanKcal: 2800, sdKcal: 250 }, logShare: 0.85, goal: { ratePctPerWeek: -0.5, targetKg: 78 }, sleep: goodSleep, lifts: lifts(0) }) },
];

function run(spec: ScenarioSpec) {
  const sc = makeScenario(spec);
  const now = { today: sc.today, tz: "UTC" };
  const inputs = { goal: sc.goal, goals: sc.goal ? [sc.goal] : [], program: sc.program, profile: sc.profile, weighIns: sc.weighIns, foodEntries: sc.foodEntries, dayFlags: sc.dayFlags, sleepNights: sc.sleepNights, waist: sc.waist, workouts: sc.workouts, weightUnit: "kg" as const };
  const analysis = buildPhysiqueAnalysis(inputs, now);
  const f = findings({ weighIns: sc.weighIns, foodEntries: sc.foodEntries, dayFlags: sc.dayFlags, sleepNights: sc.sleepNights, goal: sc.goal, program: sc.program, profile: sc.profile, workouts: sc.workouts, unit: "kg" }, sc.today);
  return { sc, analysis, f };
}

// ── Personas ──

type Row = { id: string; label: string; expect: FindingId[]; found: number; falseAlarms: number; runs: number; byId: Record<string, number>; example: unknown };
const rows: Row[] = [];
for (const p of PERSONAS) {
  const byId: Record<string, number> = {};
  let found = 0;
  let falseAlarms = 0;
  let example: unknown = null;
  for (let seed = 1; seed <= SEEDS; seed++) {
    const { f, analysis } = run(p.spec(seed));
    const ids = f.map((x) => x.id);
    for (const id of ids) byId[id] = (byId[id] ?? 0) + 1;
    if (p.expect.length && p.expect.every((e) => ids.includes(e))) found += 1;
    if (ids.some((id) => !p.expect.includes(id))) falseAlarms += 1;
    if (seed === 1) example = { verdict: `${analysis.verdict.title}: ${analysis.verdict.detail}`, findings: f.map((x) => ({ title: x.title, data: x.data, evidence: x.evidence })) };
  }
  rows.push({ id: p.id, label: p.label, expect: p.expect, found, falseAlarms, runs: SEEDS, byId, example });
}

// ── Under-logging: how far it can be seen ──

const sweep: Array<{ logShare: number; flagged: number; runs: number }> = [];
for (const share of [0.5, 0.6, 0.65, 0.7, 0.75, 0.8, 0.85, 0.9, 1]) {
  let flagged = 0;
  for (let seed = 1; seed <= SEEDS; seed++) {
    const { f } = run({ ...base, seed, intake: { meanKcal: 2800, sdKcal: 250 }, logShare: share, goal: { ratePctPerWeek: -0.5, targetKg: 78 }, sleep: goodSleep, lifts: lifts(0) });
    if (f.some((x) => x.id === "underlog")) flagged += 1;
  }
  sweep.push({ logShare: share, flagged, runs: SEEDS });
}

// ── Under-logging: what the engine does with it ──

/** Someone who believes they eat to target but logs only part of it: they log the target, they eat target / share. */
function trace(share: number) {
  const out: Array<{ week: number; maintenanceEst: number | null; targetKcal: number | null; loggedKcal: number; eatenKcal: number; trendKg: number | null; verdict: string }> = [];
  for (const week of [2, 4, 6, 8, 10, 12]) {
    const days = PRE + week * 7;
    const sc = makeScenario({ ...base, days, seed: 7, intake: "toTarget", intakeSdKcal: 150, logShare: share, goal: { ratePctPerWeek: -0.5, targetKg: 75 }, sleep: goodSleep, lifts: lifts(0) });
    const now = { today: sc.today, tz: "UTC" };
    const an = buildPhysiqueAnalysis({ goal: sc.goal, goals: sc.goal ? [sc.goal] : [], program: sc.program, profile: sc.profile, weighIns: sc.weighIns, foodEntries: sc.foodEntries, dayFlags: sc.dayFlags, sleepNights: sc.sleepNights, waist: sc.waist, workouts: sc.workouts, weightUnit: "kg" }, now);
    const lastWeek = sc.foodEntries.filter((e) => e.date > addDays(sc.today, -7));
    const logged = lastWeek.reduce((s, e) => s + e.kcal, 0) / Math.max(1, lastWeek.length);
    out.push({
      week,
      maintenanceEst: an.expenditure.kcal != null ? Math.round(an.expenditure.kcal) : null,
      targetKcal: targetInEffect(sc.program, sc.today)?.kcal ?? null,
      loggedKcal: Math.round(logged),
      eatenKcal: Math.round(logged / share),
      trendKg: an.weight.trendKg != null ? Math.round(an.weight.trendKg * 10) / 10 : null,
      verdict: an.verdict.title,
    });
  }
  return out;
}
const traces = { honest: trace(1), logs70: trace(0.7), logs55: trace(0.55) };

// ── The existing Food and weight link on a cut eaten over target ──

const over = makeScenario({ ...base, seed: 3, intake: "toTarget", intakeOffsetKcal: 400, goal: { ratePctPerWeek: -0.5, targetKg: 78 }, sleep: goodSleep, lifts: lifts(0) });
const overNow = { today: over.today, tz: "UTC" };
const overAn = buildPhysiqueAnalysis({ goal: over.goal, goals: over.goal ? [over.goal] : [], program: over.program, profile: over.profile, weighIns: over.weighIns, foodEntries: over.foodEntries, dayFlags: over.dayFlags, sleepNights: over.sleepNights, waist: over.waist, workouts: over.workouts, weightUnit: "kg" }, overNow);
const overReport = buildWeekReport({ weighIns: over.weighIns, foodEntries: over.foodEntries, dayFlags: over.dayFlags, sleepNights: over.sleepNights, workouts: over.workouts, program: over.program, goal: over.goal, weightUnit: "kg", expenditure: computeExpenditure({ profile: over.profile, weighIns: over.weighIns, foodEntries: over.foodEntries, dayFlags: over.dayFlags, goals: over.goal ? [over.goal] : [], workouts: over.workouts, onboarding: {} }, overNow)?.series ?? null }, reportWeekStart(addDays(over.today, -7)), overNow);
const overLink = linkedReasons({ report: overReport, prev: null, analysis: overAn, goal: over.goal, recovery: null, kg: (x) => `${x.toFixed(1)} kg` }).find((l) => l.id === "weight") ?? null;

// ── Output ──

writeFileSync(OUT, JSON.stringify({ seeds: SEEDS, days: DAYS, rows, sweep, traces, overTarget: overLink ? { title: overLink.title, causes: overLink.causes, figures: overLink.figures } : null }, null, 2));
console.log(`Findings study: ${SEEDS} seeds a persona, ${DAYS} days each\n`);
for (const r of rows) {
  const hit = r.expect.length ? `${r.found}/${r.runs} found` : "control";
  console.log(`${r.label.padEnd(56)} ${hit.padEnd(14)} false alarms ${r.falseAlarms}/${r.runs}   ${JSON.stringify(r.byId)}`);
}
console.log("\nUnder-logging seen, by share logged (eats 2,800 at maintenance, 85 kg man):");
for (const s of sweep) console.log(`  logs ${Math.round(s.logShare * 100)}%: flagged ${s.flagged}/${s.runs}`);
console.log("\nWhat the engine does when someone logs the target but eats more (true maintenance 2,800):");
for (const [k, t] of Object.entries(traces)) {
  console.log(`  ${k}`);
  for (const w of t) console.log(`    week ${String(w.week).padStart(2)}: maintenance est ${w.maintenanceEst}, target ${w.targetKcal}, logged ${w.loggedKcal}, eaten ${w.eatenKcal}, trend ${w.trendKg} kg · ${w.verdict}`);
}
console.log(`\nCut eaten 400 over target, Food and weight: ${overLink?.title}\n  ${overLink?.causes.join("\n  ")}`);
console.log(`\nWrote ${OUT}`);
