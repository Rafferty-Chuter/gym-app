/**
 * Findings (E1): what the last four weeks of the person's own data show,
 * set against what published evidence supports. The founder: the report
 * "should have responses that are rooted in their data and what actual
 * evidence supports", e.g. short sleep with little progression, too little
 * protein, eating too much, or logging very little without losing weight.
 *
 * Each finding is a short title, one line of the person's numbers in kilos
 * (PR3d: the founder wants it read at a glance, the explaining left to the
 * assistant), one sentence of what studies found with the source named,
 * and the full sentence of numbers for the assistant. No instructions and no plans: the reader
 * draws the conclusion. Every finding has a minimum-data gate and a
 * threshold taken from the evidence it cites; below either it stays silent.
 *
 * Pure: data, `through` and the profile in, findings out.
 */

import { addDays, dayDiff, type LocalDate } from "@/lib/dates";
import { mean } from "@/lib/stats";
import { formatHoursMin } from "@/lib/physique/dayTotals";
import { ENERGY_DENSITY_KCAL_PER_KG } from "@/lib/physique/expenditure";
import { countsForBalance } from "@/lib/physique/food/energy";
import { dailyIntakeSeries, targetInEffect } from "@/lib/physique/intake";
import { PRO1_MIN_G_PER_KG, PRO2_MIN_G_PER_KG } from "@/lib/physique/judge";
import { nightsByDate } from "@/lib/physique/sleep";
import { pickMainLifts } from "@/lib/physique/strength";
import { GAIN_BANDS } from "@/lib/physique/targets";
import { trendSeries } from "@/lib/physique/weight";
import type { DayFlags, FoodEntry, PhysiqueGoal, PhysiqueProgram, Sex, SleepNight, WeighIn } from "@/lib/physique/types";
import type { StoredWorkout } from "@/lib/trainingAnalysis";
import { formatEffect } from "@/lib/physique/liftEffect";
import { formatWeight, type WeightUnit } from "@/lib/units";

// ── Thresholds (tags as in 02-engine-spec) ──

/** Days read, to the report's last day. OURS: four weeks, long enough for a rate and a habit, short enough to be current. */
export const FIND_WINDOW_DAYS = 28;
/** Days of food (complete or fasting) before intake is read. OURS: three of the four weeks. */
export const FIND_MIN_FOOD_DAYS = 21;
/** Complete food days before protein is read. OURS: two weeks' worth, the judge's own floor. */
export const FIND_MIN_PROTEIN_DAYS = 14;
/** Weigh-ins in the window before the trend is read. OURS: every other day. */
export const FIND_MIN_WEIGHINS = 14;
/** Nights in the window before sleep is read. OURS: every other night. */
export const FIND_MIN_NIGHTS = 14;
/**
 * What a person burns can't sit under resting energy plus digestion: the
 * thermic effect of food is about 10% of intake. EVID (Westerterp 2004). So
 * a steady weight on logged food under 1.1 × resting energy means food is
 * missing from the log.
 */
export const UNDERLOG_BMR_RATIO = 1.1;
/** Sleep under this is short for adults. EVID: the AASM/SRS consensus, 7 hours or more (Watson 2015). */
export const SHORT_SLEEP_H = 7;
/** Losing faster than this, %/wk, with lifts down is read against the evidence. EVID: Garthe 2011 compared 0.7 with 1.4 %/wk. */
export const CUT_FAST_PCT = 1.0;
/** Days the lifts' progress is read over. OURS: eight weeks, long enough that a few percent of real progress shows through session noise. */
export const FIND_LIFT_DAYS = 56;
/** Sessions of a lift in that time before it is read (the first and last three are compared). OURS. */
export const FIND_LIFT_MIN_SESSIONS = 6;
/** Main lifts that gained less than this together, %, over the eight weeks have not progressed. OURS: an intermediate lifter adds about 1% a month (research F). */
export const LIFT_FLAT_PCT = 1;
/** A lift down this much or more, %, is down. PUB-anchored: the strength engine's ±3% band. */
export const LIFT_DOWN_PCT = -3;
/** Margin over the lean-gain band before a gain reads as fast, %/wk. OURS: four weeks of trend still wobble by about this much. */
export const GAIN_FAST_MARGIN_PCT = 0.15;

// ── Types ──

export type FindingId = "underlog" | "sleep-lifts" | "protein-low" | "gain-fast" | "cut-fast-lifts";

export type Finding = {
  id: FindingId;
  title: string;
  /** The person's own numbers in one line, rates and lifts in kilos: "Losing 1.4 kg a week · Bench Press −11 kg, Squat −12 kg in 8 weeks". */
  fact: string;
  /** The person's own numbers in full sentences, for the assistant. */
  data: string;
  /** What studies found, one sentence, the source named. */
  evidence: string;
  /** Full references, for the report's small print. */
  sources: string[];
};

export type FindingInputs = {
  weighIns: readonly WeighIn[];
  foodEntries: readonly FoodEntry[];
  dayFlags: Readonly<Record<string, DayFlags>>;
  sleepNights: readonly SleepNight[];
  goal: PhysiqueGoal | null;
  program: PhysiqueProgram | null;
  profile: { sex?: Sex; age?: number; heightCm?: number };
  workouts: readonly StoredWorkout[];
  unit: WeightUnit;
  /** The sleep connection from the report (L1), when it found one. */
  sleepConnectionPct?: number | null;
};

// ── Helpers ──

const n0 = (v: number) => Math.round(v).toLocaleString("en-GB");
const signedRate = (v: number) => `${v > 0 ? "+" : v < 0 ? "−" : ""}${Math.abs(v).toFixed(2)} %/wk`;
const signedPct = (v: number) => `${v > 0 ? "+" : v < 0 ? "−" : ""}${Math.abs(v).toFixed(1)}%`;

/**
 * Resting energy, kcal a day, by Mifflin-St Jeor (1990), the equation
 * dietitians' guidance rates most accurate for adults. Without a stated sex
 * it takes the lower of the two, so the under-logging read errs towards
 * silence.
 */
export function restingEnergyKcal(weightKg: number, heightCm: number, age: number, sex: Sex | undefined): number {
  const base = 10 * weightKg + 6.25 * heightCm - 5 * age;
  return sex === "M" ? base + 5 : base - 161;
}

/** Trend weight on or before `date`. */
function trendAt(trend: ReadonlyArray<{ date: LocalDate; trendKg: number }>, date: LocalDate): number | null {
  let last: number | null = null;
  for (const p of trend) {
    if (p.date > date) break;
    last = p.trendKg;
  }
  return last;
}

function liftsList(lifts: ReadonlyArray<{ name: string; changePct: number }>): string {
  return lifts.map((l) => `${l.name} ${signedPct(l.changePct)}`).join(", ");
}

/** "Bench Press −11 kg, Squat −12 kg": each lift's change in the display unit. */
function liftsKg(lifts: ReadonlyArray<{ name: string; changeKg: number }>, unit: WeightUnit): string {
  return lifts.map((l) => `${l.name} ${formatEffect(l.changeKg, unit)}`).join(", ");
}

/**
 * Each main lift's change over the last FIND_LIFT_DAYS: a straight line
 * fitted through every session's best set, its end against its start, so
 * one good or bad day moves it little. Null below two lifts with enough
 * sessions. Read here rather than "since the phase began", so it works
 * without training logged before the goal.
 */
export function liftProgress(workouts: readonly StoredWorkout[], unit: WeightUnit, through: LocalDate): Array<{ name: string; changePct: number; changeKg: number }> | null {
  const from = addDays(through, -(FIND_LIFT_DAYS - 1));
  const out: Array<{ name: string; changePct: number; changeKg: number }> = [];
  for (const l of pickMainLifts(workouts, unit, { today: through, tz: "UTC" })) {
    const ex = l.exposures.filter((e) => e.date >= from && e.date <= through);
    if (ex.length < FIND_LIFT_MIN_SESSIONS) continue;
    const xs = ex.map((e) => dayDiff(from, e.date));
    const ys = ex.map((e) => e.e1rm);
    const mx = mean(xs);
    const my = mean(ys);
    const sxx = xs.reduce((a, x) => a + (x - mx) ** 2, 0);
    if (sxx <= 0) continue;
    const slope = xs.reduce((a, x, k) => a + (x - mx) * (ys[k] - my), 0) / sxx;
    const start = my + slope * (xs[0] - mx);
    const end = my + slope * (xs[xs.length - 1] - mx);
    if (start > 0) out.push({ name: l.name, changePct: (end / start - 1) * 100, changeKg: end - start });
  }
  return out.length >= 2 ? out : null;
}

// ── Findings ──

/**
 * The findings for the four weeks to `through`, most fundamental first:
 * logging (it colours every other number), then sleep, protein and the rate.
 */
export function findings(i: FindingInputs, through: LocalDate): Finding[] {
  const from = addDays(through, -(FIND_WINDOW_DAYS - 1));
  const out: Finding[] = [];

  // Weight trend over the window.
  const trend = trendSeries(i.weighIns);
  const weighIns = i.weighIns.filter((w) => w.date >= from && w.date <= through).length;
  const startKg = trendAt(trend, from);
  const endKg = trendAt(trend, through);
  const days = Math.max(1, dayDiff(from, through));
  const haveTrend = weighIns >= FIND_MIN_WEIGHINS && startKg != null && endKg != null;
  const ratePct = haveTrend ? ((endKg! / startKg! - 1) * 100 * 7) / days : null;

  // Food over the window.
  const intake = dailyIntakeSeries(i.foodEntries, i.dayFlags, from, through);
  const counted = intake.filter((d) => countsForBalance(d.status));
  const complete = intake.filter((d) => d.status === "complete");
  const meanKcal = counted.length >= FIND_MIN_FOOD_DAYS ? mean(counted.map((d) => d.kcal)) : null;

  // ── Logging against resting energy ──
  const { sex, age, heightCm } = i.profile;
  if (meanKcal != null && haveTrend && typeof age === "number" && typeof heightCm === "number" && endKg != null) {
    const bmr = restingEnergyKcal(endKg, heightCm, age, sex === "M" || sex === "F" ? sex : undefined);
    // At a steady weight intake equals what is burned; a change in weight adds or removes its stored energy.
    const burned = meanKcal - ((endKg - startKg!) * ENERGY_DENSITY_KCAL_PER_KG) / days;
    if (burned < UNDERLOG_BMR_RATIO * bmr) {
      const moved = Math.abs(ratePct!) < 0.1 ? "held" : ratePct! < 0 ? "fell" : "rose";
      out.push({
        id: "underlog",
        title: "Food may be missing from the log",
        fact: `Logged ${n0(meanKcal)} kcal a day · lying still uses about ${n0(UNDERLOG_BMR_RATIO * bmr)}`,
        data: `Over the last 4 weeks you logged ${n0(meanKcal)} kcal a day and the weight trend ${moved} (${signedRate(ratePct!)}), which puts what you burn at about ${n0(burned)} kcal a day. Lying still all day, your body would use about ${n0(UNDERLOG_BMR_RATIO * bmr)}: ${n0(bmr)} at rest plus about a tenth for digesting food.`,
        evidence: `Measured with doubly labelled water, food logs usually fall short, by half in some people (Lichtman 1992).`,
        sources: ["Mifflin MD et al. Am J Clin Nutr 1990;51:241–7", "Westerterp KR. Nutr Metab 2004;1:5", "Hill RJ, Davies PSW. Br J Nutr 2001;85:415–30", "Schoeller DA. Metabolism 1995;44(2 Suppl 2):18–22", "Lichtman SW et al. N Engl J Med 1992;327:1893–8"],
      });
    }
  }

  // ── Sleep and the lifts ──
  const byDate = nightsByDate(i.sleepNights);
  const nights: number[] = [];
  for (let d = from; d <= through; d = addDays(d, 1)) {
    const night = byDate.get(d);
    if (night && night.valid) nights.push(night.asleepH);
  }
  const cut = i.goal?.type === "lose";
  const lifts = liftProgress(i.workouts, i.unit, through);
  const anyDown = lifts != null && lifts.some((l) => l.changePct <= LIFT_DOWN_PCT);
  // Together: the main lifts' mean change, steadier than any one lift's.
  const noneUp = lifts != null && mean(lifts.map((l) => l.changePct)) < LIFT_FLAT_PCT;
  // On a cut, holding strength is the aim, so only a lift going down counts; otherwise no progress counts.
  const stalled = cut ? anyDown : noneUp;
  if (nights.length >= FIND_MIN_NIGHTS && mean(nights) < SHORT_SLEEP_H && stalled && lifts) {
    // On a cut the read is lifts going down; otherwise it is no progress, whatever one lift's wobble.
    const words = !cut ? "have not progressed" : lifts.every((l) => l.changePct <= LIFT_DOWN_PCT) ? "are down" : "include one that is down";
    const list = liftsList(lifts);
    const own = i.sleepConnectionPct != null && i.sleepConnectionPct > 0 ? ` Across your own last 16 weeks, sessions after your longest nights were ${i.sleepConnectionPct.toFixed(1)}% stronger than after your shortest.` : "";
    out.push({
      id: "sleep-lifts",
      title: "Short sleep, lifts not progressing",
      fact: `${formatHoursMin(Math.round(mean(nights) * 60))} a night · ${liftsKg(lifts, i.unit)} in 8 weeks`,
      data: `Sleep averaged ${formatHoursMin(Math.round(mean(nights) * 60))} over ${nights.length} nights in the last 4 weeks, under the 7 hours adults need, and your main lifts ${words} over the last 8 weeks (${list}).${own}`,
      evidence: cut
        ? `Dieting on 5.5 hours in bed instead of 8.5 lost the same weight, with 60% more of it lean mass (Nedeltcheva 2010).`
        : `Five nights of 4 hours' sleep left muscle protein synthesis about a fifth lower (Saner 2020).`,
      sources: ["Watson NF et al. Sleep 2015;38:843–4", "Nedeltcheva AV et al. Ann Intern Med 2010;153:435–41", "Saner NJ et al. J Physiol 2020;598:1523–36", "Knowles OE et al. J Sci Med Sport 2018;21:959–68"],
    });
  }

  // ── Protein ──
  // Not read from a log that looks incomplete: low protein there is the log, not the diet.
  const logIncomplete = out.some((x) => x.id === "underlog");
  if (!logIncomplete && complete.length >= FIND_MIN_PROTEIN_DAYS && endKg != null) {
    const g = mean(complete.map((d) => d.proteinG));
    const gPerKg = g / endKg;
    const floor = cut ? PRO1_MIN_G_PER_KG : PRO2_MIN_G_PER_KG;
    if (gPerKg < floor) {
      const perKg = Number(gPerKg.toFixed(1)) >= floor ? gPerKg.toFixed(2) : gPerKg.toFixed(1);
      out.push({
        id: "protein-low",
        title: "Low on protein",
        // Plain grams for this person's weight, not g/kg (the founder: no technical wording). Down and up so the two never meet.
        fact: `${Math.floor(g)} g a day · studies: ${Math.ceil(floor * endKg)} g or more`,
        // Two decimals when one would round up to the level it is under ("1.8, under 1.8" read as a contradiction).
        data: `Protein averaged ${n0(g)} g a day over ${complete.length} complete days in the last 4 weeks, ${perKg} g per kg of body weight.`,
        evidence: cut
          ? `Lean lifters in a deficit kept more muscle on about 1.8 g per kg of body weight or more (Helms 2014).`
          : `Across 49 trials, gains from training levelled off at about 1.6 g per kg a day (Morton 2018).`,
        sources: cut ? ["Helms ER et al. Int J Sport Nutr Exerc Metab 2014;24:127–38"] : ["Morton RW et al. Br J Sports Med 2018;52:376–84"],
      });
    }
  }

  // ── The rate against the evidence ──
  if (ratePct != null && i.goal?.type === "gain") {
    const band = GAIN_BANDS[i.goal.trainingStatusAtCreation ?? "intermediate"];
    if (ratePct > band.greenMax + GAIN_FAST_MARGIN_PCT) {
      const target = targetInEffect(i.program, through)?.kcal ?? null;
      const intakePart = meanKcal != null ? `, on ${n0(meanKcal)} kcal a day${target != null && meanKcal - target > 50 ? `, ${n0(meanKcal - target)} over the ${n0(target)} target` : ""}` : "";
      out.push({
        id: "gain-fast",
        title: "Gaining faster than is useful",
        fact: `Gaining ${formatWeight((ratePct * endKg!) / 100, i.unit)} a week · studies: up to ${formatWeight((band.greenMax * endKg!) / 100, i.unit)}`,
        data: `The trend rose ${signedRate(ratePct)} over the last 4 weeks${intakePart}.`,
        evidence: `A review for lifters puts a useful rate at 0.25 to 0.5% of body weight a week, faster adding mostly fat (Iraki 2019).`,
        sources: ["Iraki J et al. Sports 2019;7:154", "Garthe I et al. Eur J Sport Sci 2013;13:295–303"],
      });
    }
  }
  if (ratePct != null && cut && ratePct < -CUT_FAST_PCT && anyDown && lifts) {
    out.push({
      id: "cut-fast-lifts",
      title: "Losing fast while lifts drop",
      fact: `Losing ${formatWeight((Math.abs(ratePct) * endKg!) / 100, i.unit)} a week · ${liftsKg(lifts, i.unit)} in 8 weeks`,
      data: `The trend fell ${signedRate(ratePct)} over the last 4 weeks, and over 8 weeks ${liftsList(lifts)}.`,
      evidence: `Athletes losing 0.7% of body weight a week kept more lean mass and strength than at 1.4% (Garthe 2011).`,
      sources: ["Garthe I et al. Int J Sport Nutr Exerc Metab 2011;21:97–104"],
    });
  }

  return out;
}
