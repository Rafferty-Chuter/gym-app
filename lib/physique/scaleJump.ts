/**
 * Why the scale jumped (IN2, 08-insights.md). Pure.
 *
 * A morning's weigh-in is read against where the person's weight was
 * heading: a robust straight line through the weigh-ins of the 21 days
 * before it. (The trend shown elsewhere is a moving average that runs
 * about nine days behind, so on a cut it sits above the scale and would
 * call every morning a drop.) The app speaks only when the gap is at
 * least 0.5 kg and 1.5 times the person's own day-to-day spread, with 21
 * such reads behind it; twice the spread when nothing logged explains it.
 * The scale must also have moved that way by 0.5 kg since the last
 * weigh-in (within three days), so the read never says "up" on a morning
 * the person saw a drop, and the number they are shown is that move.
 *
 * Then it names what was logged that moves water and gut contents:
 * carbs, calories and (IN9) salt against the person's 14-day usual, the
 * day before (and, at about half the size, two days before), drinks the
 * evening before (IN9), a leg session, and logged events (creatine, a
 * period, illness, travel, a carb switch). Sizes start from the evidence
 * (research L §3) and become the person's own after 60 reads, by a ridge
 * fit shrunk towards those priors. Drinks start at nothing either way (no
 * study weighed people the morning after), so they are named only once
 * the person's own mornings show it. A cause is named only when its share
 * of the move is 0.3 kg or more and points the same way. Never fat (02 §10
 * rule 4); a period is named, never sized (rule 12).
 *
 * Last, how long the person's own past jumps took to go.
 */

import { addDays, dayDiff, type LocalDate } from "@/lib/dates";
import { mad, median, robustSlope, solveLinear } from "@/lib/stats";
import { countsAsLogged, dailyIntakeSeries } from "@/lib/physique/intake";
import { workoutDate } from "@/lib/physique/strength";
import { drinkingEvenings, sodiumByDay, type Evening } from "@/lib/physique/dayExtras";
import { SODIUM_PER_SALT } from "@/lib/food/extras";
import { weighInsByDate } from "@/lib/physique/weight";
import { countHardSets } from "@/lib/completedSets";
import { getDetailedMuscleGroupsForLoggedExercise } from "@/lib/trainingMetrics";
import type { DailyIntake, DayEventType, DayFlags, FoodEntry, WeighIn } from "@/lib/physique/types";
import type { StoredWorkout } from "@/lib/trainingAnalysis";

// ── Thresholds ──

/** Days of weigh-ins behind the line a morning is read against. OURS: three weeks follows a cut's pace and a few odd days don't tip it. */
export const JUMP_FIT_DAYS = 21;
/** Weigh-ins in those days before a morning is read. OURS. */
export const JUMP_FIT_MIN = 7;
/** Days of past reads the person's day-to-day spread is taken from. OURS. */
export const JUMP_SPREAD_DAYS = 90;
/** Past reads needed before the app speaks. OURS (08 IN2): three weeks of mornings. */
export const JUMP_MIN_READS = 21;
/** Smallest move spoken about, kg. OURS: under half a kilo is what a scale does on any morning. */
export const JUMP_MIN_KG = 0.5;
/** ...and it must be this many times the person's own spread. OURS (research L §4). */
export const JUMP_SPREAD_MULT = 1.5;
/** A move with nothing logged behind it is said only past this many times the spread. OURS (IN2 study): at 1.5 an ordinary scale was "up" or "down" one morning in nine; at 2 about one in 25, and every explained read stays. */
export const JUMP_QUIET_MULT = 2;
/** A weigh-in this many days before or fewer is "the last one" the move is shown against. OURS: past that the person has nothing to compare by eye. */
export const JUMP_PREVIOUS_DAYS = 3;
/** MAD to a standard deviation for normal noise. PUB. */
export const MAD_TO_SD = 1.4826;
/** Days before a food day its "usual" is taken from. OURS: two weeks, as the macro means. */
export const USUAL_FOOD_DAYS = 14;
/** Logged days among them before a usual exists. OURS. */
export const USUAL_FOOD_MIN = 7;
/** Water held per g of carbs above usual, kg (0.3 kg per 100 g). EVID: about 3 g of water per g of glycogen (Fernández-Elías 2015), glycogen loading +2.3% body water (Bone 2017); the 0.2 to 0.4 kg per 100 g range is derived (research L §3). */
export const CARB_WATER_KG_PER_G = 0.003;
/** Gut contents per kcal above usual, kg (0.3 kg per 1,000 kcal). EVID derived: a bigger food day adds 0.3 to 1 kg that passes in 1 to 2 days (de Vries 2015; research L §3). */
export const FOOD_MASS_KG_PER_KCAL = 0.0003;
/** Water held per g of sodium above usual, kg. EVID derived: at the body's 140 mmol/L, 1 g of sodium holds about 0.3 L of water (research L §3: about 0.3 kg per extra g retained); OURS: two-thirds of a day's extra taken as still held the next morning, as some leaves the same day (IN9). */
export const SODIUM_WATER_KG_PER_G = 0.2;
/** The scale the morning after a drinking evening, kg. EVID: no study weighed people the morning after; about 100 mL of urine per 10 g of alcohol (Polhuis 2017) pulls it down, the food and salt that come with drinking push it up. So the prior is nothing, and the size is only ever the person's own (IN9). */
export const ALCOHOL_SCALE_KG = 0;
/** A hard leg session the day before or two before, kg. EVID weak (research L §3: 0 to 0.5 kg, learn it per person): set below `CAUSE_MIN_KG`, so it is named only once the person's own data shows it. */
export const LEG_SESSION_KG = 0.15;
/** Hard sets for quads, hamstrings or glutes in a day that count as a leg session. OURS. */
export const LEG_MIN_HARD_SETS = 6;
/** Share of a food day's effect still on the scale two mornings later. EVID derived: glycogen water clears over 2 to 4 days (research L §3). */
export const CARRY_TWO_DAYS = 0.6;
/** Smallest share of the move a cause must carry to be named, kg. OURS (research L §4). */
export const CAUSE_MIN_KG = 0.3;
/** Reads with a logged day before them before the sizes are the person's own. OURS (research L §4). */
export const PERSONAL_MIN_READS = 60;
/** Days of reads the personal sizes are fitted on. OURS. */
export const PERSONAL_DAYS = 180;
/** Weight of the evidence against the person's data in the ridge fit, in pseudo-reads at one unit of each driver. OURS. */
export const PRIOR_WEIGHT = 10;
/** Most a learned size may reach, per 100 g carbs / 1,000 kcal / leg session / g of sodium / drinking evening (either way), kg. OURS: past this a fit is chasing noise. */
export const MAX_SIZE_KG = 0.8;
/** Days a past jump has to be gone in to count. OURS. */
export const SETTLE_MAX_DAYS = 10;
/** Past jumps needed before "gone in N days" is said. OURS. */
export const SETTLE_MIN_JUMPS = 3;
/** Most past jumps the range is taken from (the latest). OURS. */
export const SETTLE_LAST = 6;
/** Days a creatine start is named for. EVID: water rises over the first weeks (02 §2.4). */
export const CREATINE_DAYS = 28;
/** Days a period, illness, travel or carb switch is named for. OURS. */
export const EVENT_DAYS = 3;
/** Smallest change in carbs (g) or calories (kcal) the cause line lists. OURS: smaller is a normal day. */
export const LIST_CARBS_G = 40;
export const LIST_KCAL = 300;
/** ...and in salt, g (sodium × 2.5, as UK labels give it). OURS (IN9): two grams is a salty meal; less is an ordinary day. */
export const LIST_SALT_G = 2;
/** Salt per g of sodium, as UK labels give it (IN6's SODIUM_PER_SALT, inverted). PUB. */
export const SALT_PER_SODIUM = 1 / SODIUM_PER_SALT;

const LEG_GROUPS = new Set(["quads", "hamstrings", "glutes"]);

// ── Types ──

/** `sodiumDeltaMg` is null when that day's sodium isn't known (IN9). */
export type FoodCause = { kind: "food"; daysAgo: 1 | 2; carbsDeltaG: number; kcalDelta: number; sodiumDeltaMg: number | null; shareKg: number };
/** IN9: a drinking evening the day before, named only on the person's own size. */
export type DrinksCause = { kind: "drinks"; alcoholG: number; shareKg: number };
export type LegsCause = { kind: "legs"; daysAgo: 1 | 2; hardSets: number; shareKg: number };
export type EventCause = { kind: "event"; type: DayEventType; date: LocalDate };
export type JumpCause = FoodCause | DrinksCause | LegsCause | EventCause;

export type ScaleJump = {
  date: LocalDate;
  scaleKg: number;
  /** Where the line through the past three weeks put this morning. */
  expectedKg: number;
  /** Scale less expected, kg. */
  deltaKg: number;
  /** Scale less the last weigh-in, kg: the move the person saw. */
  changeKg: number;
  /** The last weigh-in's date. */
  previousDate: LocalDate;
  direction: "up" | "down";
  /** The person's usual day-to-day spread around that line, kg (one SD). */
  spreadKg: number;
  /** Ranked, the largest share first; events last. */
  causes: JumpCause[];
  /** How the day before was logged: in full (complete or fasting), part of it (partial or suspected partial), or not at all. */
  foodLog: "logged" | "partial" | "unlogged";
  /** The person's past jumps the same way: how many, and the days they took to go. */
  settle: { jumps: number; minDays: number; maxDays: number } | null;
  /** Sizes learned from the person's own data rather than the evidence alone. */
  personal: boolean;
};

export type ScaleJumpInputs = {
  weighIns: readonly WeighIn[];
  foodEntries: readonly FoodEntry[];
  dayFlags: Readonly<Record<string, DayFlags>>;
  workouts: readonly StoredWorkout[];
  tz: string;
};

// ── Reads ──

type Drivers = { carbs: number; kcal: number; legs: number; sodium: number; drink: number; day1: Delta | null; day2: Delta | null; legSets: { daysAgo: 1 | 2; sets: number } | null; alcoholG: number };
type Delta = { carbsG: number; kcal: number; sodiumMg: number | null };

/**
 * Each weigh-in morning in [from, to] against where the line through the
 * three weeks before it put that morning: scale less expected, kg. IN9's
 * alcohol read takes the morning after a drinking evening from here.
 */
export function scaleDeviations(weighIns: readonly WeighIn[], from: LocalDate, to: LocalDate): Map<LocalDate, number> {
  return new Map([...deviations(weighInsByDate(weighIns), from, to)].map(([d, v]) => [d, v.dev]));
}

/** Every weigh-in morning in [from, to] read against the line before it: scale less expected. */
function deviations(byDate: ReadonlyMap<LocalDate, number>, from: LocalDate, to: LocalDate): Map<LocalDate, { kg: number; expected: number; dev: number }> {
  const out = new Map<LocalDate, { kg: number; expected: number; dev: number }>();
  for (let d = from; d <= to; d = addDays(d, 1)) {
    const kg = byDate.get(d);
    if (kg == null) continue;
    const xs: number[] = [];
    const ys: number[] = [];
    for (let k = 1; k <= JUMP_FIT_DAYS; k++) {
      const v = byDate.get(addDays(d, -k));
      if (v != null) {
        xs.push(-k);
        ys.push(v);
      }
    }
    if (xs.length < JUMP_FIT_MIN) continue;
    const expected = robustSlope(xs, ys).intercept;
    out.set(d, { kg, expected, dev: kg - expected });
  }
  return out;
}

/** Hard sets for quads, hamstrings or glutes, by local date. */
function legSetsByDate(workouts: readonly StoredWorkout[], tz: string): Map<LocalDate, number> {
  const out = new Map<LocalDate, number>();
  for (const w of workouts) {
    const d = workoutDate(w, tz);
    if (!d) continue;
    let sets = 0;
    for (const ex of w.exercises ?? []) {
      if (getDetailedMuscleGroupsForLoggedExercise(ex).some((g) => LEG_GROUPS.has(g))) sets += countHardSets(ex.sets ?? []);
    }
    if (sets > 0) out.set(d, (out.get(d) ?? 0) + sets);
  }
  return out;
}

/**
 * A food day's carbs and calories against the person's usual (median of the
 * logged days in the 14 before it); null when it or its usual isn't logged.
 * Its sodium likewise (IN9), null when that day's or too few of the usual
 * days' sodium is known.
 */
function foodDelta(intake: ReadonlyMap<LocalDate, DailyIntake>, sodium: ReadonlyMap<LocalDate, number>, d: LocalDate): Delta | null {
  const x = intake.get(d);
  if (!x || !countsAsLogged(x.status)) return null;
  const carbs: number[] = [];
  const kcal: number[] = [];
  const mg: number[] = [];
  for (let k = 1; k <= USUAL_FOOD_DAYS; k++) {
    const date = addDays(d, -k);
    const y = intake.get(date);
    if (y && countsAsLogged(y.status)) {
      carbs.push(y.carbsG);
      kcal.push(y.kcal);
      const s = sodium.get(date);
      if (s != null) mg.push(s);
    }
  }
  if (carbs.length < USUAL_FOOD_MIN) return null;
  const today = sodium.get(d);
  return { carbsG: x.carbsG - median(carbs), kcal: x.kcal - median(kcal), sodiumMg: today != null && mg.length >= USUAL_FOOD_MIN ? today - median(mg) : null };
}

function driversFor(d: LocalDate, ctx: Pick<Context, "intake" | "sodium" | "legs" | "evenings">): Drivers {
  const { intake, sodium, legs } = ctx;
  const day1 = foodDelta(intake, sodium, addDays(d, -1));
  const day2 = foodDelta(intake, sodium, addDays(d, -2));
  const evening = ctx.evenings.get(addDays(d, -1));
  const l1 = legs.get(addDays(d, -1)) ?? 0;
  const l2 = legs.get(addDays(d, -2)) ?? 0;
  const legSets = l1 >= LEG_MIN_HARD_SETS ? { daysAgo: 1 as const, sets: l1 } : l2 >= LEG_MIN_HARD_SETS ? { daysAgo: 2 as const, sets: l2 } : null;
  return {
    carbs: ((day1?.carbsG ?? 0) + CARRY_TWO_DAYS * (day2?.carbsG ?? 0)) / 100,
    kcal: ((day1?.kcal ?? 0) + CARRY_TWO_DAYS * (day2?.kcal ?? 0)) / 1000,
    legs: legSets ? 1 : 0,
    sodium: ((day1?.sodiumMg ?? 0) + CARRY_TWO_DAYS * (day2?.sodiumMg ?? 0)) / 1000,
    drink: evening?.kind === "drink" ? 1 : 0,
    day1,
    day2,
    legSets,
    alcoholG: evening?.kind === "drink" ? evening.alcoholG : 0,
  };
}

// ── Sizes ──

/** kg per 100 g carbs, per 1,000 kcal, per leg session, per g of sodium, per drinking evening. */
type Sizes = { carbs: number; kcal: number; legs: number; sodium: number; drink: number };
const PRIOR: Sizes = { carbs: CARB_WATER_KG_PER_G * 100, kcal: FOOD_MASS_KG_PER_KCAL * 1000, legs: LEG_SESSION_KG, sodium: SODIUM_WATER_KG_PER_G, drink: ALCOHOL_SCALE_KG };

/**
 * The person's own sizes: ridge regression of each morning's move on its
 * drivers (with a free intercept), shrunk towards the evidence by
 * `PRIOR_WEIGHT` pseudo-reads, clamped to [0, MAX_SIZE_KG]; a drinking
 * evening may go either way (IN9).
 */
function fitSizes(rows: ReadonlyArray<{ dev: number; x: Drivers }>): Sizes {
  const prior = [0, PRIOR.carbs, PRIOR.kcal, PRIOR.legs, PRIOR.sodium, PRIOR.drink];
  const lambda = [1e-6, PRIOR_WEIGHT, PRIOR_WEIGHT, PRIOR_WEIGHT, PRIOR_WEIGHT, PRIOR_WEIGHT];
  const n = prior.length;
  const a = prior.map((_, i) => prior.map((__, j) => (i === j ? lambda[i] : 0)));
  const b = prior.map((p, i) => lambda[i] * p);
  for (const r of rows) {
    const v = [1, r.x.carbs, r.x.kcal, r.x.legs, r.x.sodium, r.x.drink];
    for (let i = 0; i < n; i++) {
      b[i] += v[i] * r.dev;
      for (let j = 0; j < n; j++) a[i][j] += v[i] * v[j];
    }
  }
  const s = solveLinear(a, b);
  if (!s) return PRIOR;
  const clamp = (v: number) => Math.min(MAX_SIZE_KG, Math.max(0, v));
  return { carbs: clamp(s[1]), kcal: clamp(s[2]), legs: clamp(s[3]), sodium: clamp(s[4]), drink: Math.min(MAX_SIZE_KG, Math.max(-MAX_SIZE_KG, s[5])) };
}

// ── The read ──

type Context = {
  byDate: ReadonlyMap<LocalDate, number>;
  dev: Map<LocalDate, { kg: number; expected: number; dev: number }>;
  intake: Map<LocalDate, DailyIntake>;
  /** IN9: each day's sodium, mg, where known; each drinking or dry evening. */
  sodium: Map<LocalDate, number>;
  evenings: Map<LocalDate, Evening>;
  legs: Map<LocalDate, number>;
  flags: Readonly<Record<string, DayFlags>>;
};

function context(inputs: ScaleJumpInputs, from: LocalDate, to: LocalDate): Context | null {
  const byDate = weighInsByDate(inputs.weighIns);
  if (!byDate.size) return null;
  const earliest = addDays(from, -Math.max(JUMP_SPREAD_DAYS, PERSONAL_DAYS, SETTLE_MAX_DAYS));
  const dev = deviations(byDate, earliest, to);
  const foodFrom = addDays(earliest, -(USUAL_FOOD_DAYS + 2));
  const series = dailyIntakeSeries(inputs.foodEntries, inputs.dayFlags, foodFrom, to);
  return {
    byDate,
    dev,
    intake: new Map(series.map((x) => [x.date, x])),
    sodium: sodiumByDay(inputs.foodEntries, inputs.dayFlags, foodFrom, to),
    evenings: drinkingEvenings(inputs.foodEntries, inputs.dayFlags, inputs.weighIns, foodFrom, to),
    legs: legSetsByDate(inputs.workouts, inputs.tz),
    flags: inputs.dayFlags,
  };
}

function spreadBefore(ctx: Context, d: LocalDate): { spread: number; reads: number } {
  const devs: number[] = [];
  for (const [date, v] of ctx.dev) if (date < d && dayDiff(date, d) <= JUMP_SPREAD_DAYS) devs.push(v.dev);
  return { spread: devs.length ? MAD_TO_SD * mad(devs) : 0, reads: devs.length };
}

function gate(spread: number): number {
  return Math.max(JUMP_MIN_KG, JUMP_SPREAD_MULT * spread);
}

function eventsNear(flags: Readonly<Record<string, DayFlags>>, d: LocalDate): EventCause[] {
  const out: EventCause[] = [];
  for (let k = 0; k <= CREATINE_DAYS; k++) {
    const date = addDays(d, -k);
    for (const e of flags[date]?.events ?? []) {
      const reach = e.type === "creatine_start" ? CREATINE_DAYS : EVENT_DAYS;
      if (k <= reach && !out.some((x) => x.type === e.type)) out.push({ kind: "event", type: e.type, date });
    }
  }
  return out;
}

function settleFor(ctx: Context, d: LocalDate, direction: "up" | "down", spread: number): ScaleJump["settle"] {
  const g = gate(spread);
  const sign = direction === "up" ? 1 : -1;
  const isJump = (date: LocalDate) => {
    const v = ctx.dev.get(date);
    return v != null && sign * v.dev >= g;
  };
  const episodes: number[] = [];
  const dates = [...ctx.dev.keys()].filter((x) => x < d && dayDiff(x, d) <= PERSONAL_DAYS).sort();
  for (const j of dates) {
    if (!isJump(j) || isJump(addDays(j, -1))) continue;
    for (let k = 1; k <= SETTLE_MAX_DAYS; k++) {
      const later = addDays(j, k);
      if (later >= d) break;
      const v = ctx.dev.get(later);
      if (v != null && sign * v.dev <= spread) {
        episodes.push(k);
        break;
      }
    }
  }
  const last = episodes.slice(-SETTLE_LAST);
  return last.length >= SETTLE_MIN_JUMPS ? { jumps: last.length, minDays: Math.min(...last), maxDays: Math.max(...last) } : null;
}

function foodLogOf(x: DailyIntake | undefined): ScaleJump["foodLog"] {
  if (!x) return "unlogged";
  return countsAsLogged(x.status) ? "logged" : x.status === "partial" ? "partial" : "unlogged";
}

/** The last weigh-in within `JUMP_PREVIOUS_DAYS` before `d`. */
function previousWeighIn(byDate: ReadonlyMap<LocalDate, number>, d: LocalDate): { date: LocalDate; kg: number } | null {
  for (let k = 1; k <= JUMP_PREVIOUS_DAYS; k++) {
    const date = addDays(d, -k);
    const kg = byDate.get(date);
    if (kg != null) return { date, kg };
  }
  return null;
}

function read(ctx: Context, d: LocalDate): ScaleJump | null {
  const today = ctx.dev.get(d);
  if (!today) return null;
  const prev = previousWeighIn(ctx.byDate, d);
  if (!prev) return null;
  const change = today.kg - prev.kg;
  if (Math.sign(change) !== Math.sign(today.dev) || Math.abs(change) < JUMP_MIN_KG) return null;
  const { spread, reads } = spreadBefore(ctx, d);
  if (reads < JUMP_MIN_READS) return null;
  if (Math.abs(today.dev) < gate(spread)) return null;
  const direction = today.dev > 0 ? "up" : "down";
  const sign = direction === "up" ? 1 : -1;

  // Sizes: the person's own once there are enough logged mornings behind this one.
  const rows: Array<{ dev: number; x: Drivers }> = [];
  for (const [date, v] of ctx.dev) {
    if (date >= d || dayDiff(date, d) > PERSONAL_DAYS) continue;
    const x = driversFor(date, ctx);
    if (x.day1) rows.push({ dev: v.dev, x });
  }
  const personal = rows.length >= PERSONAL_MIN_READS;
  const size = personal ? fitSizes(rows) : PRIOR;

  const x = driversFor(d, ctx);
  const causes: Array<FoodCause | DrinksCause | LegsCause> = [];
  const food = size.carbs * x.carbs + size.kcal * x.kcal + size.sodium * x.sodium;
  if (sign * food >= CAUSE_MIN_KG) {
    const share = (dd: Delta | null, w: number) => (dd ? w * (size.carbs * (dd.carbsG / 100) + size.kcal * (dd.kcal / 1000) + size.sodium * ((dd.sodiumMg ?? 0) / 1000)) : 0);
    const two = x.day2 && sign * share(x.day2, CARRY_TWO_DAYS) > sign * share(x.day1, 1);
    const pick = (two ? x.day2 : x.day1)!;
    causes.push({ kind: "food", daysAgo: two ? 2 : 1, carbsDeltaG: Math.round(pick.carbsG), kcalDelta: Math.round(pick.kcal), sodiumDeltaMg: pick.sodiumMg == null ? null : Math.round(pick.sodiumMg), shareKg: Math.abs(food) });
  }
  if (x.drink && sign * size.drink >= CAUSE_MIN_KG) causes.push({ kind: "drinks", alcoholG: Math.round(x.alcoholG), shareKg: Math.abs(size.drink) });
  if (direction === "up" && x.legSets && size.legs >= CAUSE_MIN_KG) causes.push({ kind: "legs", daysAgo: x.legSets.daysAgo, hardSets: x.legSets.sets, shareKg: size.legs });
  causes.sort((a, b) => b.shareKg - a.shareKg);
  const events = direction === "up" ? eventsNear(ctx.flags, d) : [];
  if (!causes.length && !events.length && Math.abs(today.dev) < Math.max(JUMP_MIN_KG, JUMP_QUIET_MULT * spread)) return null;

  return {
    date: d,
    scaleKg: today.kg,
    expectedKg: today.expected,
    deltaKg: today.dev,
    changeKg: change,
    previousDate: prev.date,
    direction,
    spreadKg: spread,
    causes: [...causes, ...events],
    foodLog: foodLogOf(ctx.intake.get(addDays(d, -1))),
    settle: settleFor(ctx, d, direction, spread),
    personal,
  };
}

/** The read for one morning, or null when it isn't a jump or there is too little behind it. */
export function scaleJump(inputs: ScaleJumpInputs, date: LocalDate): ScaleJump | null {
  const ctx = context(inputs, date, date);
  return ctx ? read(ctx, date) : null;
}

/** Every jump in [from, to], by date (the weigh-in list). */
export function scaleJumps(inputs: ScaleJumpInputs, from: LocalDate, to: LocalDate): Map<LocalDate, ScaleJump> {
  const out = new Map<LocalDate, ScaleJump>();
  const ctx = context(inputs, from, to);
  if (!ctx) return out;
  for (let d = from; d <= to; d = addDays(d, 1)) {
    const j = read(ctx, d);
    if (j) out.set(d, j);
  }
  return out;
}

/**
 * The same inputs with `date`'s manual weigh-in replaced by one at `kg`:
 * the read for a number still being typed (the weigh-in sheet). A scale's
 * reading that day stays, so the preview picks the day's weight as saving
 * would (the earliest reading by time).
 */
export function withWeighIn(inputs: ScaleJumpInputs, date: LocalDate, kg: number): ScaleJumpInputs {
  const typed: WeighIn = { id: "typed", date, loggedAt: `${date}T23:59:59.000Z`, source: "manual", schemaVersion: 1, kg };
  return { ...inputs, weighIns: [...inputs.weighIns.filter((w) => !(w.date === date && w.source === "manual")), typed] };
}
