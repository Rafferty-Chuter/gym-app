/**
 * One progression rule (T4), after MacroFactor Workouts' Smart Progression
 * (research B, MF-3 and MF-4) with RP's "a few per cent" ceiling. Given a
 * routine exercise's targets and its logged sessions, it says what the top
 * working set should be next time: a load that exists on the equipment and
 * a rep count, or silence below the data gate. Pure: no storage, no clock.
 *
 * The decision is MacroFactor's expectation rule on the last session's top
 * set: expected reps-to-failure = midpoint of the rep range + target RIR;
 * one rep over it is progress, one under is a slight step back, in between
 * holds load and adds a rep. The size of each move comes from an Epley
 * estimate of the lift (reps + RIR capped at 12, as the strength engine
 * does) and snaps to the equipment's steps. When RIR was not logged on most
 * sets the rule falls back to classic double progression.
 */

import { getExerciseProfile } from "@/lib/exerciseProfiles";
import { setTypeOf } from "@/lib/completedSets";
import type { LoggedSet } from "@/lib/physique/strength";
import type { RepTargets } from "@/lib/training/targets";
import { formatWeight, parseWeightText, roundTo, type WeightUnit } from "@/lib/units";

export type ExerciseSession = { completedAt: string; sets: readonly LoggedSet[] };
export type Phase = "cut" | "maintain" | "lean_bulk";
export type Equipment = "barbell" | "dumbbell" | "machine" | "cable" | "bodyweight";
export type SuggestionNote = "range_expanded" | "held_on_cut" | "double_progression" | "stepped_back";

export type Suggestion =
  | { kind: "next"; loadKg: number; reps: number; rir: number; e1rmKg: number; note?: SuggestionNote }
  /** Fewer than MIN_SESSIONS logged sessions with a loaded set: say nothing. */
  | { kind: "early"; sessions: number }
  /** No loaded, completed set anywhere (bodyweight rows, blanks). */
  | { kind: "none" };

// ── Constants ──

/** Sessions with at least one loaded working set before a suggestion is made; a wrong number at the rack costs trust. OURS. */
export const MIN_SESSIONS = 2;
/** Epley: e1RM = load × (1 + reps-to-failure / 30); reps + RIR beyond 12 add no information. PUB (02 §6.1). */
export const EPLEY_DIVISOR = 30;
export const RTF_CAP = 12;
/** Exponential smoothing of the per-session estimate; 0.4 damps a single odd session without hiding a real move. Inferred. */
export const EWMA_ALPHA = 0.4;
/** Beat the expectation by this many reps to progress; fall short by this many to step back. PUB (MF-3). */
export const PROGRESS_DELTA = 1;
/** The share of the last session's working sets that must carry an RIR for the expectation rule; below it, double progression. PUB (MF-3 fallback). */
export const RIR_COVERAGE_MIN = 0.5;
/** Largest single load step as a share of the last load; past it, add reps instead (MF-4 "expand rep range"). Compounds take a 2.5 kg step on 20 kg dumbbells; isolations a 1 kg step on 7 kg. OURS, after RP-3. */
export const MAX_STEP_COMPOUND = 0.125;
export const MAX_STEP_ISOLATION = 0.15;
/** How far a range may stretch when the equipment step is too coarse. PUB (MF-4 as read in research B §8). */
export const EXPAND_BELOW = 2;
export const EXPAND_ABOVE = 3;
/** Equipment steps, kg. UK commercial gyms: 1.25 kg plates per side, dumbbells in 1 kg steps to 10 kg then 2.5, stacks with a 2.5 kg add-on. OURS. */
export const BARBELL_STEP_KG = 2.5;
export const DUMBBELL_STEP_KG = 2.5;
export const DUMBBELL_SMALL_STEP_KG = 1;
export const DUMBBELL_SMALL_BELOW_KG = 10;
export const MACHINE_STEP_KG = 2.5;
export const BODYWEIGHT_STEP_KG = 2.5;

// ── Equipment ──

const DUMBBELL_RE = /\b(dumbbell|dumbbells|db|kettlebell|kb)\b/i;
const MACHINE_RE = /\b(machine|leg press|hack squat|smith|pec deck|leg extension|leg curl|hip thrust machine|chest press|shoulder press machine|seated row machine|calf raise machine)\b/i;
const CABLE_RE = /\b(cable|pulldown|pull-down|pushdown|push-down|face pull|rope|lat pull)\b/i;
const BODYWEIGHT_RE = /\b(pull-?ups?|chin-?ups?|dips?|push-?ups?|muscle-?ups?|inverted rows?)\b/i;

/** The equipment a movement is loaded on, from its name; barbell when nothing else says otherwise. */
export function equipmentFor(name: string): Equipment {
  if (DUMBBELL_RE.test(name)) return "dumbbell";
  if (CABLE_RE.test(name)) return "cable";
  if (MACHINE_RE.test(name)) return "machine";
  if (BODYWEIGHT_RE.test(name)) return "bodyweight";
  return "barbell";
}

/** The smallest load step that exists for this equipment at this load. */
export function stepFor(equipment: Equipment, loadKg: number): number {
  switch (equipment) {
    case "dumbbell":
      return loadKg < DUMBBELL_SMALL_BELOW_KG ? DUMBBELL_SMALL_STEP_KG : DUMBBELL_STEP_KG;
    case "machine":
    case "cable":
      return MACHINE_STEP_KG;
    case "bodyweight":
      return BODYWEIGHT_STEP_KG;
    default:
      return BARBELL_STEP_KG;
  }
}

/** The nearest load that exists on the equipment, never below one step. */
export function snapLoad(kg: number, equipment: Equipment): number {
  const step = stepFor(equipment, kg);
  return Math.max(step, roundTo(kg, step));
}

// ── Sets and sessions ──

type Parsed = { loadKg: number; reps: number; rir: number | null; rtf: number; e1rm: number };

function parseReps(value: LoggedSet["reps"]): number | null {
  if (typeof value === "number") return Number.isFinite(value) ? value : null;
  if (typeof value !== "string") return null;
  const n = Number.parseFloat(value.trim().replace(/,/g, "."));
  return Number.isFinite(n) ? n : null;
}

/** A loaded, completed working set. Warm-ups and drop sets never count; a failure set is RIR 0 whatever was typed. */
export function parseSet(set: LoggedSet, unit: WeightUnit): Parsed | null {
  const type = setTypeOf(set);
  if (type === "warmup" || type === "drop") return null;
  const loadKg = parseWeightText(set.weight, unit);
  const reps = parseReps(set.reps);
  if (loadKg === null || loadKg <= 0 || reps === null || reps <= 0) return null;
  const rir = type === "failure" ? 0 : typeof set.rir === "number" && Number.isFinite(set.rir) ? Math.max(0, set.rir) : null;
  const rtf = reps + (rir ?? 0);
  return { loadKg, reps, rir, rtf, e1rm: loadKg * (1 + Math.min(rtf, RTF_CAP) / EPLEY_DIVISOR) };
}

type Session = { completedAt: string; sets: Parsed[]; top: Parsed; e1rm: number };

function parseSessions(sessions: readonly ExerciseSession[], unit: WeightUnit): Session[] {
  const out: Session[] = [];
  for (const s of sessions) {
    const sets = s.sets.map((x) => parseSet(x, unit)).filter((x): x is Parsed => x !== null);
    if (sets.length === 0) continue;
    const top = sets.reduce((a, b) => (b.loadKg > a.loadKg || (b.loadKg === a.loadKg && b.rtf > a.rtf) ? b : a));
    out.push({ completedAt: s.completedAt, sets, top, e1rm: Math.max(...sets.map((x) => x.e1rm)) });
  }
  return out.sort((a, b) => a.completedAt.localeCompare(b.completedAt));
}

/** Reps the estimate says a load allows at a target RIR. */
function repsAt(e1rm: number, loadKg: number, rir: number): number {
  return Math.round(EPLEY_DIVISOR * (e1rm / loadKg - 1) - rir);
}

const clamp = (v: number, lo: number, hi: number) => Math.max(lo, Math.min(hi, v));

// ── The rule ──

export type SuggestInput = {
  name: string;
  targets: RepTargets;
  sessions: readonly ExerciseSession[];
  unit: WeightUnit;
  phase?: Phase;
};

/** What the top working set should be next session. */
export function suggestNext({ name, targets, sessions, unit, phase = "maintain" }: SuggestInput): Suggestion {
  const hist = parseSessions(sessions, unit);
  if (hist.length === 0) return { kind: "none" };
  if (hist.length < MIN_SESSIONS) return { kind: "early", sessions: hist.length };

  let e = hist[0].e1rm;
  for (let i = 1; i < hist.length; i++) e = EWMA_ALPHA * hist[i].e1rm + (1 - EWMA_ALPHA) * e;
  const last = hist[hist.length - 1];
  const prev = hist[hist.length - 2];
  const lastW = last.top.loadKg;
  const equipment = equipmentFor(name);
  const isolation = getExerciseProfile(name)?.category === "isolation";
  const maxStep = isolation ? MAX_STEP_ISOLATION : MAX_STEP_COMPOUND;
  const step = stepFor(equipment, lastW);
  const { repMin, repMax, rir } = targets;
  const midReps = Math.round((repMin + repMax) / 2);
  const missedTwice = [last, prev].every((s) => s.sets.some((x) => x.reps < repMin));
  const round1 = (v: number) => Math.round(v * 100) / 100;

  const up = (): Suggestion => {
    const next = snapLoad(lastW + step, equipment);
    if ((next - lastW) / lastW > maxStep) {
      // The step is too coarse for this load: add a rep instead, past the top of the range if need be (MF-4).
      const reps = clamp(last.top.reps + 1, repMin - EXPAND_BELOW, repMax + EXPAND_ABOVE);
      return { kind: "next", loadKg: lastW, reps, rir, e1rmKg: round1(e), note: "range_expanded" };
    }
    return { kind: "next", loadKg: next, reps: clamp(repsAt(e, next, rir), repMin, repMax), rir, e1rmKg: round1(e) };
  };
  const hold = (note?: SuggestionNote): Suggestion => ({ kind: "next", loadKg: lastW, reps: clamp(last.top.reps + 1, repMin, repMax), rir, e1rmKg: round1(e), note });
  const back = (): Suggestion => {
    const repsHere = repsAt(e, lastW, rir);
    if (repsHere >= repMin) return { kind: "next", loadKg: lastW, reps: clamp(repsHere, repMin, repMax), rir, e1rmKg: round1(e), note: "stepped_back" };
    if (phase === "cut" && !missedTwice) return { kind: "next", loadKg: lastW, reps: repMin, rir, e1rmKg: round1(e), note: "held_on_cut" };
    const floor = snapLoad(lastW * (1 - maxStep), equipment);
    const next = Math.max(floor, snapLoad(lastW - step, equipment));
    return { kind: "next", loadKg: next, reps: clamp(repsAt(e, next, rir), repMin, repMax), rir, e1rmKg: round1(e), note: "stepped_back" };
  };

  // Without RIR on most sets the expectation has nothing to compare against: classic double progression.
  const coverage = last.sets.filter((x) => x.rir !== null).length / last.sets.length;
  if (coverage < RIR_COVERAGE_MIN) {
    if (last.sets.every((x) => x.reps >= repMax)) {
      const s = up();
      return s.kind === "next" ? { ...s, reps: s.note === "range_expanded" ? s.reps : repMin, note: s.note ?? "double_progression" } : s;
    }
    if (missedTwice) {
      if (phase === "cut") return { kind: "next", loadKg: lastW, reps: repMin, rir, e1rmKg: round1(e), note: "held_on_cut" };
      const next = Math.max(snapLoad(lastW * (1 - maxStep), equipment), snapLoad(lastW - step, equipment));
      return { kind: "next", loadKg: next, reps: repMin, rir, e1rmKg: round1(e), note: "double_progression" };
    }
    return hold("double_progression");
  }

  const expected = midReps + rir;
  const delta = last.top.rtf - expected;
  if (delta >= PROGRESS_DELTA) return up();
  if (delta > -PROGRESS_DELTA) return hold();
  return back();
}

/** "Next 82.5 kg × 8", or null when there is nothing to say. */
export function suggestionLabel(s: Suggestion, unit: WeightUnit): string | null {
  if (s.kind !== "next") return null;
  return `Next ${formatWeight(s.loadKg, unit).replace(/\.0 /, " ")} × ${s.reps}`;
}
