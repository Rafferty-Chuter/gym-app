/**
 * Does the alcohol read find what is there, and only that? (IN9, 2026-10-22.)
 * Made-up people with known effects of drinking, and controls with none, run
 * through the real engines:
 * - `alcoholLinks` (lib/physique/alcohol.ts): resting HR, HRV and sleep the
 *   night after, the scale one and two mornings after;
 * - Connections' "drinks the evening before" (lib/physique/connections.ts);
 * - the scale-jump read's salt driver (lib/physique/scaleJump.ts).
 * IN9b adds people who log their drinks in Apple Health (a count, 14 g a
 * drink) instead of as food, and one who logs the same evenings both ways.
 *
 *   npx tsx scripts/study-alcohol.ts [seeds=30] [out=docs/plan/research/N-alcohol-salt-study.json]
 *
 * Pure engine code only: no storage, no network.
 */

import { writeFileSync } from "node:fs";
import { addDays, type LocalDate } from "@/lib/dates";
import { ALCOHOL_OUTCOMES, alcoholLinks, type AlcoholOutcome } from "@/lib/physique/alcohol";
import { connections } from "@/lib/physique/connections";
import { scaleJumps } from "@/lib/physique/scaleJump";
import type { DailyVitals, FoodEntry, SleepNight, WeighIn } from "@/lib/physique/types";
import type { StoredWorkout } from "@/lib/trainingAnalysis";

const SEEDS = Number(process.argv[2] ?? 30);
const OUT = process.argv[3] ?? "docs/plan/research/N-alcohol-salt-study.json";
const TODAY: LocalDate = "2026-10-21";

function rng(seed: number) {
  let s = seed >>> 0;
  return () => {
    s = (s * 1664525 + 1013904223) >>> 0;
    return s / 2 ** 32;
  };
}

const stamp = (date: LocalDate, id: string) => ({ id, date, loggedAt: `${date}T20:00:00.000Z`, source: "manual" as const, schemaVersion: 1 as const });
const dow = (d: LocalDate) => new Date(`${d}T12:00:00Z`).getUTCDay();

// ── Nights and the scale ──

type Truth = { rhr: number; hrvPct: number; sleepMin: number; scaleKg: [number, number] };
type Pattern = {
  /** Share of evenings with drinks, at random; or Friday and Saturday evenings with this probability. */
  share?: number;
  weekend?: number;
  /** Grams on a drinking evening. */
  grams: number;
  /** Friday and Saturday nights differ this much, drink or not (late nights out): minutes asleep, bpm. */
  weekendSleepMin?: number;
  weekendRhr?: number;
  /** IN9b: where the drinks are logged: as food (default), as this many drinks in Apple Health, or both on the same evenings. */
  log?: "food" | "health" | "both";
  healthDrinks?: number;
};

/**
 * Food logged every day; nights with resting HR around 56 bpm (2.5 bpm
 * spread, carried 0.4 into the next night), HRV around 55 ms (20% spread),
 * about 7 hours asleep (40 min spread); a weigh-in each morning with IN2's
 * scale noise (0.3 kg, carried 0.4) on a slow cut.
 */
function person(seed: number, weeks: number, truth: Truth, pat: Pattern) {
  const r = rng(seed);
  const gauss = () => Math.sqrt(-2 * Math.log(1 - r())) * Math.cos(2 * Math.PI * r());
  const days = weeks * 7 + 35;
  const start = addDays(TODAY, -(days - 1));
  const foodEntries: FoodEntry[] = [];
  const sleepNights: SleepNight[] = [];
  const weighIns: WeighIn[] = [];
  const vitals: DailyVitals[] = [];
  let rhrN = 0;
  let kgN = 0;
  let prev = false;
  let prev2 = false;
  let prevWeekend = false;
  for (let k = 0; k < days; k++) {
    const date = addDays(start, k);
    rhrN = 0.4 * rhrN + 2.3 * gauss();
    const rhr = 56 + rhrN + (prev ? truth.rhr : 0) + (prevWeekend ? (pat.weekendRhr ?? 0) : 0);
    const hrv = 55 * Math.exp(0.2 * gauss()) * (prev ? 1 + truth.hrvPct / 100 : 1);
    const asleep = 420 + 40 * gauss() + (prev ? truth.sleepMin : 0) + (prevWeekend ? (pat.weekendSleepMin ?? 0) : 0);
    if (k > 0) sleepNights.push({ ...stamp(date, `n${k}`), source: "healthkit", bedtime: "23:00", wakeTime: "07:00", asleepMin: Math.round(asleep), restingHr: Math.round(rhr), hrvMs: Math.round(hrv) });
    kgN = 0.4 * kgN + 0.3 * gauss();
    const kg = 85 - 0.05 * k + kgN + (prev ? truth.scaleKg[0] : 0) + (prev2 && !prev ? truth.scaleKg[1] : 0);
    weighIns.push({ ...stamp(date, `w${k}`), loggedAt: `${date}T07:00:00.000Z`, kg: Math.round(kg * 100) / 100 });
    foodEntries.push({ ...stamp(date, `f${k}`), label: "Day", kcal: 2300, proteinG: 160, carbsG: 250, fatG: 70, method: "quick", time: "13:00" });
    const wk = dow(date) === 5 || dow(date) === 6;
    const drink = pat.weekend != null ? wk && r() < pat.weekend : r() < (pat.share ?? 0);
    const log = pat.log ?? "food";
    if (drink && log !== "health") foodEntries.push({ ...stamp(date, `d${k}`), label: "Lager, standard", kcal: Math.round(7.6 * pat.grams), proteinG: 2, carbsG: Math.round(0.55 * pat.grams), fatG: 0, method: "search", time: "21:00", alcoholG: pat.grams });
    if (drink && log !== "food") vitals.push({ ...stamp(date, `hk-v-${date}`), source: "healthkit", alcoholDrinks: pat.healthDrinks ?? 4 });
    prev2 = prev;
    prev = drink;
    prevWeekend = wk;
  }
  return { foodEntries, dayFlags: {}, sleepNights, weighIns, vitals };
}

const NONE: Truth = { rhr: 0, hrvPct: 0, sleepMin: 0, scaleKg: [0, 0] };
const NIGHT_PERSONAS: Array<{ name: string; truth: Truth; pat: Pattern }> = [
  { name: "Heavy evenings (54 g, about 3 pints), 1.4 a week: resting HR +8.7 bpm, HRV −20%, sleep −35 min", truth: { rhr: 8.7, hrvPct: -20, sleepMin: -35, scaleKg: [0, 0] }, pat: { share: 0.2, grams: 54 } },
  { name: "Moderate evenings (36 g, about 2 pints), 1.4 a week: resting HR +4 bpm, HRV −10%, sleep −15 min", truth: { rhr: 4, hrvPct: -10, sleepMin: -15, scaleKg: [0, 0] }, pat: { share: 0.2, grams: 36 } },
  { name: "Heavy evenings, once a fortnight: resting HR +8.7 bpm, HRV −20%, sleep −35 min", truth: { rhr: 8.7, hrvPct: -20, sleepMin: -35, scaleKg: [0, 0] }, pat: { share: 0.07, grams: 54 } },
  { name: "Scale +0.8 kg the morning after, +0.4 kg two mornings after; nights unchanged", truth: { ...NONE, scaleKg: [0.8, 0.4] }, pat: { share: 0.2, grams: 54 } },
  { name: "Control: drinks 1.4 evenings a week, nothing changes", truth: NONE, pat: { share: 0.2, grams: 54 } },
  { name: "Weekend control: drinks on Friday and Saturday, no effect of drink, but those nights are 40 min shorter and 2.5 bpm higher anyway", truth: NONE, pat: { weekend: 0.7, grams: 54, weekendSleepMin: -40, weekendRhr: 2.5 } },
  // IN9b: the same people logging their drinks in Apple Health instead (a count, read as 14 g a drink).
  { name: "IN9b · Heavy evenings logged in Apple Health only (4 drinks, read as 56 g), 1.4 a week: resting HR +8.7 bpm, HRV −20%, sleep −35 min", truth: { rhr: 8.7, hrvPct: -20, sleepMin: -35, scaleKg: [0, 0] }, pat: { share: 0.2, grams: 54, log: "health", healthDrinks: 4 } },
  { name: "IN9b · Moderate evenings logged in Apple Health only (2 drinks, read as 28 g), 1.4 a week: resting HR +4 bpm, HRV −10%, sleep −15 min", truth: { rhr: 4, hrvPct: -10, sleepMin: -15, scaleKg: [0, 0] }, pat: { share: 0.2, grams: 36, log: "health", healthDrinks: 2 } },
  { name: "IN9b · Heavy evenings logged both as food and in Apple Health (counted once): resting HR +8.7 bpm, HRV −20%, sleep −35 min", truth: { rhr: 8.7, hrvPct: -20, sleepMin: -35, scaleKg: [0, 0] }, pat: { share: 0.2, grams: 54, log: "both", healthDrinks: 4 } },
  { name: "IN9b · Control: drinks in Apple Health 1.4 evenings a week, nothing changes", truth: NONE, pat: { share: 0.2, grams: 54, log: "health", healthDrinks: 4 } },
];
const NIGHT_WEEKS = [6, 12, 26];

const rows: Array<Record<string, unknown>> = [];
const pct = (n: number) => `${n}/${SEEDS}`;

for (const p of NIGHT_PERSONAS) {
  for (const weeks of NIGHT_WEEKS) {
    const found: Record<AlcoholOutcome, number> = { rhr: 0, hrv: 0, sleep: 0, scale1: 0, scale2: 0 };
    const sizes: Record<AlcoholOutcome, number[]> = { rhr: [], hrv: [], sleep: [], scale1: [], scale2: [] };
    let read = 0;
    let runsWithFalse = 0;
    let falseWithNote = 0;
    const falseBy: Record<AlcoholOutcome, number> = { rhr: 0, hrv: 0, sleep: 0, scale1: 0, scale2: 0 };
    const drinkNights: number[] = [];
    for (let s = 1; s <= SEEDS; s++) {
      const res = alcoholLinks(person(7000 * weeks + s, weeks, p.truth, p.pat), { today: TODAY, tz: "UTC" });
      drinkNights.push(res.items.find((x) => x.id === "rhr")?.drink ?? 0);
      if (res.items.some((x) => x.state !== "building")) read++;
      let wrong = false;
      for (const x of res.items) {
        if (x.state !== "linked") continue;
        const real = (x.id === "rhr" && p.truth.rhr) || (x.id === "hrv" && p.truth.hrvPct) || (x.id === "sleep" && p.truth.sleepMin) || (x.id === "scale1" && p.truth.scaleKg[0]) || (x.id === "scale2" && p.truth.scaleKg[1]);
        if (real) {
          found[x.id]++;
          sizes[x.id].push(x.diff ?? 0);
        } else {
          wrong = true;
          falseBy[x.id]++;
        }
      }
      if (wrong) runsWithFalse++;
      // A false link the card shows with "the weekend may be part of it".
      if (wrong && res.items.some((x) => x.state === "linked" && x.sameDays === "unchecked")) falseWithNote++;
    }
    const avg = (xs: number[]) => (xs.length ? Math.round((xs.reduce((a, b) => a + b, 0) / xs.length) * 10) / 10 : null);
    const row = {
      study: "nights and scale",
      persona: p.name,
      weeks,
      medianDrinkingNights: [...drinkNights].sort((a, b) => a - b)[Math.floor(SEEDS / 2)],
      read: pct(read),
      found: Object.fromEntries(ALCOHOL_OUTCOMES.map((id) => [id, pct(found[id])])),
      meanShown: Object.fromEntries(ALCOHOL_OUTCOMES.map((id) => [id, avg(sizes[id])])),
      runsWithAFalseLink: pct(runsWithFalse),
      falseLinksBy: Object.fromEntries(ALCOHOL_OUTCOMES.filter((id) => falseBy[id]).map((id) => [id, falseBy[id]])),
      falseRunsWithWeekdayNote: falseWithNote,
    };
    rows.push(row);
    console.log(JSON.stringify(row));
  }
}

// ── The next session (Connections) ──

/** Squat and bench three times a week with 2.5% session noise; food that varies day to day (carbs 120 to 380 g, as research M); drinks (54 g) on a third of evenings; `effectPct` weaker the day after. */
function lifter(seed: number, weeks: number, effectPct: number) {
  const r = rng(seed);
  const gauss = () => Math.sqrt(-2 * Math.log(1 - r())) * Math.cos(2 * Math.PI * r());
  const days = weeks * 7;
  const start = addDays(TODAY, -(days - 1));
  const workouts: StoredWorkout[] = [];
  const foodEntries: FoodEntry[] = [];
  const drank = new Set<LocalDate>();
  for (let d = -2; d < days; d++) {
    const date = addDays(start, d);
    foodEntries.push({ ...stamp(date, `f${d}`), label: "Day", kcal: Math.round(2300 + r() * 600), proteinG: Math.round(140 + r() * 60), carbsG: Math.round(120 + r() * 260), fatG: 80, method: "quick", time: "13:00" });
    if (r() < 0.33) {
      drank.add(date);
      foodEntries.push({ ...stamp(date, `d${d}`), label: "Lager, standard", kcal: 409, proteinG: 3, carbsG: 30, fatG: 0, method: "search", time: "21:00", alcoholG: 54 });
    }
  }
  for (let d = 0; d < days; d++) {
    const date = addDays(start, d);
    if (![1, 3, 5].includes(dow(date))) continue;
    const f = drank.has(addDays(date, -1)) ? 1 - effectPct / 100 : 1;
    const top = (base: number) => String(Math.round(((base * (1 + 0.0004 * d) * (1 + 0.025 * gauss()) * f) / (1 + 5 / 30)) * 2) / 2);
    workouts.push({ completedAt: `${date}T18:30:00.000Z`, startedAt: `${date}T17:30:00.000Z`, name: "Full body", exercises: [{ name: "Squat", sets: [{ weight: top(140), reps: "5" }] }, { name: "Bench Press", sets: [{ weight: top(100), reps: "5" }] }] });
  }
  return { workouts, sleepNights: [], foodEntries, dayFlags: {}, weighIns: [], unit: "kg" as const };
}

for (const p of [
  { name: "Lifts 3% weaker the day after drinking", pct: 3 },
  { name: "Strength holds the day after drinking", pct: 0 },
]) {
  for (const weeks of [26, 52]) {
    let found = 0;
    let falseAlcohol = 0;
    const sizes: number[] = [];
    for (let s = 1; s <= SEEDS; s++) {
      const res = connections(lifter(9000 * weeks + s, weeks, p.pct), { today: TODAY, tz: "UTC" });
      // Found when drinks are linked, or linked through another condition that moved with them (the drinks' own carbs and calories).
      const c = res.items.find((x) => x.state === "linked" && (x.id === "alcohol" || x.movedWith === "alcohol"));
      if (c) {
        if (p.pct) {
          found++;
          sizes.push(c.diffPct);
        } else falseAlcohol++;
      }
    }
    const row = { study: "next session", persona: p.name, weeks, found: p.pct ? pct(found) : "–", meanShownPct: sizes.length ? Math.round((sizes.reduce((a, b) => a + b, 0) / sizes.length) * 10) / 10 : null, falseAlcoholLinks: pct(falseAlcohol) };
    rows.push(row);
    console.log(JSON.stringify(row));
  }
}

// ── Salt in the scale jump ──

/**
 * IN2's made-up lifter with sodium on every food (3,000 mg a day, 300 mg
 * spread) and a salty day (+3,000 mg, 7.5 g of salt) every 9 to 12 days,
 * holding `waterKgPerG` per g above 3,000 mg, half gone each day.
 */
function salty(seed: number, waterKgPerG: number) {
  const r = rng(seed);
  const gauss = () => Math.sqrt(-2 * Math.log(1 - r())) * Math.cos(2 * Math.PI * r());
  const days = 120;
  const start = addDays(TODAY, -(days - 1));
  const foodEntries: FoodEntry[] = [];
  const weighIns: WeighIn[] = [];
  const saltDays = new Set<number>();
  for (let k = 30 + Math.floor(r() * 4); k < days - 1; k += 9 + Math.floor(r() * 4)) saltDays.add(k);
  let water = 0;
  let noise = 0;
  let prevNa = 3000;
  for (let k = 0; k < days; k++) {
    const date = addDays(start, k);
    water = 0.5 * water + (waterKgPerG * (prevNa - 3000)) / 1000;
    noise = 0.4 * noise + 0.3 * gauss();
    weighIns.push({ ...stamp(date, `w${k}`), loggedAt: `${date}T07:00:00.000Z`, kg: Math.round((85 - 0.057 * k + water + noise) * 100) / 100 });
    const na = 3000 + 300 * gauss() + (saltDays.has(k) ? 3000 : 0);
    foodEntries.push({ ...stamp(date, `f${k}`), label: "Day", kcal: Math.round(2400 + 150 * gauss()), proteinG: 160, carbsG: Math.round(250 + 35 * gauss()), fatG: 80, method: "quick", sodiumMg: Math.round(na) });
    prevNa = na;
  }
  return { inputs: { weighIns, foodEntries, dayFlags: {}, workouts: [], tz: "UTC" }, saltDays, start };
}

for (const p of [
  { name: "Salty days hold 0.25 kg per g of sodium", water: 0.25 },
  { name: "Control: salty days, the scale doesn't follow", water: 0 },
]) {
  let saltMornings = 0;
  let spoken = 0;
  let saltNamed = 0;
  let otherMornings = 0;
  let otherSaltNamed = 0;
  for (let s = 1; s <= SEEDS; s++) {
    const { inputs, saltDays, start } = salty(11000 + s, p.water);
    const reads = scaleJumps(inputs, addDays(start, 45), addDays(start, 119));
    for (let k = 45; k < 120; k++) {
      const j = reads.get(addDays(start, k));
      const named = j?.causes.some((c) => c.kind === "food" && c.sodiumDeltaMg != null && c.sodiumDeltaMg * 2.5 >= 2000) ?? false;
      if (saltDays.has(k - 1)) {
        saltMornings++;
        if (j?.direction === "up") {
          spoken++;
          if (named) saltNamed++;
        }
      } else if (![1, 2, 3].some((b) => saltDays.has(k - b))) {
        otherMornings++;
        if (named) otherSaltNamed++;
      }
    }
  }
  const row = { study: "salt in the scale jump", persona: p.name, saltMornings, spokenUp: spoken, saltNamedWhenSpoken: spoken ? `${saltNamed}/${spoken}` : "–", otherMornings, saltNamedOnOtherMornings: otherSaltNamed };
  rows.push(row);
  console.log(JSON.stringify(row));
}

writeFileSync(OUT, JSON.stringify({ seeds: SEEDS, today: TODAY, rows }, null, 2));
console.log(`written ${OUT}`);
