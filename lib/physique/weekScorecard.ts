/**
 * The weekly report's scorecard (W4, tailored in B3): six tiles, each one
 * number with what it is measured against and a tone, plus the week's
 * daily values for a small chart. Pure: built from this week's report and
 * last week's.
 *
 * The goal picks the tiles and their order (`FOCUS_TILES`): a cut leads
 * with the rate against plan and calories, a lean gain with the rate (too
 * fast adds fat), a recomp with the waist, and without a physique goal the
 * health reads lead (wake time, training days, protein, fibre, steps,
 * resting heart rate). Optional tiles appear only with data; the gap is
 * filled from `FOCUS_FALLBACK`, so there are always six.
 *
 * Tone is "good", "watch" or "neutral" (no judgement). Silence beats false
 * positives: a core tile without data says so and stays neutral.
 */

import { formatHoursMin } from "@/lib/physique/dayTotals";
import { ON_TRACK_TOLERANCE } from "@/lib/physique/judge";
import { RHR_FLAG_BPM } from "@/lib/physique/recovery";
import { WAKE_SPREAD_MIN } from "@/lib/physique/sleepScore";
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
/** Daily fibre for adults. PUB: SACN 2015, Carbohydrates and Health (30 g AOAC fibre, the measure CoFID carries). */
export const FIBRE_TARGET_G = 30;
/** Average steps from which the tile reads good. PUB: Paluch et al. 2022 (Lancet Public Health), mortality benefit levels off around 6,000 to 8,000 for older adults and 8,000 to 10,000 for younger ones; 7,000 is the low end for most. */
export const STEPS_GOOD = 7000;
/** Training days a week that read good. PUB: WHO 2020 physical activity guidelines, muscle strengthening on two or more days. */
export const TRAINING_DAYS_GOOD = 2;
/** Waist moves within this read as holding. EVID: measurement error near 1 cm (Verweij 2013). */
export const WAIST_HOLD_CM = 1;
/** Fibre at this share of the target or more reads as on target. OURS: within 10%, as a day's protein. */
export const FIBRE_GOOD_SHARE = 0.9;
/** Tiles on the scorecard. OURS: three rows of two at 390 px. */
export const SCORECARD_TILES = 6;

// ── Types ──

export type Tone = "good" | "watch" | "neutral";

export type TileId = "weight" | "calories" | "protein" | "training" | "strength" | "sleep" | "wake" | "fibre" | "steps" | "rhr" | "waist" | "priority";

/** What the goal asks the week to show. */
export type Focus = "cut" | "gain" | "recomp" | "health";

/** A lean gain reads its rate like a cut does; a maintain goal is read as a recomp; no goal reads health. */
export function focusFor(goalType: GoalType | null | undefined): Focus {
  return goalType === "lose" ? "cut" : goalType === "gain" ? "gain" : goalType === "maintain" ? "recomp" : "health";
}

/**
 * The tiles each goal leads with, in order (the B3 table in the purpose
 * audit). OURS: what the goal is judged on comes first.
 */
export const FOCUS_TILES: Record<Focus, readonly TileId[]> = {
  cut: ["weight", "calories", "protein", "strength", "sleep", "training"],
  gain: ["weight", "calories", "strength", "priority", "protein", "sleep"],
  recomp: ["waist", "weight", "strength", "protein", "training", "sleep"],
  health: ["wake", "training", "protein", "fibre", "steps", "rhr"],
};
/** Filled in order when a tile above has no data. OURS. */
export const FOCUS_FALLBACK: Record<Focus, readonly TileId[]> = {
  cut: ["training"],
  gain: ["training"],
  recomp: ["calories"],
  health: ["sleep", "calories", "weight", "strength"],
};


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
  /** The tab it comes from; null when there is none (steps arrive from Apple Health only). */
  href: string | null;
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
  /** The goal's planned rate, signed %/wk (negative on a cut). */
  planRatePct?: number | null;
  /** On a gain, the top of the lean-gain band for the goal's training status (`rateBands`). */
  gainCeilingPct?: number | null;
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

/**
 * "On plan", or which side of it, from the rate and the goal's planned
 * rate. Null without both. On a gain, a rate above the lean-gain ceiling
 * for the user's training status says so whatever the plan, as the judge's
 * GAIN-1 does, so the row never reads "On plan" under a "gaining too fast"
 * verdict.
 */
export function rateVsPlan(ratePct: number | null, planPct: number | null | undefined, focus: Focus, gainCeilingPct?: number | null): { text: string; tone: Tone } | null {
  if (ratePct == null || planPct == null || (focus !== "cut" && focus !== "gain")) return null;
  if (focus === "gain" && gainCeilingPct != null) {
    // A plan already above the band is too fast once the rate reaches the band's top; otherwise the usual tolerance applies.
    const limit = planPct > gainCeilingPct ? gainCeilingPct : gainCeilingPct + ON_TRACK_TOLERANCE;
    if (ratePct > limit) return { text: "Above lean range", tone: "watch" };
  }
  const diff = ratePct - planPct;
  if (Math.abs(diff) <= ON_TRACK_TOLERANCE) return { text: "On plan", tone: "good" };
  // On a cut, faster (more negative) risks muscle and slower stalls the goal; on a gain, faster adds fat and slower only delays.
  const faster = focus === "cut" ? diff < 0 : diff > 0;
  return faster ? { text: "Faster than plan", tone: "watch" } : { text: "Slower than plan", tone: focus === "cut" ? "watch" : "neutral" };
}

const signedPct = (v: number) => `${v > 0 ? "+" : v < 0 ? "−" : ""}${Math.abs(v).toFixed(2)} %/wk`;

function weightTile({ report, unit, goalType, planRatePct, gainCeilingPct }: ScorecardInputs): Tile {
  const w = report.weight;
  const focus = focusFor(goalType);
  const value = w.endTrendKg == null ? "–" : formatWeight(w.endTrendKg, unit);
  const weighed = `${w.weighIns} of ${report.daysCovered} weighed`;
  const vsPlan = rateVsPlan(w.ratePctPerWeek, planRatePct, focus, gainCeilingPct);
  if (vsPlan && w.ratePctPerWeek != null) {
    return { id: "weight", label: "Weight trend", value, sub: `${signedPct(w.ratePctPerWeek)} · plan ${signedPct(planRatePct as number).replace(" %/wk", "")}`, delta: vsPlan, chart: { kind: "line", values: report.days.map((d) => d.trendKg) }, href: "/body" };
  }
  let delta: Tile["delta"] = null;
  if (w.deltaKg != null) {
    const d = w.deltaKg;
    const tone: Tone = goalType === "lose" ? (d < 0 ? "good" : "watch") : goalType === "gain" ? (d > 0 ? "good" : "watch") : goalType === "maintain" ? (Math.abs(d) <= MAINTAIN_BAND_KG ? "good" : "watch") : "neutral";
    delta = { text: goalType === "maintain" && Math.abs(d) <= MAINTAIN_BAND_KG ? "Holding" : `${kgDelta(d, unit)} this week`, tone };
  }
  // A recomp and a health read leave the weekly rate out: the scale is not what they are judged on.
  const sub = w.ratePctPerWeek == null || focus === "recomp" || focus === "health" ? `${w.weighIns} of ${report.daysCovered} days weighed` : `${signedPct(w.ratePctPerWeek)} · ${weighed}`;
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

function trainingTile({ report, prev, goalType }: ScorecardInputs): Tile {
  const t = report.training;
  if (focusFor(goalType) === "health") {
    const delta = t.days > 0 ? { text: t.days >= TRAINING_DAYS_GOOD ? "Two or more days" : "One day", tone: (t.days >= TRAINING_DAYS_GOOD ? "good" : "neutral") as Tone } : null;
    return { id: "training", label: "Training days", value: `${t.days}`, sub: `${t.sessions} ${t.sessions === 1 ? "session" : "sessions"} · ${t.hardSets} hard sets`, delta, chart: { kind: "bars", values: report.days.map((d) => (d.hardSets > 0 ? d.hardSets : null)), target: null }, href: "/train" };
  }
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

function strengthTile({ report, strength, goalType }: ScorecardInputs): Tile {
  const none = (sub: string): Tile => ({ id: "strength", label: "Main lifts", value: "–", sub, delta: null, chart: { kind: "none" }, href: "/train" });
  if (!strength) return none(report.training.lifts.length ? "Not enough sessions to read yet" : "No main lifts logged");
  const moved = strength.lifts.filter((l) => l.changePct != null).sort((a, b) => Math.abs(b.changePct as number) - Math.abs(a.changePct as number));
  if (strength.status === "unclear" || moved.length === 0) return none(strength.baselineMissing ? "No lifts from before the phase to compare" : "Not enough sessions to read yet");
  const base = STRENGTH_WORD[strength.status];
  // A cut aims to hold its lifts; a gain or a recomp aims to raise them, so holding there is no judgement.
  const focus = focusFor(goalType);
  const word = strength.status === "holding" && (focus === "gain" || focus === "recomp") ? { ...base, tone: "neutral" as Tone } : base;
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

function wakeTile({ report }: ScorecardInputs): Tile | null {
  const spread = report.sleep.wakeSpreadMin;
  if (spread == null) return null;
  const tone: Tone = spread <= WAKE_SPREAD_MIN.good ? "good" : spread > WAKE_SPREAD_MIN.fair ? "watch" : "neutral";
  const text = spread <= WAKE_SPREAD_MIN.good ? "Regular" : spread > WAKE_SPREAD_MIN.fair ? "Irregular" : "Fairly regular";
  return { id: "wake", label: "Wake time", value: `±${spread} min`, sub: `Spread over ${report.sleep.nights} mornings`, delta: { text, tone }, chart: { kind: "none" }, href: "/sleep" };
}

function fibreTile({ report }: ScorecardInputs): Tile | null {
  const f = report.food;
  if (f.meanFibreG == null) return null;
  const gap = FIBRE_TARGET_G - f.meanFibreG;
  const ok = f.meanFibreG >= FIBRE_TARGET_G * FIBRE_GOOD_SHARE;
  return { id: "fibre", label: "Fibre a day", value: `${n(f.meanFibreG)} g`, sub: `Target ${FIBRE_TARGET_G} g · ${f.fibreDays} days read`, delta: { text: ok ? "On target" : `${n(gap)} g under`, tone: ok ? "good" : "watch" }, chart: { kind: "bars", values: report.days.map((d) => d.fibreG), target: FIBRE_TARGET_G }, href: "/food" };
}

function stepsTile({ report, prev }: ScorecardInputs): Tile | null {
  const h = report.health;
  if (h.meanSteps == null) return null;
  const vsLast = prev?.health.meanSteps != null ? h.meanSteps - prev.health.meanSteps : null;
  const delta = h.meanSteps >= STEPS_GOOD ? { text: `Over ${n(STEPS_GOOD)}`, tone: "good" as Tone } : vsLast != null ? { text: `${sign(vsLast)}${n(Math.abs(vsLast))} vs last week`, tone: "neutral" as Tone } : null;
  return { id: "steps", label: "Steps a day", value: n(h.meanSteps), sub: `${h.stepDays} days from Apple Health`, delta, chart: { kind: "bars", values: report.days.map((d) => d.steps), target: STEPS_GOOD }, href: null };
}

function rhrTile({ report }: ScorecardInputs): Tile | null {
  const h = report.health;
  if (h.meanRhr == null) return null;
  let delta: Tile["delta"] = null;
  if (h.usualRhr != null) {
    const d = h.meanRhr - h.usualRhr;
    delta = d >= RHR_FLAG_BPM ? { text: `+${d} bpm vs usual`, tone: "watch" } : { text: "Near usual", tone: "good" };
  }
  return { id: "rhr", label: "Resting heart rate", value: `${h.meanRhr} bpm`, sub: h.usualRhr != null ? `Usually ${h.usualRhr} bpm` : `${h.rhrNights} nights from the watch`, delta, chart: { kind: "none" }, href: "/sleep" };
}

function waistTile({ report }: ScorecardInputs): Tile {
  const w = report.waist;
  const value = w.latestCm == null ? "–" : `${w.latestCm.toFixed(1)} cm`;
  if (w.deltaCm == null) return { id: "waist", label: "Waist", value, sub: `${w.entries} of 4 weekly measures in 4 weeks`, delta: null, chart: { kind: "none" }, href: "/body" };
  const d = w.deltaCm;
  const delta = Math.abs(d) < WAIST_HOLD_CM ? { text: "Holding", tone: "neutral" as Tone } : d < 0 ? { text: `−${Math.abs(d).toFixed(1)} cm`, tone: "good" as Tone } : { text: `+${d.toFixed(1)} cm`, tone: "watch" as Tone };
  return { id: "waist", label: "Waist", value, sub: `Over ${w.weeks} ${w.weeks === 1 ? "week" : "weeks"}`, delta, chart: { kind: "none" }, href: "/body" };
}

function priorityTile({ report }: ScorecardInputs): Tile | null {
  const p = report.training.priority;
  if (!p) return null;
  let delta: Tile["delta"] = null;
  if (p.over.length) delta = { text: `${p.over.join(", ")} over`, tone: "watch" };
  else if (p.under.length) delta = { text: `${p.under.join(", ")} under`, tone: "watch" };
  else if (p.inRange === p.muscles) delta = { text: "All in range", tone: "good" };
  return { id: "priority", label: "Priority muscles", value: `${p.inRange} of ${p.muscles}`, sub: report.complete ? "In their set range" : "In their set range so far", delta, chart: { kind: "none" }, href: "/signal/volume" };
}

const TILE: Record<TileId, (i: ScorecardInputs) => Tile | null> = {
  weight: weightTile,
  calories: caloriesTile,
  protein: proteinTile,
  training: trainingTile,
  strength: strengthTile,
  sleep: sleepTile,
  wake: wakeTile,
  fibre: fibreTile,
  steps: stepsTile,
  rhr: rhrTile,
  waist: waistTile,
  priority: priorityTile,
};

/**
 * Six tiles for the goal, in its order. Wake time, fibre, steps, resting
 * heart rate and priority muscles appear only with data and give way to
 * the fallbacks; the others always render, saying "–" when empty.
 */
export function scorecard(i: ScorecardInputs): Tile[] {
  const focus = focusFor(i.goalType);
  const out: Tile[] = [];
  const seen = new Set<TileId>();
  for (const id of [...FOCUS_TILES[focus], ...FOCUS_FALLBACK[focus]]) {
    if (out.length >= SCORECARD_TILES || seen.has(id)) continue;
    seen.add(id);
    const t = TILE[id](i);
    if (t) out.push(t);
  }
  return out;
}

/** "6 of 7 days logged · 7 weigh-ins · 7 nights · 4 sessions": what the report stands on. */
export function coverageLine(r: WeekReport): string {
  return [`${r.food.daysLogged} of ${r.daysCovered} days logged`, `${r.weight.weighIns} ${r.weight.weighIns === 1 ? "weigh-in" : "weigh-ins"}`, `${r.sleep.nights} ${r.sleep.nights === 1 ? "night" : "nights"}`, `${r.training.sessions} ${r.training.sessions === 1 ? "session" : "sessions"}`].join(" · ");
}
