/**
 * The weekly report's scorecard (W4): six tiles, each one number with what
 * it is measured against and a tone, plus the week's daily values for a
 * small chart. Pure: built from this week's report and last week's.
 *
 * Tone is "good", "watch" or "neutral" (no judgement). Silence beats false
 * positives: a tile without data says so and stays neutral.
 */

import { formatHoursMin } from "@/lib/physique/dayTotals";
import { formatWeight, kgToDisplay, type WeightUnit } from "@/lib/units";
import type { GoalType, PhysiqueAnalysis, StrengthStatus } from "@/lib/physique/types";
import type { WeekReport } from "@/lib/physique/weekReport";

// ── Thresholds ──

/** Average intake within this of the target reads as on target. OURS: under the day-to-day noise of logging. */
export const INTAKE_ON_TARGET_KCAL = 100;
/** Share of complete days that must hit protein for a good tone. OURS: five days in seven. */
export const PROTEIN_GOOD_SHARE = 0.7;
/** Maintenance: a weekly trend move within this reads as holding. OURS. */
export const MAINTAIN_BAND_KG = 0.3;
/** Main lifts down this much on average read as watch. OURS, the same 2% the Monday review uses. */
export const LIFTS_DOWN_PCT = 2;
/** Lifts named on the main-lifts tile, biggest mover first. OURS: one fits the tile at 390 px. */
export const STRENGTH_TILE_LIFTS = 1;
/** Sleep within this of the goal reads as good; further than SLEEP_SHORT_H below as watch. OURS, matching the review's 0.5 h. */
export const SLEEP_GOOD_H = 0.25;
export const SLEEP_SHORT_H = 0.5;

// ── Types ──

export type Tone = "good" | "watch" | "neutral";

export type TileId = "weight" | "calories" | "protein" | "training" | "strength" | "sleep";

export type Chart =
  | { kind: "line"; values: (number | null)[] }
  | { kind: "bars"; values: (number | null)[]; target: number | null }
  | { kind: "none" };

export type Tile = {
  id: TileId;
  label: string;
  /** The headline value, formatted; "–" without data. */
  value: string;
  /** What it is measured against, one short line. */
  sub: string;
  /** The change or gap, short, with its tone; null when there is nothing to compare. */
  delta: { text: string; tone: Tone } | null;
  chart: Chart;
  href: string;
};

export type ScorecardInputs = {
  report: WeekReport;
  /** The week before, for "vs last week"; null when there is none. */
  prev: WeekReport | null;
  unit: WeightUnit;
  goalType: GoalType | null;
  /**
   * The strength engine's read since the phase began, the one Body, Home
   * and the report's summary use. Null before there is one. The tile never
   * computes its own lift change, so the report cannot disagree with itself.
   */
  strength?: PhysiqueAnalysis["strength"] | null;
};

// ── Helpers ──

const n = (v: number) => Math.round(v).toLocaleString("en-GB");
const sign = (v: number) => (v > 0 ? "+" : v < 0 ? "−" : "");

function kgDelta(kg: number, unit: WeightUnit): string {
  const v = kgToDisplay(Math.abs(kg), unit);
  return `${sign(kg)}${v.toFixed(1)} ${unit}`;
}

function minutes(h: number): string {
  const m = Math.round(h * 60);
  return m < 60 ? `${m} min` : formatHoursMin(m);
}

// ── Tiles ──

function weightTile({ report, unit, goalType }: ScorecardInputs): Tile {
  const w = report.weight;
  const value = w.endTrendKg == null ? "–" : formatWeight(w.endTrendKg, unit);
  let delta: Tile["delta"] = null;
  if (w.deltaKg != null) {
    const d = w.deltaKg;
    const tone: Tone = goalType === "lose" ? (d < 0 ? "good" : "watch") : goalType === "gain" ? (d > 0 ? "good" : "watch") : goalType === "maintain" ? (Math.abs(d) <= MAINTAIN_BAND_KG ? "good" : "watch") : "neutral";
    delta = { text: `${kgDelta(d, unit)} this week`, tone };
  }
  const sub = w.ratePctPerWeek == null ? `${w.weighIns} of ${report.daysCovered} days weighed` : `${w.ratePctPerWeek > 0 ? "+" : w.ratePctPerWeek < 0 ? "−" : ""}${Math.abs(w.ratePctPerWeek).toFixed(2)} %/wk · ${w.weighIns} of ${report.daysCovered} weighed`;
  return { id: "weight", label: "Weight trend", value, sub, delta, chart: { kind: "line", values: report.days.map((d) => d.trendKg) }, href: "/body" };
}

function caloriesTile({ report }: ScorecardInputs): Tile {
  const f = report.food;
  const value = f.meanKcal == null ? "–" : `${n(f.meanKcal)}`;
  const sub = `${f.targetKcal != null ? `Target ${n(f.targetKcal)}` : "No target"} · ${f.daysLogged} of ${report.daysCovered} logged`;
  const delta = f.deltaKcal == null ? null : { text: Math.abs(f.deltaKcal) <= INTAKE_ON_TARGET_KCAL ? "On target" : `${sign(f.deltaKcal)}${n(Math.abs(f.deltaKcal))} vs target`, tone: (Math.abs(f.deltaKcal) <= INTAKE_ON_TARGET_KCAL ? "good" : "watch") as Tone };
  return { id: "calories", label: "Calories a day", value, sub, delta, chart: { kind: "bars", values: report.days.map((d) => d.kcal), target: f.targetKcal }, href: "/food/energy" };
}

function proteinTile({ report }: ScorecardInputs): Tile {
  const f = report.food;
  const value = f.meanProteinG == null ? "–" : `${n(f.meanProteinG)} g`;
  const sub = f.targetProteinG != null ? `Target ${n(f.targetProteinG)} g${f.proteinGPerKg != null ? ` · ${f.proteinGPerKg.toFixed(1)} g/kg` : ""}` : "No target";
  let delta: Tile["delta"] = null;
  if (f.proteinDaysHit != null && f.complete > 0) {
    delta = { text: `${f.proteinDaysHit} of ${f.complete} days on target`, tone: f.proteinDaysHit / f.complete >= PROTEIN_GOOD_SHARE ? "good" : "watch" };
  }
  return { id: "protein", label: "Protein a day", value, sub, delta, chart: { kind: "bars", values: report.days.map((d) => d.proteinG), target: f.targetProteinG }, href: "/food" };
}

function trainingTile({ report, prev }: ScorecardInputs): Tile {
  const t = report.training;
  const value = `${t.sessions}`;
  const sub = `${t.sessions === 1 ? "session" : "sessions"} · ${t.hardSets} hard sets`;
  const diff = prev ? t.hardSets - prev.training.hardSets : 0;
  const delta = prev && prev.training.hardSets > 0 ? { text: diff === 0 ? "Same sets as last week" : `${sign(diff)}${Math.abs(diff)} sets vs last week`, tone: "neutral" as Tone } : null;
  return { id: "training", label: "Training", value, sub, delta, chart: { kind: "bars", values: report.days.map((d) => (d.hardSets > 0 ? d.hardSets : null)), target: null }, href: "/train" };
}

const STRENGTH_WORD: Record<StrengthStatus, { value: string; tone: Tone }> = {
  rising: { value: "Rising", tone: "good" },
  holding: { value: "Holding", tone: "good" },
  "one-lift": { value: "One down", tone: "watch" },
  dropping: { value: "Dropping", tone: "watch" },
  unclear: { value: "–", tone: "neutral" },
};

function strengthTile({ report, strength }: ScorecardInputs): Tile {
  const none = (sub: string): Tile => ({ id: "strength", label: "Main lifts", value: "–", sub, delta: null, chart: { kind: "none" }, href: "/train" });
  if (!strength) return none(report.training.lifts.length ? "Not enough sessions to read yet" : "No main lifts logged");
  const moved = strength.lifts.filter((l) => l.changePct != null).sort((a, b) => Math.abs(b.changePct as number) - Math.abs(a.changePct as number));
  if (strength.status === "unclear" || moved.length === 0) return none(strength.baselineMissing ? "No lifts from before the phase to compare" : "Not enough sessions to read yet");
  const word = STRENGTH_WORD[strength.status];
  const named = moved.slice(0, STRENGTH_TILE_LIFTS).map((l) => `${l.name} ${sign(l.changePct as number)}${Math.abs(l.changePct as number).toFixed(0)}%`);
  return {
    id: "strength",
    label: "Main lifts",
    value: word.value,
    sub: "e1RM since the phase began",
    delta: { text: named.join(" · "), tone: word.tone },
    chart: { kind: "none" },
    href: "/exercises",
  };
}

function sleepTile({ report, prev }: ScorecardInputs): Tile {
  const s = report.sleep;
  const value = s.meanH == null ? "–" : minutes(s.meanH);
  const sub = `Goal ${minutes(s.goalH)}${s.wakeSpreadMin != null ? ` · wake ±${s.wakeSpreadMin} min` : ""}`;
  let delta: Tile["delta"] = null;
  if (s.meanH != null) {
    const gap = s.goalH - s.meanH;
    const tone: Tone = gap <= SLEEP_GOOD_H ? "good" : gap > SLEEP_SHORT_H ? "watch" : "neutral";
    const vsLast = prev?.sleep.meanH != null ? s.meanH - prev.sleep.meanH : null;
    const text = vsLast != null && Math.abs(vsLast) >= 1 / 6 ? `${sign(vsLast)}${minutes(Math.abs(vsLast))} vs last week` : gap <= SLEEP_GOOD_H ? "On the goal" : `${minutes(gap)} under the goal`;
    delta = { text, tone };
  }
  return { id: "sleep", label: "Sleep a night", value, sub, delta, chart: { kind: "bars", values: report.days.map((d) => d.asleepH), target: s.goalH }, href: "/sleep" };
}

/** The six tiles, in reading order: body, food, training, sleep. */
export function scorecard(i: ScorecardInputs): Tile[] {
  return [weightTile(i), caloriesTile(i), proteinTile(i), trainingTile(i), strengthTile(i), sleepTile(i)];
}

/** "6 of 7 days logged · 7 weigh-ins · 7 nights · 4 sessions": what the report stands on. */
export function coverageLine(r: WeekReport): string {
  return [`${r.food.daysLogged} of ${r.daysCovered} days logged`, `${r.weight.weighIns} ${r.weight.weighIns === 1 ? "weigh-in" : "weigh-ins"}`, `${r.sleep.nights} ${r.sleep.nights === 1 ? "night" : "nights"}`, `${r.training.sessions} ${r.training.sessions === 1 ? "session" : "sessions"}`].join(" · ");
}
