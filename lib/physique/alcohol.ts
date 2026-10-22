/**
 * Alcohol against the night and the mornings after (IN9, 08-insights.md):
 * "What hurts my sleep and recovery?" answered from the person's own log
 * and watch. Pure.
 *
 * An evening is a drinking one at 0.25 g of alcohol per kg of body weight
 * or more, dry when the day's food is logged in full with none
 * (`dayExtras.ts`). Each is set against what followed:
 * - the next day's resting heart rate and HRV, and that night's sleep,
 *   each against the person's usual (the median of the 28 nights before,
 *   leaving out nights after drinking), so a fitter month or a bad week
 *   doesn't read as drink;
 * - the scale the morning after, and two mornings after (with no drinking
 *   in between), against the line IN2 reads every morning against.
 *
 * The effect on the night is big (research L §3: +4 to +9 bpm, −6 to
 * −13 ms), so the read starts at 5 drinking nights and 5 dry ones, as
 * WHOOP and Bevel do. With so few, the test is Welch's t on the t
 * distribution, with the drinking nights' spread taken as at least the dry
 * nights' (five nights that happen to sit close together can't pass on
 * that alone), one-sided in the direction set here before any data (resting
 * HR up, HRV and sleep down; the scale either way, as no study says which).
 * A link also needs false-discovery control across what was read (Benjamini–
 * Hochberg, q 0.05: with nothing real, about one person in 20 sees a false
 * one) and a difference a person would notice. Drinking tends to fall on
 * the same days of the week, and those nights can differ anyway (a late
 * Friday), so when there are enough dry evenings on the same weekdays the
 * comparison is made within each weekday (a Friday's drinks against dry
 * Fridays); when there aren't, it is made against all dry evenings and a
 * link says the day of the week may be part of it. A link must also have
 * held a week earlier, as Connections' do. The size shown is shrunk by
 * (1 − 1/t²), as Connections does.
 *
 * Words say "after", never "because"; drinking is never judged (02 §10
 * rule 15). The lifts the day after are read in Connections, where the
 * studies line says strength often holds.
 */

import { addDays, weekday, type LocalDate, type Now } from "@/lib/dates";
import { mad, mean, median, stdev, tCdf } from "@/lib/stats";
import { nightsByDate } from "@/lib/physique/sleep";
import { MAD_TO_SD, scaleDeviations } from "@/lib/physique/scaleJump";
import { bodyKgAt, drinkingEvenings, drinkThresholdG, type Evening } from "@/lib/physique/dayExtras";
import type { DailyVitals, DayFlags, FoodEntry, SleepNight, WeighIn } from "@/lib/physique/types";

// ── Thresholds (tags as in 02-engine-spec) ──

/** Days read, to today. OURS: six months, so someone who drinks once a fortnight reaches 5 nights within a season; the night's response to drink doesn't drift the way fitness does. */
export const ALC_WINDOW_DAYS = 180;
/** Drinking nights and dry nights each before a read. EVID: the effect is about 2 to 4 times the night-to-night spread of resting HR (Pietilä 2018; research L §3); WHOOP and Bevel ask for 5 yes and 5 no. */
export const ALC_MIN_EACH = 5;
/** Nights the usual is the median of, and the fewest. OURS: four weeks, as Connections' HRV usual. */
export const ALC_USUAL_DAYS = 28;
export const ALC_USUAL_MIN = 10;
/** False-discovery rate across the outcomes read. OURS (research L §4, stricter than Connections' 0.10): with nothing real, the chance of any false link is about this. */
export const ALC_Q = 0.05;
/** Smallest difference reported in resting HR, bpm. EVID: night-to-night resting HR moves 2 to 3 bpm (recovery.ts); Pietilä's lowest band, +1.4 bpm, is under it. */
export const ALC_MIN_RHR_BPM = 2;
/** ...in HRV, % of the person's usual. OURS: night-to-night HRV moves 15 to 25%; under 5% no one would see it. */
export const ALC_MIN_HRV_PCT = 5;
/** ...in sleep, minutes. OURS: under a quarter of an hour is inside a night's normal spread; Oura members slept about 35 minutes less after drinking (research L §3). */
export const ALC_MIN_SLEEP_MIN = 15;
/** ...on the scale, kg. OURS: IN2's smallest share of a jump it names a cause for. */
export const ALC_MIN_SCALE_KG = 0.3;
/** Dry readings from evenings on one weekday before drinking readings from that weekday are set against them. OURS: two, so one odd dry Friday isn't the whole comparison. */
export const ALC_SAME_DAY_MIN_DRY = 2;
/** Days before today the same link must also hold. OURS (research L §4 hysteresis, as Connections' CONN_HOLD_DAYS): a link from one lucky week doesn't show. */
export const ALC_HOLD_DAYS = 7;
/** A reading further than this many SDs (the dry nights' robust spread) from its group's middle is pulled in to it. OURS: one feverish night can't make or break a five-night read. */
export const ALC_WINSOR_SD = 3;

// ── Types ──

export type AlcoholOutcome = "rhr" | "hrv" | "sleep" | "scale1" | "scale2";

/** The order outcomes are read and listed in. */
export const ALCOHOL_OUTCOMES: readonly AlcoholOutcome[] = ["rhr", "hrv", "sleep", "scale1", "scale2"];

export type AlcoholLink = {
  id: AlcoholOutcome;
  /** "building": under ALC_MIN_EACH either way, or past it with a link not yet held a week; "none": enough, no clear difference; "linked": a clear one. */
  state: "linked" | "none" | "building";
  /** Readings after drinking evenings, and after dry ones. */
  drink: number;
  dry: number;
  /** After drinking less after none, shrunk, in the outcome's unit: bpm, ms, minutes, kg. Null while building. */
  diff: number | null;
  /** The person's usual after dry evenings (bpm, ms, minutes); null for the scale, read against its own line. */
  usual: number | null;
  /** Welch's t and the Benjamini–Hochberg q, for the record; null while building. */
  t: number | null;
  q: number | null;
  /** For a link: "held" when it was read against dry evenings on the same weekdays, "unchecked" when there were too few of those and it was read against all dry evenings, so the day of the week can't be told apart from it. */
  sameDays: "held" | "unchecked" | null;
  /** The dates of the readings in each group (the next day, or the morning read), for marking them on a chart. */
  days: { drink: LocalDate[]; dry: LocalDate[] };
};

export type AlcoholRead = {
  from: LocalDate;
  through: LocalDate;
  /** Grams of alcohol that made an evening a drinking one, at the person's weight. */
  thresholdG: number;
  /** Drinking and dry evenings in the window, and the mean grams on the drinking ones. */
  drinkEvenings: number;
  dryEvenings: number;
  meanDrinkG: number | null;
  /** Share of the drinking evenings that were Fridays or Saturdays; null without any. */
  weekendShare: number | null;
  /** Outcomes with any reading, in ALCOHOL_OUTCOMES order. */
  items: AlcoholLink[];
};

export type AlcoholInputs = {
  foodEntries: readonly FoodEntry[];
  dayFlags: Readonly<Record<string, DayFlags>>;
  sleepNights: readonly SleepNight[];
  /** IN1's day vitals: HRV and resting HR on days the night doesn't carry them. */
  vitals?: readonly DailyVitals[];
  weighIns: readonly WeighIn[];
};

// ── Outcomes ──

type Spec = {
  /** Expected sign of after-drinking less after-none: +1 higher, −1 lower, 0 either. */
  dir: 1 | -1 | 0;
  /** Days from the evening to the reading. */
  lag: 1 | 2;
  /** A difference on the analysed scale as a size in the unit its floor is in, and that floor. */
  size: (diff: number) => number;
  floor: number;
};

const SPEC: Record<AlcoholOutcome, Spec> = {
  rhr: { dir: 1, lag: 1, size: Math.abs, floor: ALC_MIN_RHR_BPM },
  // On the log scale: a difference of d is a change of (e^d − 1) of the usual.
  hrv: { dir: -1, lag: 1, size: (d) => Math.abs(Math.exp(d) - 1) * 100, floor: ALC_MIN_HRV_PCT },
  sleep: { dir: -1, lag: 1, size: Math.abs, floor: ALC_MIN_SLEEP_MIN },
  scale1: { dir: 0, lag: 1, size: Math.abs, floor: ALC_MIN_SCALE_KG },
  scale2: { dir: 0, lag: 2, size: Math.abs, floor: ALC_MIN_SCALE_KG },
};

/** Each night outcome by wake date, on its analysed scale: bpm, ln ms, minutes asleep. */
function nightSeries(i: AlcoholInputs): Record<"rhr" | "hrv" | "sleep", Map<LocalDate, number>> {
  const out = { rhr: new Map<LocalDate, number>(), hrv: new Map<LocalDate, number>(), sleep: new Map<LocalDate, number>() };
  for (const [date, n] of nightsByDate(i.sleepNights)) {
    const { restingHr, hrvMs, asleepMin } = n.night;
    if (typeof restingHr === "number" && restingHr > 0) out.rhr.set(date, restingHr);
    if (typeof hrvMs === "number" && hrvMs > 0) out.hrv.set(date, Math.log(hrvMs));
    if (n.valid && asleepMin > 0) out.sleep.set(date, asleepMin);
  }
  // IN1: vitals kept on days the night doesn't carry them.
  for (const v of i.vitals ?? []) {
    if (!out.rhr.has(v.date) && typeof v.restingHr === "number" && v.restingHr > 0) out.rhr.set(v.date, v.restingHr);
    if (!out.hrv.has(v.date) && typeof v.hrvMs === "number" && v.hrvMs > 0) out.hrv.set(v.date, Math.log(v.hrvMs));
  }
  return out;
}

/** Each reading against the person's usual: the median of the ALC_USUAL_DAYS before it, leaving out the days after drinking; null below ALC_USUAL_MIN. */
function againstUsual(series: ReadonlyMap<LocalDate, number>, afterDrink: ReadonlySet<LocalDate>): Map<LocalDate, number> {
  const out = new Map<LocalDate, number>();
  for (const [date, v] of series) {
    const xs: number[] = [];
    for (let k = 1; k <= ALC_USUAL_DAYS; k++) {
      const d = addDays(date, -k);
      const x = series.get(d);
      if (x != null && !afterDrink.has(d)) xs.push(x);
    }
    if (xs.length >= ALC_USUAL_MIN) out.set(date, v - median(xs));
  }
  return out;
}

const variance = (xs: readonly number[]) => stdev(xs) ** 2;

/** Welch's t of `a` against `b`, with `a`'s variance at least `b`'s. */
function welch(a: readonly number[], b: readonly number[]): { diff: number; t: number; df: number } {
  const diff = mean(a) - mean(b);
  const vb = variance(b);
  const va = Math.max(variance(a), vb);
  const sa = va / a.length;
  const sb = vb / b.length;
  const se = Math.sqrt(sa + sb);
  if (!(se > 0)) return { diff, t: 0, df: 1 };
  const df = (sa + sb) ** 2 / (sa ** 2 / (a.length - 1) + sb ** 2 / (b.length - 1));
  return { diff, t: diff / se, df };
}

function pValue(t: number, df: number, dir: 1 | -1 | 0): number {
  if (dir === 0) return 2 * (1 - tCdf(Math.abs(t), df));
  return Math.sign(t) === dir ? 1 - tCdf(Math.abs(t), df) : 1;
}

const shrinkOf = (t: number) => (Math.abs(t) > 1 ? 1 - 1 / (t * t) : 0);

// ── The read ──

type Groups = { drink: Array<{ date: LocalDate; v: number }>; dry: Array<{ date: LocalDate; v: number }> };

/** The readings `lag` days after drinking and dry evenings. Two days on, the evening between must not be a drinking one (or, for the dry group, must be dry too). */
function groupsFor(devs: ReadonlyMap<LocalDate, number>, evenings: ReadonlyMap<LocalDate, Evening>, from: LocalDate, through: LocalDate, lag: 1 | 2): Groups {
  const g: Groups = { drink: [], dry: [] };
  for (const [e, ev] of evenings) {
    if (e < from || e >= through) continue;
    const date = addDays(e, lag);
    const v = devs.get(date);
    if (v == null || date > through) continue;
    if (lag === 2) {
      const mid = evenings.get(addDays(e, 1))?.kind;
      if (ev.kind === "drink" ? mid === "drink" : mid !== "dry") continue;
    }
    g[ev.kind].push({ date, v });
  }
  return g;
}

/**
 * Readings far from their own group's middle pulled in to ALC_WINSOR_SD of
 * the dry nights' robust SD: one odd night is tamed, a group that sits high
 * as a whole is not.
 */
function pullIn(g: Groups): { a: number[]; b: number[] } {
  const a = g.drink.map((x) => x.v);
  const b = g.dry.map((x) => x.v);
  const sd = MAD_TO_SD * mad(b);
  const clip = (xs: number[]) => {
    const mid = median(xs);
    return sd > 0 ? xs.map((v) => Math.min(mid + ALC_WINSOR_SD * sd, Math.max(mid - ALC_WINSOR_SD * sd, v))) : xs;
  };
  return { a: clip(a), b: clip(b) };
}

/**
 * Drinking against dry within each weekday of the evening (those with
 * ALC_SAME_DAY_MIN_DRY dry readings or more), weighted by the drinking
 * readings in each, with the variances of the whole comparison; null when
 * fewer than ALC_MIN_EACH drinking readings have such a match.
 */
function sameWeekday(g: Groups, a: readonly number[], b: readonly number[], lag: number): { diff: number; t: number } | null {
  const vb = variance(b);
  const va = Math.max(variance(a), vb);
  const days = new Map<number, { a: number[]; b: number[] }>();
  const at = (date: LocalDate) => {
    const w = weekday(addDays(date, -lag));
    const d = days.get(w) ?? { a: [], b: [] };
    days.set(w, d);
    return d;
  };
  g.drink.forEach((x, k) => at(x.date).a.push(a[k]));
  g.dry.forEach((x, k) => at(x.date).b.push(b[k]));
  let n = 0;
  let sum = 0;
  let v = 0;
  for (const d of days.values()) {
    if (!d.a.length || d.b.length < ALC_SAME_DAY_MIN_DRY) continue;
    n += d.a.length;
    sum += d.a.length * (mean(d.a) - mean(d.b));
    v += d.a.length ** 2 * (va / d.a.length + vb / d.b.length);
  }
  if (n < ALC_MIN_EACH) return null;
  const diff = sum / n;
  const se = Math.sqrt(v) / n;
  return { diff, t: se > 0 ? diff / se : 0 };
}

/** The read as of `now`, before the week-earlier hold. */
function readAt(i: AlcoholInputs, now: Now): AlcoholRead {
  const through = now.today;
  const from = addDays(through, -(ALC_WINDOW_DAYS - 1));
  const threshold = drinkThresholdG(bodyKgAt(i.weighIns, through));
  const lead = ALC_USUAL_DAYS + 2;
  const evenings = drinkingEvenings(i.foodEntries, i.dayFlags, i.weighIns, addDays(from, -lead), through, threshold);
  const afterDrink = new Set([...evenings].filter(([, e]) => e.kind === "drink").map(([d]) => addDays(d, 1)));
  const nights = nightSeries(i);
  const scale = i.weighIns.length ? scaleDeviations(i.weighIns, addDays(from, 1), through) : new Map<LocalDate, number>();
  const devs: Record<AlcoholOutcome, Map<LocalDate, number>> = {
    rhr: againstUsual(nights.rhr, afterDrink),
    hrv: againstUsual(nights.hrv, afterDrink),
    sleep: againstUsual(nights.sleep, afterDrink),
    scale1: scale,
    scale2: scale,
  };

  type Read = { id: AlcoholOutcome; diff: number; t: number; p: number; sameDays: "held" | "unchecked" };
  const reads: Read[] = [];
  const items: AlcoholLink[] = [];
  for (const id of ALCOHOL_OUTCOMES) {
    const spec = SPEC[id];
    const g = groupsFor(devs[id], evenings, from, through, spec.lag);
    if (!g.drink.length && !g.dry.length) continue;
    const raw = id === "rhr" || id === "hrv" || id === "sleep" ? nights[id] : null;
    const usualRaw = raw ? median(g.dry.map((x) => raw.get(x.date)).filter((v): v is number => v != null)) : NaN;
    const usual = raw && Number.isFinite(usualRaw) ? (id === "hrv" ? Math.exp(usualRaw) : usualRaw) : null;
    const item: AlcoholLink = { id, state: "building", drink: g.drink.length, dry: g.dry.length, diff: null, usual, t: null, q: null, sameDays: null, days: { drink: g.drink.map((x) => x.date), dry: g.dry.map((x) => x.date) } };
    items.push(item);
    if (g.drink.length < ALC_MIN_EACH || g.dry.length < ALC_MIN_EACH) continue;
    const { a, b } = pullIn(g);
    // Within weekdays when there are the dry evenings for it; else against all of them.
    const w = welch(a, b);
    const m = sameWeekday(g, a, b, spec.lag);
    const x = m ?? w;
    reads.push({ id, diff: x.diff, t: x.t, p: pValue(x.t, w.df, spec.dir), sameDays: m ? "held" : "unchecked" });
  }

  // Benjamini–Hochberg across the outcomes read.
  const order = [...reads].sort((x, y) => x.p - y.p);
  const q = new Map<AlcoholOutcome, number>();
  let running = 1;
  for (let k = order.length - 1; k >= 0; k--) {
    running = Math.min(running, (order[k].p * order.length) / (k + 1));
    q.set(order[k].id, running);
  }
  for (const r of reads) {
    const item = items.find((x) => x.id === r.id)!;
    const spec = SPEC[r.id];
    const qr = q.get(r.id) ?? 1;
    const linked = qr <= ALC_Q && spec.size(r.diff) >= spec.floor && (spec.dir === 0 || Math.sign(r.diff) === spec.dir);
    const shrunk = r.diff * shrinkOf(r.t);
    item.state = linked ? "linked" : "none";
    item.sameDays = linked ? r.sameDays : null;
    // HRV in ms at the person's usual; the rest in their own unit.
    item.diff = r.id === "hrv" && item.usual != null ? item.usual * (Math.exp(shrunk) - 1) : shrunk;
    item.t = Math.round(r.t * 100) / 100;
    item.q = Math.round(qr * 1000) / 1000;
  }

  const inWindow = [...evenings].filter(([d]) => d >= from && d < through);
  const drinkDates = inWindow.filter(([, e]) => e.kind === "drink");
  const drinks = drinkDates.map(([, e]) => e.alcoholG);
  return {
    from,
    through,
    thresholdG: Math.round(threshold),
    drinkEvenings: drinks.length,
    dryEvenings: inWindow.length - drinks.length,
    meanDrinkG: drinks.length ? mean(drinks) : null,
    weekendShare: drinkDates.length ? drinkDates.filter(([d]) => weekday(d) === 5 || weekday(d) === 6).length / drinkDates.length : null,
    items,
  };
}

/**
 * Drinking evenings against what followed, over the ALC_WINDOW_DAYS to
 * `now.today`. Outcomes with no reading at all are left out; below
 * ALC_MIN_EACH either way an outcome is "building". A link must also have
 * been one ALC_HOLD_DAYS earlier, the same way.
 */
export function alcoholLinks(i: AlcoholInputs, now: Now): AlcoholRead {
  const cur = readAt(i, now);
  const prev = readAt(i, { today: addDays(now.today, -ALC_HOLD_DAYS), tz: now.tz });
  for (const x of cur.items) {
    if (x.state !== "linked") continue;
    const p = prev.items.find((y) => y.id === x.id);
    if (p?.state === "linked" && Math.sign(p.diff ?? 0) === Math.sign(x.diff ?? 0)) continue;
    // Just past the count a week ago: still settling, not "no link".
    x.state = !p || p.state === "building" ? "building" : "none";
    x.sameDays = null;
  }
  return cur;
}
