/**
 * The words for a stuck lift (IN4). The fact first in a lifter's terms
 * ("flat for 7 sessions", "down 6 kg in 8 sessions"), the level in
 * the person's unit, then what changed as before → after in its own
 * numbers, which is the person's lever (B, 08). Described, never blamed;
 * never "muscle loss" (02 §10). Pure.
 */

import { formatHoursMin } from "@/lib/physique/dayTotals";
import { kgToDisplay, type WeightUnit } from "@/lib/units";
import type { StuckChange, StuckLift } from "@/lib/physique/liftPlateau";
import type { LocalDate } from "@/lib/dates";

const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
/** "1 Sep", kept on one line. */
const shortDate = (d: LocalDate) => `${Number(d.slice(8, 10))} ${MONTHS[Number(d.slice(5, 7)) - 1] ?? ""}`;
const hm = (h: number) => formatHoursMin(Math.round(h * 60));
const n = (v: number) => Math.round(Math.abs(v)).toLocaleString("en-GB");

/** A load in the person's unit, to 0.5 kg or 1 lb. */
function load(kg: number, unit: WeightUnit): string {
  const step = unit === "lb" ? 1 : 0.5;
  const v = Math.round(kgToDisplay(Math.abs(kg), unit) / step) * step;
  return `${v.toLocaleString("en-GB", { maximumFractionDigits: 1 })} ${unit}`;
}

/** "Bench Press: flat for 7 sessions" / "Squat: down 6 kg in 8 sessions". */
export function stuckTitle(s: StuckLift, unit: WeightUnit = "kg"): string {
  return s.state === "flat" ? `${s.name}: flat for ${s.sessions} sessions` : `${s.name}: down ${load(s.changeKg, unit)} in ${s.sessions} sessions`;
}

/** The best level it has not passed, rounded to the kilo: "114 kg" (est. 1RM). */
export function stuckValue(s: StuckLift, unit: WeightUnit): string {
  return `${Math.round(kgToDisplay(s.levelKg, unit)).toLocaleString("en-GB")} ${unit}`;
}

function changeWords(c: StuckChange, unit: WeightUnit): string {
  switch (c.kind) {
    case "sets":
      return `${c.muscle.toLowerCase()} sets ${c.before} → ${c.during} a week`;
    case "frequency":
      return `${c.before.toLocaleString("en-GB")} → ${c.during.toLocaleString("en-GB")} sessions a week`;
    case "sleep":
      return `sleep ${hm(c.beforeH)} → ${hm(c.duringH)}`;
    case "shortNights":
      return `short nights ${c.before} → ${c.during} a week`;
    case "balance": {
      // Against maintenance, signed when it crosses from a surplus to a deficit: "deficit 250 → 650 kcal a day", "+200 → −300 kcal a day against maintenance".
      if (c.beforeKcal <= 0 && c.duringKcal <= 0) return `deficit ${n(c.beforeKcal)} → ${n(c.duringKcal)} kcal a day`;
      const signed = (v: number) => `${v > 0 ? "+" : v < 0 ? "−" : ""}${n(v)}`;
      return `${signed(c.beforeKcal)} → ${signed(c.duringKcal)} kcal a day against maintenance`;
    }
    case "protein":
      return `protein ${c.beforeG} → ${c.duringG} g a day`;
    case "reps":
      return `reps ${c.before} → ${c.during} a set`;
    case "deload":
      return c.weeks === 1 ? "a deload week" : `${c.weeks} deload weeks`;
    case "cutPace":
      return `losing ${load(c.kgPerWeek, unit)} a week`;
  }
}

/**
 * What changed since the lift's best: "Since 1 Sep: chest sets 18 → 12 a
 * week · sleep 7h 48m → 6h 24m"; with nothing past its floor, what was
 * checked; with too little history before the best, just since when.
 */
export function stuckChangesLine(s: StuckLift, unit: WeightUnit = "kg", max = 3): string {
  if (s.changes == null) return `Since ${shortDate(s.since)}, the start of its history`;
  if (!s.changes.length) return `Sets, sessions, sleep and food held steady since ${shortDate(s.since)}`;
  return `Since ${shortDate(s.since)}: ${s.changes.slice(0, max).map((c) => changeWords(c, unit)).join(" · ")}`;
}
