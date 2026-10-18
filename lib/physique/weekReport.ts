/**
 * Weekly report (06-execution Sprint 0, W1): one Monday-to-Sunday week of
 * everything the user logged, as numbers and the engine's own words.
 * Weight trend and rate, expenditure move, intake against target, protein,
 * sessions and hard sets per muscle, main-lift e1RM changes, sleep mean
 * and short nights, the week's verdict, and every gap; since B3 also fibre,
 * steps, resting heart rate, waist and the priority muscles' sets, so the
 * scorecard can lead with what the goal needs. Pure: the caller passes
 * the records, the expenditure series and the verdict.
 *
 * Copy rule for anything built on this: state what is, never cheer.
 */

import { readVolume, type Band, type VolumeRead } from "@/lib/training/volumeTargets";
import { addDays, dateRange, dayDiff, minDate, type LocalDate, type Now } from "@/lib/dates";
import { weekStart } from "@/lib/physique/food/week";
import { countsForBalance } from "@/lib/physique/food/energy";
import { dailyIntakeSeries, targetInEffect } from "@/lib/physique/intake";
import { displayRate, segmentStart, trendSeries, weighInsByDate } from "@/lib/physique/weight";
import { clampSleepGoal, nightsByDate, thresholdsForWindow, type NormalizedNight } from "@/lib/physique/sleep";
import { isCompoundLift, liftSeries, workoutDate } from "@/lib/physique/strength";
import { CONSISTENCY_MIN_NIGHTS, nightAxisMin } from "@/lib/physique/sleepScore";
import { mean, stdev } from "@/lib/stats";
import { knownFibre } from "@/lib/food/fibre";
import { waistChange } from "@/lib/physique/judge";
import { BASELINE_DAYS, BASELINE_MIN_VALID, RECENT_MIN_VALID } from "@/lib/physique/recovery";
import { countHardSets } from "@/lib/completedSets";
import { getDetailedVolumeByMuscleGroup, type DetailedMuscleGroup } from "@/lib/trainingMetrics";
import { GROUP_LABEL } from "@/lib/volumeAnalysis";
import type { StoredWorkout } from "@/lib/trainingAnalysis";
import type { WeightUnit } from "@/lib/units";
import type { DailySteps, DayFlags, ExpenditurePoint, ExpenditureState, FoodEntry, PhysiqueGoal, PhysiqueProgram, SignalState, SleepNight, WaistEntry, WeighIn } from "@/lib/physique/types";

/** Lift changes compare this week's best e1RM with the best of the previous 3 weeks. OURS. */
export const LIFT_BASELINE_WEEKS = 3;
/** Muscles shown in the training section, most sets first. OURS. */
export const MUSCLES_SHOWN = 8;
/** A complete day hits protein at this share of the target or more. OURS: within 10% is on target for a day. */
export const PROTEIN_HIT_SHARE = 0.9;
/** Days a fibre or step average needs. OURS: three, the weekly report's floor for any average. */
export const MIN_DAYS_FOR_MEAN = 3;
/** Waist is read over this many days to the week's end. EVID: the judge's 28-day waist window (research F §10). */
export const WAIST_READ_DAYS = 28;

/** One day of the week for the report's small charts (W4). Null where nothing was logged. */
export type WeekDay = {
  date: LocalDate;
  trendKg: number | null;
  kcal: number | null;
  proteinG: number | null;
  asleepH: number | null;
  /** Null when the day's fibre cannot be read (FIBRE_KNOWN_SHARE). */
  fibreG: number | null;
  steps: number | null;
  sessions: number;
  hardSets: number;
};

export type WeekGapKind = "food" | "weight" | "sleep";
export type WeekGap = { kind: WeekGapKind; date: LocalDate };

export type WeekVerdict = { title: string; detail: string; state: SignalState };

export type WeekReportInputs = {
  weighIns: readonly WeighIn[];
  foodEntries: readonly FoodEntry[];
  dayFlags: Readonly<Record<string, DayFlags>>;
  sleepNights: readonly SleepNight[];
  workouts: readonly StoredWorkout[];
  program: PhysiqueProgram | null;
  goal: PhysiqueGoal | null;
  sleepGoalH?: number;
  weightUnit: WeightUnit;
  /** Weekly set bands per muscle from the user's priorities (T5); absent before priorities exist. */
  volumeBands?: Partial<Record<DetailedMuscleGroup, Band>>;
  /** The engine's expenditure series up to today, or null before it can be seeded. */
  expenditure: readonly ExpenditurePoint[] | null;
  /** The judge's verdict as of today; shown on the current week only. */
  verdict?: WeekVerdict | null;
  waist?: readonly WaistEntry[];
  /** Apple Health step counts (B3). */
  steps?: readonly DailySteps[];
  /** Muscles the user chose to emphasise; their sets are read against `volumeBands`. */
  emphasised?: readonly DetailedMuscleGroup[];
};

export type WeekReport = {
  start: LocalDate;
  end: LocalDate;
  /** Last day the report covers: the week's end, or today while the week runs. */
  through: LocalDate;
  /** True once the whole week is behind today. */
  complete: boolean;
  daysCovered: number;
  weight: {
    startTrendKg: number | null;
    endTrendKg: number | null;
    deltaKg: number | null;
    ratePctPerWeek: number | null;
    /** The rate's one-sided 95% margin in %/wk (weight.ts), so a read against the plan can allow for noise as the judge does. */
    rateMarginPct: number | null;
    rateWindowDays: number | null;
    weighIns: number;
    missing: LocalDate[];
  };
  expenditure: { startKcal: number | null; endKcal: number | null; deltaKcal: number | null; state: ExpenditureState | null };
  food: {
    daysLogged: number;
    complete: number;
    partial: number;
    fasting: number;
    unlogged: LocalDate[];
    meanKcal: number | null;
    targetKcal: number | null;
    deltaKcal: number | null;
    meanProteinG: number | null;
    targetProteinG: number | null;
    proteinGPerKg: number | null;
    /** Complete days at PROTEIN_HIT_SHARE of the target or more; null without a target. */
    proteinDaysHit: number | null;
    /** Mean fibre over the days it can be read, once MIN_DAYS_FOR_MEAN have it. */
    meanFibreG: number | null;
    fibreDays: number;
  };
  training: {
    sessions: number;
    hardSets: number;
    byMuscle: Array<{ group: DetailedMuscleGroup; label: string; sets: number; band?: Band; read?: VolumeRead }>;
    lifts: Array<{ name: string; e1rmKg: number; prevE1rmKg: number | null; changePct: number | null }>;
    /** Distinct days with a session. */
    days: number;
    /** The emphasised muscles against their bands; null when none are emphasised. */
    priority: { muscles: number; inRange: number; over: string[]; under: string[] } | null;
  };
  sleep: {
    nights: number;
    missing: LocalDate[];
    meanH: number | null;
    goalH: number;
    shortNights: number;
    /** Sample SD of the week's wake times in minutes, once CONSISTENCY_MIN_NIGHTS nights carry one. */
    wakeSpreadMin: number | null;
  };
  /** Daily steps and resting heart rate, from Apple Health when connected (B3). */
  health: {
    stepDays: number;
    meanSteps: number | null;
    rhrNights: number;
    meanRhr: number | null;
    /** Mean over the BASELINE_DAYS before the week, once BASELINE_MIN_VALID nights carry one. */
    usualRhr: number | null;
  };
  /** The judge's waist read over the WAIST_READ_DAYS to the week's end. */
  waist: { entries: number; latestCm: number | null; deltaCm: number | null; weeks: number };
  /** Each day from the start to `through`, for the small charts (W4). */
  days: WeekDay[];
  verdict: WeekVerdict | null;
  gaps: WeekGap[];
  /** False when the week holds no food, weigh-in, night or workout at all. */
  hasData: boolean;
};

/** The Monday of the week containing `date`. */
export function reportWeekStart(date: LocalDate): LocalDate {
  return weekStart(date);
}

/**
 * The week a user most wants on opening: the running week once it has
 * three days of data, else the previous one. OURS.
 */
export function defaultReportWeek(today: LocalDate): LocalDate {
  const start = weekStart(today);
  return dayDiff(start, today) + 1 >= 3 ? start : addDays(start, -7);
}

/** A kind has gaps only from its first record onward, as the gap lists do (lib/physique/gaps.ts). */
function earliest(dates: Iterable<LocalDate>): LocalDate | null {
  let first: LocalDate | null = null;
  for (const d of dates) if (first == null || d < first) first = d;
  return first;
}

function round1(n: number): number {
  return Math.round(n * 10) / 10;
}

export function buildWeekReport(inputs: WeekReportInputs, start: LocalDate, now: Now): WeekReport {
  const end = addDays(start, 6);
  const today = now.today;
  const through = minDate(end, today);
  const complete = end < today;
  const days = start <= through ? dateRange(start, through) : [];
  const daysCovered = days.length;

  // ── Weight ──
  const weighInsToEnd = inputs.weighIns.filter((w) => w.date <= through);
  const trend = trendSeries(weighInsToEnd);
  const trendAt = (date: LocalDate): number | null => {
    if (trend.length === 0) return null;
    let last: number | null = null;
    for (const p of trend) {
      if (p.date > date) break;
      last = p.trendKg;
    }
    return last;
  };
  const startTrendKg = trendAt(addDays(start, -1)) ?? trendAt(start);
  const endTrendKg = trendAt(through);
  const seg = segmentStart({ goal: inputs.goal, dayFlags: inputs.dayFlags, today: through });
  const rate = daysCovered > 0 ? displayRate(inputs.weighIns, through, seg, inputs.dayFlags) : null;
  const weighDates = weighInsByDate(inputs.weighIns);
  const firstWeigh = earliest(weighDates.keys());
  const weighMissing = days.filter((d) => firstWeigh != null && d >= firstWeigh && !weighDates.has(d));

  // ── Expenditure ──
  const expWeek = (inputs.expenditure ?? []).filter((p) => p.date >= start && p.date <= through);
  const expStart = expWeek[0] ?? null;
  const expEnd = expWeek[expWeek.length - 1] ?? null;

  // ── Food ──
  const intake = daysCovered > 0 ? dailyIntakeSeries(inputs.foodEntries, inputs.dayFlags, start, through) : [];
  const counted = intake.filter((d) => countsForBalance(d.status));
  const completeDays = intake.filter((d) => d.status === "complete");
  const target = targetInEffect(inputs.program, through);
  const meanKcal = counted.length ? Math.round(counted.reduce((s, d) => s + d.kcal, 0) / counted.length) : null;
  const meanProteinG = completeDays.length ? Math.round(completeDays.reduce((s, d) => s + d.proteinG, 0) / completeDays.length) : null;
  const firstFood = earliest([...inputs.foodEntries.map((e) => e.date), ...Object.values(inputs.dayFlags).filter((f) => f.status === "fasting" || typeof f.kcalOverride === "number").map((f) => f.date)]);
  const unlogged = intake.filter((d) => d.status === "unlogged" && firstFood != null && d.date >= firstFood).map((d) => d.date);
  // Fibre: complete days only, and only when foods with a known value carry most of the day's energy.
  const fibreByDay = new Map<LocalDate, number>();
  for (const d of completeDays) {
    const fibre = knownFibre(inputs.foodEntries.filter((e) => e.date === d.date));
    if (fibre != null) fibreByDay.set(d.date, fibre);
  }
  const fibreDays = fibreByDay.size;
  const meanFibreG = fibreDays >= MIN_DAYS_FOR_MEAN ? Math.round(mean([...fibreByDay.values()])) : null;

  // ── Training ──
  const weekWorkouts = inputs.workouts.filter((w) => {
    const d = workoutDate(w, now.tz);
    return d != null && d >= start && d <= through;
  });
  const hardSets = weekWorkouts.reduce((n, w) => n + (w.exercises ?? []).reduce((m, ex) => m + countHardSets(ex.sets ?? []), 0), 0);
  const volume = getDetailedVolumeByMuscleGroup(weekWorkouts);
  const byMuscle = (Object.entries(volume) as Array<[DetailedMuscleGroup, number]>)
    .filter(([, sets]) => sets > 0)
    .sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]))
    .slice(0, MUSCLES_SHOWN)
    .map(([group, sets]) => {
      const band = inputs.volumeBands?.[group];
      return { group, label: GROUP_LABEL[group] ?? group, sets, ...(band ? { band, read: readVolume(sets, band, { tracked: true, complete }) } : {}) };
    });
  const trainingDays = new Set(weekWorkouts.map((w) => workoutDate(w, now.tz)).filter((d): d is LocalDate => d != null)).size;
  const emphasised = (inputs.emphasised ?? []).filter((g) => inputs.volumeBands?.[g]);
  const priorityReads = emphasised.map((g) => ({ label: GROUP_LABEL[g] ?? g, read: readVolume(volume[g] ?? 0, inputs.volumeBands![g]!, { tracked: true, complete }) }));
  const priority = priorityReads.length
    ? { muscles: priorityReads.length, inRange: priorityReads.filter((p) => p.read === "in_range").length, over: priorityReads.filter((p) => p.read === "over").map((p) => p.label), under: priorityReads.filter((p) => p.read === "under").map((p) => p.label) }
    : null;
  const baselineFrom = addDays(start, -LIFT_BASELINE_WEEKS * 7);
  const lifts = liftSeries(inputs.workouts, inputs.weightUnit, { today: through, tz: now.tz })
    .filter((s) => isCompoundLift(s.name, s.exerciseId))
    .map((s) => {
      const thisWeek = s.exposures.filter((e) => e.date >= start && e.date <= through);
      if (thisWeek.length === 0) return null;
      const prev = s.exposures.filter((e) => e.date >= baselineFrom && e.date < start);
      const e1rmKg = Math.max(...thisWeek.map((e) => e.e1rm));
      const prevE1rmKg = prev.length ? Math.max(...prev.map((e) => e.e1rm)) : null;
      return { name: s.name, e1rmKg: round1(e1rmKg), prevE1rmKg: prevE1rmKg != null ? round1(prevE1rmKg) : null, changePct: prevE1rmKg ? round1(((e1rmKg - prevE1rmKg) / prevE1rmKg) * 100) : null };
    })
    .filter((x): x is NonNullable<typeof x> => x != null)
    .sort((a, b) => a.name.localeCompare(b.name));

  // ── Sleep ──
  const goalH = clampSleepGoal(inputs.sleepGoalH);
  const byDate = nightsByDate(inputs.sleepNights);
  const nights: NormalizedNight[] = days.map((d) => byDate.get(d)).filter((n): n is NormalizedNight => n != null && n.valid);
  const firstNight = earliest(byDate.keys());
  const sleepMissing = days.filter((d) => firstNight != null && d >= firstNight && !byDate.has(d));
  const meanH = nights.length ? round1(nights.reduce((s, n) => s + n.asleepH, 0) / nights.length) : null;
  const acuteH = thresholdsForWindow(nights).acuteH;
  const shortNights = nights.filter((n) => n.asleepH < acuteH).length;
  const wakes = nights.map((n) => nightAxisMin(n.night.wakeTime)).filter((x): x is number => x != null);
  const wakeSpreadMin = wakes.length >= CONSISTENCY_MIN_NIGHTS ? Math.round(stdev(wakes)) : null;

  // ── Steps and resting heart rate (Apple Health) ──
  // Today's steps are still counting, so a running week reads through yesterday.
  const stepsByDay = new Map((inputs.steps ?? []).filter((s) => s.date >= start && s.date <= through && s.date < today && Number.isFinite(s.steps)).map((s) => [s.date, s.steps]));
  const meanSteps = stepsByDay.size >= MIN_DAYS_FOR_MEAN ? Math.round(mean([...stepsByDay.values()])) : null;
  const rhrs = days.map((d) => byDate.get(d)?.night.restingHr).filter((x): x is number => typeof x === "number" && x > 0);
  const usualFrom = addDays(start, -BASELINE_DAYS);
  const usual = inputs.sleepNights.filter((n) => n.date >= usualFrom && n.date < start && typeof n.restingHr === "number" && n.restingHr > 0).map((n) => n.restingHr as number);

  // ── Waist ──
  const waist = inputs.waist ?? [];
  const waistRead = waistChange(waist, addDays(through, -(WAIST_READ_DAYS - 1)), through);
  const lastWaist = waist.filter((w) => w.date <= through && w.cm > 0).sort((a, b) => (a.date < b.date ? -1 : 1)).at(-1) ?? null;

  // ── Days, for the small charts ──
  const setsByDay = new Map<LocalDate, { sessions: number; hardSets: number }>();
  for (const w of weekWorkouts) {
    const d = workoutDate(w, now.tz);
    if (!d) continue;
    const cur = setsByDay.get(d) ?? { sessions: 0, hardSets: 0 };
    cur.sessions += 1;
    cur.hardSets += (w.exercises ?? []).reduce((m, ex) => m + countHardSets(ex.sets ?? []), 0);
    setsByDay.set(d, cur);
  }
  const intakeByDay = new Map(intake.map((d) => [d.date, d]));
  const weekDays: WeekDay[] = days.map((date) => {
    const t = trendAt(date);
    const f = intakeByDay.get(date);
    const night = byDate.get(date);
    const tr = setsByDay.get(date);
    return {
      date,
      trendKg: t != null && weighDates.size > 0 && (firstWeigh == null || date >= firstWeigh) ? round1(t) : null,
      kcal: f && f.status !== "unlogged" ? Math.round(f.kcal) : null,
      proteinG: f && f.status === "complete" ? Math.round(f.proteinG) : null,
      asleepH: night && night.valid ? round1(night.asleepH) : null,
      fibreG: fibreByDay.get(date) ?? null,
      steps: stepsByDay.get(date) ?? null,
      sessions: tr?.sessions ?? 0,
      hardSets: tr?.hardSets ?? 0,
    };
  });

  // ── Gaps ──
  const gaps: WeekGap[] = [
    ...unlogged.map((date) => ({ kind: "food" as const, date })),
    ...weighMissing.map((date) => ({ kind: "weight" as const, date })),
    ...sleepMissing.map((date) => ({ kind: "sleep" as const, date })),
  ].sort((a, b) => (a.date < b.date ? -1 : a.date > b.date ? 1 : a.kind.localeCompare(b.kind)));

  return {
    start,
    end,
    through,
    complete,
    daysCovered,
    weight: {
      startTrendKg: startTrendKg != null ? round1(startTrendKg) : null,
      endTrendKg: endTrendKg != null ? round1(endTrendKg) : null,
      deltaKg: startTrendKg != null && endTrendKg != null ? round1(endTrendKg - startTrendKg) : null,
      ratePctPerWeek: rate ? Math.round(rate.result.ratePctPerWeek * 100) / 100 : null,
      rateMarginPct: rate ? Math.round(rate.result.margin * 100) / 100 : null,
      rateWindowDays: rate ? rate.windowDays : null,
      weighIns: days.filter((d) => weighDates.has(d)).length,
      missing: weighMissing,
    },
    expenditure: {
      startKcal: expStart ? Math.round(expStart.tdee) : null,
      endKcal: expEnd ? Math.round(expEnd.tdee) : null,
      deltaKcal: expStart && expEnd ? Math.round(expEnd.tdee - expStart.tdee) : null,
      state: expEnd ? (expEnd.state === "holding" ? "holding" : null) : null,
    },
    food: {
      daysLogged: counted.length + intake.filter((d) => d.status === "partial").length,
      complete: completeDays.length,
      partial: intake.filter((d) => d.status === "partial").length,
      fasting: intake.filter((d) => d.status === "fasting").length,
      unlogged,
      meanKcal,
      targetKcal: target ? target.kcal : null,
      deltaKcal: meanKcal != null && target ? meanKcal - target.kcal : null,
      meanProteinG,
      targetProteinG: target ? target.proteinG : null,
      proteinGPerKg: meanProteinG != null && endTrendKg ? round1(meanProteinG / endTrendKg) : null,
      proteinDaysHit: target ? completeDays.filter((d) => d.proteinG >= target.proteinG * PROTEIN_HIT_SHARE).length : null,
      meanFibreG,
      fibreDays,
    },
    training: { sessions: weekWorkouts.length, hardSets, byMuscle, lifts, days: trainingDays, priority },
    sleep: { nights: nights.length, missing: sleepMissing, meanH, goalH, shortNights, wakeSpreadMin },
    health: {
      stepDays: stepsByDay.size,
      meanSteps,
      rhrNights: rhrs.length,
      meanRhr: rhrs.length >= RECENT_MIN_VALID ? Math.round(mean(rhrs)) : null,
      usualRhr: usual.length >= BASELINE_MIN_VALID ? Math.round(mean(usual)) : null,
    },
    waist: { entries: waistRead.entries, latestCm: lastWaist ? round1(lastWaist.cm) : null, deltaCm: waistRead.deltaCm != null ? round1(waistRead.deltaCm) : null, weeks: Math.round(waistRead.weeks) },
    days: weekDays,
    verdict: inputs.verdict ?? null,
    gaps,
    hasData: counted.length + intake.filter((d) => d.status === "partial").length > 0 || days.some((d) => weighDates.has(d)) || nights.length > 0 || weekWorkouts.length > 0,
  };
}
