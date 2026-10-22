/**
 * A Connections row in plain words (TR12). The founder, on 22 Oct: "Carbs
 * the day before · 312 vs 221 g · Moved with calories · +5 kg on squat"
 * doesn't say what it means. Each clear link now leads with one sentence
 * a lifter gets at a glance, then the numbers:
 *
 *   Your squat is about 5 kg heavier the day after a higher-carb day
 *   312 g vs 221 g of carbs · 32 sessions
 *   Calories were higher too, so it could be either.
 *
 * After WHOOP's and Bevel's insight lines ("Your HRV is 10% lower than
 * usual"): the person's own measure first, then the number, then what it
 * is against. Facts from their sessions, never a cause or advice: the
 * sentence says what moved together, in the engine's own hedge ("about").
 * The sentence always describes the upper third of the condition (the
 * longer nights, the higher-carb days), heavier or lighter, so it reads
 * the same way on every row.
 *
 * Pure: a connection, the reference lift and the unit in, words out.
 */

import type { Connection, ConnectionId } from "@/lib/physique/connections";
import { formatHoursMin } from "@/lib/physique/dayTotals";
import { effectKg, EFFECT_ROUND_KG, EFFECT_ROUND_LB, type ReferenceLift } from "@/lib/physique/liftEffect";
import { kgToDisplay, type WeightUnit } from "@/lib/units";

// ── Types ──

export type ConnectionWords = {
  /** The whole sentence, for screen readers and tests: "Your squat is about 5 kg heavier the day after a higher-carb day". */
  headline: string;
  /** The sentence in three parts, so the difference can be set in bold: "Your squat is about ", "5 kg heavier", " the day after a higher-carb day". */
  parts: { before: string; effect: string; after: string };
  /** Both groups' values in a few words: "312 g vs 221 g of carbs". */
  values: string;
  /** The values and the sessions behind them: "312 g vs 221 g of carbs · 32 sessions". */
  numbers: string;
  /** When another clear difference moved with this one: "Calories were higher too, so it could be either." */
  overlap: string | null;
};

// ── Words per condition ──

/** The upper third (or the yes group), as the end of the sentence. */
const WHEN: Record<Exclude<ConnectionId, "rate">, string> = {
  sleep: "after a longer night",
  wake: "on mornings you wake an hour or more earlier than usual",
  shortRun: "after two nights under 6 hours in a row",
  carbs: "the day after a higher-carb day",
  balance: "the day after a higher-calorie day",
  balance3: "after three higher-calorie days",
  protein: "after three higher-protein days",
  time: "when you train later in the day",
  awake: "when you train longer after waking",
  rest: "after a longer break",
  lastSame: "after a longer gap since that lift",
  load: "after a week with more hard sets",
  hrv: "on mornings your HRV is higher than usual",
};

/** The weight trend's upper third depends on which side of zero both thirds sit. */
function rateWhen(high: number, low: number): string {
  if (high <= 0) return "when your weight is coming down more slowly";
  if (low >= 0) return "when your weight is going up faster";
  return "when your weight is going up rather than down";
}

/** Each condition higher and lower, for the line about another condition that moved with it. */
const MORE_LESS: Record<ConnectionId, [more: string, less: string]> = {
  sleep: ["Sleep was longer", "Sleep was shorter"],
  wake: ["Early wakes were more common", "Early wakes were less common"],
  shortRun: ["Short nights ran together more", "Short nights ran together less"],
  carbs: ["Carbs were higher", "Carbs were lower"],
  balance: ["Calories were higher", "Calories were lower"],
  balance3: ["Calories over three days were higher", "Calories over three days were lower"],
  protein: ["Protein was higher", "Protein was lower"],
  time: ["Sessions were later", "Sessions were earlier"],
  awake: ["Sessions came longer after waking", "Sessions came sooner after waking"],
  rest: ["Breaks were longer", "Breaks were shorter"],
  lastSame: ["Gaps since the lift were longer", "Gaps since the lift were shorter"],
  load: ["The week before had more sets", "The week before had fewer sets"],
  rate: ["The weight trend was higher", "The weight trend was lower"],
  hrv: ["HRV was higher", "HRV was lower"],
};

const n0 = (v: number) => Math.round(v).toLocaleString("en-GB");
const signed = (s: string, v: number) => `${v > 0 ? "+" : v < 0 ? "−" : ""}${s}`;
const clock = (h: number) => {
  const m = Math.round(h * 60);
  return `${String(Math.floor(m / 60) % 24).padStart(2, "0")}:${String(m % 60).padStart(2, "0")}`;
};
const days = (v: number) => {
  const d = Math.round(v);
  return `${d} ${d === 1 ? "day" : "days"}`;
};
/** kcal against maintenance, signed; within 50 kcal is maintenance itself. */
const kcalVsMaintenance = (v: number) => (Math.abs(v) < 50 ? "0" : signed(n0(Math.abs(v)), v));

/** Both groups' values, upper first, in the condition's own words; a yes-or-no condition gives its counts. */
function valuesText(id: ConnectionId, high: number, low: number, unit: WeightUnit, counts: { high: number; low: number }): string {
  switch (id) {
    case "wake":
      return `${counts.high} early mornings vs ${counts.low} usual`;
    case "shortRun":
      return `${counts.high} days after two short nights vs ${counts.low} after the rest`;
    case "balance3":
      return `${kcalVsMaintenance(high)} vs ${kcalVsMaintenance(low)} kcal a day against maintenance over three days`;
    case "awake":
      return `${formatHoursMin(Math.round(high * 60))} vs ${formatHoursMin(Math.round(low * 60))} awake before training`;
    case "lastSame":
      return `${days(high)} vs ${days(low)} since the same lift`;
    case "load":
      return `${n0(high)} vs ${n0(low)} hard sets in the week before`;
    case "sleep":
      return `${formatHoursMin(Math.round(high * 60))} vs ${formatHoursMin(Math.round(low * 60))} of sleep`;
    case "carbs":
      return `${n0(high)} g vs ${n0(low)} g of carbs`;
    case "balance":
      return `${kcalVsMaintenance(high)} vs ${kcalVsMaintenance(low)} kcal against maintenance`;
    case "protein":
      return `${n0(high)} g vs ${n0(low)} g of protein a day`;
    case "time":
      return `around ${clock(high)} vs ${clock(low)}`;
    case "rest":
      return `${days(high)} vs ${days(low)} since the last session`;
    case "rate": {
      const kg = (v: number) => {
        const d = Math.round(kgToDisplay(v, unit) * 10) / 10;
        return signed(Math.abs(d).toFixed(1), d);
      };
      return `${kg(high)} vs ${kg(low)} ${unit} a week`;
    }
    case "hrv": {
      const sd = (v: number) => `${v >= 0 ? "+" : "−"}${Math.abs(v).toFixed(1)}`;
      return `HRV ${sd(high)} vs ${sd(low)} SD against your usual`;
    }
  }
}

/**
 * The difference as words on the reference lift: "5 kg heavier", "1.5 lb
 * lighter", rounded as `formatEffect` does. Null when it rounds to nothing
 * on a light lift, where the percentage says it better.
 */
function effectOnLift(diffPct: number, lift: ReferenceLift, unit: WeightUnit): string | null {
  const step = unit === "lb" ? EFFECT_ROUND_LB : EFFECT_ROUND_KG;
  const v = Math.round(kgToDisplay(Math.abs(effectKg(diffPct, lift.levelKg)), unit) / step) * step;
  if (v === 0) return null;
  return `${v.toLocaleString("en-GB", { maximumFractionDigits: 1 })} ${unit} ${diffPct > 0 ? "heavier" : "lighter"}`;
}

const cap = (s: string) => s.charAt(0).toUpperCase() + s.slice(1);

/**
 * A connection in plain words. The sentence speaks for a clear link; for a
 * row with no clear difference only `values` is used, under "No clear link".
 */
export function connectionWords(c: Connection, lift: ReferenceLift | null, unit: WeightUnit): ConnectionWords {
  // IN5: the lift's own read once it has the sessions, else the read across lifts.
  const own = lift ? c.perLift?.find((p) => p.name === lift.name && p.own) : undefined;
  const liftPct = own?.pct ?? c.diffPct;
  const onLift = lift ? effectOnLift(liftPct, lift, unit) : null;
  const before = onLift && lift ? `Your ${lift.name.toLowerCase()} is about ` : "Your top sets are about ";
  const effect = onLift ?? `${Math.abs(c.diffPct).toFixed(1)}% ${c.diffPct > 0 ? "heavier" : "lighter"}`;
  const after = ` ${c.id === "rate" ? rateWhen(c.high.mean, c.low.mean) : WHEN[c.id]}`;
  const values = valuesText(c.id, c.high.mean, c.low.mean, unit, { high: c.high.sessions, low: c.low.sessions });
  const sessions = c.high.sessions + c.low.sessions;
  const overlap = c.movedWith ? `${MORE_LESS[c.movedWith][c.movedWithSign === -1 ? 1 : 0]}${c.movedWithSign === -1 ? " on those days" : " too"}, so it could be either.` : null;
  return {
    headline: `${before}${effect}${after}`,
    parts: { before, effect, after },
    values,
    numbers: `${cap(values)} · ${sessions} sessions`,
    overlap,
  };
}

/** The row a merged condition points to, for "Counted with carbs" (C7). */
export const CONNECTION_NOUN: Record<ConnectionId, string> = { sleep: "sleep", wake: "early wakes", shortRun: "short nights in a row", carbs: "carbs", balance: "calories", balance3: "calories over three days", protein: "protein", time: "time of day", awake: "hours awake", rest: "rest days", lastSame: "days since the lift", load: "the week's sets", rate: "the weight trend", hrv: "HRV" };
