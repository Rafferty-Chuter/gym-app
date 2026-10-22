import { describe, expect, it } from "vitest";
import { addDays, type LocalDate } from "@/lib/dates";
import { gaussian, mulberry32 } from "@/lib/physique/fixtures";
import { bannedPhrasesIn } from "@/lib/physique/copy";
import { CAUSE_MIN_KG, JUMP_MIN_KG, scaleJump, scaleJumps, type ScaleJumpInputs } from "@/lib/physique/scaleJump";
import { jumpCauseLine, jumpHeadline, jumpSettleLine, jumpShort } from "@/lib/physique/scaleJumpWords";
import type { DayFlags, FoodEntry, WeighIn } from "@/lib/physique/types";
import type { StoredWorkout } from "@/lib/trainingAnalysis";

const START = "2026-06-01";
const day = (k: number): LocalDate => addDays(START, k);

type Person = {
  days?: number;
  /** Daily scale noise: AR(1) with this SD per step and φ 0.4. */
  noiseKg?: number;
  /** kg a day the true weight moves (a cut is negative). */
  slopeKgPerDay?: number;
  /** Days on which carbs and calories jump. */
  spikeDays?: ReadonlySet<number>;
  spikeCarbsG?: number;
  spikeKcal?: number;
  /** Water held per g of carbs above 250 g, kg; decays by half a day. */
  carbWaterKgPerG?: number;
  /** Leg days and the water they add the next morning. */
  legDays?: ReadonlySet<number>;
  legKg?: number;
  /** Weigh-in probability a day. */
  weighShare?: number;
  /** Days with no food logged. */
  unlogged?: ReadonlySet<number>;
  flags?: Record<string, DayFlags>;
  /** IN9: sodium logged on every food (about 3,000 mg a day), extra on salt days, and water held per g above 3,000 mg, kg (half gone each day). */
  sodium?: boolean;
  saltDays?: ReadonlySet<number>;
  saltMg?: number;
  saltWaterKgPerG?: number;
  /** IN9: evenings with 54 g of alcohol (three pints) logged, and what the scale does the morning after, kg. The day's other food is cut by the drinks' calories, so they don't add to them. */
  drinkDays?: ReadonlySet<number>;
  drinkKg?: number;
};

/**
 * A made-up lifter: true weight on a straight line, glycogen water from
 * carbs above 250 g (half gone each day), gut contents from calories
 * above 2,400 the day before, a leg session's swelling, and AR(1) scale
 * noise. Every number is known, so the engine's reads can be scored.
 */
function person(seed: number, p: Person = {}): ScaleJumpInputs & { spikes: Set<LocalDate>; foodKg: Map<LocalDate, number> } {
  const r = mulberry32(seed);
  const days = p.days ?? 120;
  const weighIns: WeighIn[] = [];
  const foodEntries: FoodEntry[] = [];
  const workouts: StoredWorkout[] = [];
  const spikes = new Set<LocalDate>();
  const foodKg = new Map<LocalDate, number>();
  let water = 0;
  let noise = 0;
  let prevCarbs = 250;
  let prevKcal = 2400;
  let prevLeg = false;
  let salt = 0;
  let prevSodium = 3000;
  let prevDrink = false;
  for (let k = 0; k < days; k++) {
    const date = day(k);
    water = 0.5 * water + (p.carbWaterKgPerG ?? 0.003) * (prevCarbs - 250);
    salt = 0.5 * salt + ((p.saltWaterKgPerG ?? 0) * (prevSodium - 3000)) / 1000;
    const gut = 0.0003 * (prevKcal - 2400);
    const leg = prevLeg ? (p.legKg ?? 0) : 0;
    noise = 0.4 * noise + (p.noiseKg ?? 0.3) * gaussian(r);
    const kg = 85 + (p.slopeKgPerDay ?? -0.057) * k + water + gut + leg + noise + salt + (prevDrink ? (p.drinkKg ?? 0) : 0);
    foodKg.set(date, water + gut);
    if (r() < (p.weighShare ?? 1)) weighIns.push({ id: `w${k}`, date, loggedAt: `${date}T07:00:00.000Z`, source: "manual", schemaVersion: 1, kg: Math.round(kg * 100) / 100 });
    const spike = p.spikeDays?.has(k) ?? false;
    if (spike) spikes.add(date);
    const carbs = 250 + 35 * gaussian(r) + (spike ? (p.spikeCarbsG ?? 180) : 0);
    const kcal = 2400 + 4 * (carbs - 250) + 150 * gaussian(r) + (spike ? (p.spikeKcal ?? 900) - 4 * (p.spikeCarbsG ?? 180) : 0);
    // Drawn only when sodium is logged, so the other lifters' noise is as before.
    const sodium = 3000 + (p.sodium ? 300 * gaussian(r) : 0) + (p.saltDays?.has(k) ? (p.saltMg ?? 3000) : 0);
    const drink = p.drinkDays?.has(k) ?? false;
    if (!p.unlogged?.has(k)) {
      foodEntries.push({ id: `f${k}`, date, loggedAt: `${date}T20:00:00.000Z`, source: "manual", schemaVersion: 1, label: "Day", kcal: Math.round(kcal) - (drink ? 409 : 0), proteinG: 160, carbsG: Math.round(carbs) - (drink ? 30 : 0), fatG: 80, method: "quick", ...(p.sodium ? { sodiumMg: Math.round(sodium) } : {}) });
      if (drink) foodEntries.push({ id: `d${k}`, date, loggedAt: `${date}T21:00:00.000Z`, source: "manual", schemaVersion: 1, label: "Lager, standard", kcal: 409, proteinG: 3, carbsG: 30, fatG: 0, method: "search", time: "21:00", alcoholG: 54 });
    }
    prevSodium = sodium;
    prevDrink = drink;
    prevCarbs = carbs;
    prevKcal = kcal;
    prevLeg = p.legDays?.has(k) ?? false;
    if (prevLeg) workouts.push({ completedAt: `${date}T18:00:00.000Z`, name: "Legs", exercises: [{ name: "Squat", sets: Array.from({ length: 8 }, () => ({ weight: "140", reps: "5" })) }] });
  }
  return { weighIns, foodEntries, dayFlags: p.flags ?? {}, workouts, tz: "UTC", spikes, foodKg };
}

/** Spike days every 9 to 12 days from day 30. */
function spikeSchedule(seed: number, days = 120): Set<number> {
  const r = mulberry32(seed * 7 + 1);
  const out = new Set<number>();
  for (let k = 30 + Math.floor(r() * 4); k < days - 1; k += 9 + Math.floor(r() * 4)) out.add(k);
  return out;
}

describe("why the scale jumped (IN2)", () => {
  it("says nothing before three weeks of weigh-ins, or for an ordinary day", () => {
    const p = person(1, { days: 18, spikeDays: new Set([16]) });
    expect(scaleJump(p, day(17))).toBeNull();
    const steady = person(2);
    const quiet = [...scaleJumps(steady, day(40), day(119)).values()];
    // With no spikes, a big swing is rare: well under one morning in ten.
    expect(quiet.length).toBeLessThan(8);
  });

  it("reads a steady cut against where it was heading, not a lagging average, so no run of false drops", () => {
    const cut = person(3, { slopeKgPerDay: -0.1, noiseKg: 0.15 });
    const reads = [...scaleJumps(cut, day(40), day(119)).values()];
    expect(reads.filter((j) => j.direction === "down").length).toBeLessThan(3);
  });

  it("names a big carb day the day before, in grams and kcal against the person's usual", () => {
    const p = person(4, { spikeDays: new Set([60]), noiseKg: 0.15, spikeCarbsG: 220, spikeKcal: 1100 });
    const j = scaleJump(p, day(61));
    expect(j).not.toBeNull();
    expect(j!.direction).toBe("up");
    expect(Math.abs(j!.deltaKg)).toBeGreaterThanOrEqual(JUMP_MIN_KG);
    const food = j!.causes.find((c) => c.kind === "food");
    expect(food).toMatchObject({ daysAgo: 1 });
    expect(food && food.kind === "food" ? food.carbsDeltaG : 0).toBeGreaterThan(150);
    expect(food && food.kind === "food" ? food.shareKg : 0).toBeGreaterThanOrEqual(CAUSE_MIN_KG);
  });

  it("a lighter morning after a low-carb day reads as a drop with fewer carbs", () => {
    const p = person(5, { spikeDays: new Set([70]), spikeCarbsG: -200, spikeKcal: -900, noiseKg: 0.15 });
    const j = scaleJump(p, day(71));
    expect(j?.direction).toBe("down");
    const food = j?.causes.find((c) => c.kind === "food");
    expect(food && food.kind === "food" ? food.carbsDeltaG : 0).toBeLessThan(-150);
  });

  it("an unlogged day before is said plainly, with no food cause", () => {
    const p = person(6, { spikeDays: new Set([60]), spikeCarbsG: 250, spikeKcal: 1300, noiseKg: 0.15, unlogged: new Set([60]) });
    const j = scaleJump(p, day(61));
    expect(j).not.toBeNull();
    expect(j!.foodLog).toBe("unlogged");
    expect(j!.causes.some((c) => c.kind === "food")).toBe(false);
    expect(jumpCauseLine(j!, true)).toBe("Yesterday's food isn't logged");
  });

  it("a day before flagged as part-logged says the log looks incomplete, not that nothing was logged", () => {
    const p = person(12, { spikeDays: new Set([60]), spikeCarbsG: 250, spikeKcal: 1300, noiseKg: 0.15, flags: { [day(60)]: { date: day(60), status: "partial" } } });
    const j = scaleJump(p, day(61));
    expect(j?.foodLog).toBe("partial");
    expect(jumpCauseLine(j!, true)).toBe("Yesterday's log looks incomplete");
  });

  it("names a logged event: creatine started in the last four weeks", () => {
    const p = person(7, { spikeDays: new Set([80]), noiseKg: 0.15, spikeCarbsG: 220, spikeKcal: 1100, flags: { [day(70)]: { date: day(70), events: [{ type: "creatine_start" }] } } });
    const j = scaleJump(p, day(81));
    expect(j?.causes.some((c) => c.kind === "event" && c.type === "creatine_start")).toBe(true);
  });

  it("a leg day is not named from the evidence alone; once the person's own data shows it, it is", () => {
    const legDays = new Set(Array.from({ length: 40 }, (_, i) => 3 + i * 3));
    const none = person(8, { legDays, legKg: 0, noiseKg: 0.25 });
    const named = [...scaleJumps(none, day(40), day(119)).values()].filter((j) => j.causes.some((c) => c.kind === "legs"));
    expect(named).toEqual([]);
    const swells = person(9, { legDays, legKg: 0.8, noiseKg: 0.2 });
    const reads = [...scaleJumps(swells, day(90), day(119)).values()];
    expect(reads.some((j) => j.personal && j.causes.some((c) => c.kind === "legs"))).toBe(true);
  });

  it("says how long the person's own past jumps took to go", () => {
    const p = person(10, { spikeDays: spikeSchedule(10), noiseKg: 0.15, spikeCarbsG: 220, spikeKcal: 1100 });
    const last = [...scaleJumps(p, day(100), day(119)).values()].find((j) => j.direction === "up");
    expect(last?.settle).not.toBeNull();
    expect(last!.settle!.jumps).toBeGreaterThanOrEqual(3);
    expect(last!.settle!.minDays).toBeGreaterThanOrEqual(1);
    expect(last!.settle!.maxDays).toBeLessThanOrEqual(5);
  });

  it("words: kg first, the cause in its own units, never fat, no advice", () => {
    const p = person(11, { spikeDays: spikeSchedule(11), noiseKg: 0.15, spikeCarbsG: 220, spikeKcal: 1100 });
    const reads = [...scaleJumps(p, day(60), day(119)).values()];
    expect(reads.length).toBeGreaterThan(2);
    const j = reads.find((x) => x.causes.some((c) => c.kind === "food"))!;
    expect(jumpHeadline(j, "kg", true)).toMatch(/^Up \d\.\d kg on (yesterday|Monday|Tuesday|Wednesday|Thursday|Friday|Saturday|Sunday)$/);
    expect(jumpHeadline(j, "kg", false)).toMatch(/^Up \d\.\d kg on (the day before|[A-Z][a-z]+day)$/);
    // The number is the move since the last weigh-in, and it is the way the read says.
    expect(j.changeKg).toBeGreaterThanOrEqual(JUMP_MIN_KG);
    expect(jumpCauseLine(j, true)).toMatch(/^(Yesterday|2 days ago): \d+ g more carbs( and [\d,]+ more kcal)? than usual$/);
    expect(jumpCauseLine(j, false)).toMatch(/^(The day before|2 days before): /);
    expect(jumpShort(j, "kg", true)).toMatch(/^Up \d\.\d kg · \d+ g more carbs (yesterday|2 days ago)$/);
    expect(jumpHeadline(j, "lb", true)).toMatch(/^Up \d\.\d lb on /);
    for (const x of reads) {
      for (const t of [jumpHeadline(x, "kg", true), jumpCauseLine(x, true), jumpSettleLine(x), jumpShort(x, "kg", false)]) {
        if (!t) continue;
        expect(bannedPhrasesIn(t)).toEqual([]);
        expect(t).not.toMatch(/\bfat\b|should|try|aim|cut back|avoid/i);
      }
    }
    const settled = reads.find((x) => x.settle);
    expect(settled && jumpSettleLine(settled)).toMatch(/^Your last \d+ (jumps|drops) like this were (gone|back) in \d+( to \d+)? days?$/);
  });

  it("IN9: names a salty day the day before, in grams of salt as food labels give it", () => {
    const p = person(20, { sodium: true, saltDays: new Set([60]), saltMg: 4000, saltWaterKgPerG: 0.25, noiseKg: 0.12 });
    const j = scaleJump(p, day(61));
    expect(j?.direction).toBe("up");
    const food = j?.causes.find((c) => c.kind === "food");
    expect(food && food.kind === "food" ? food.sodiumDeltaMg : 0).toBeGreaterThan(3400);
    // With carbs up a little too, salt still leads: it moved the scale more.
    const both = { ...j!, causes: [{ kind: "food" as const, daysAgo: 1 as const, carbsDeltaG: 55, kcalDelta: 200, sodiumDeltaMg: 3500, shareKg: 0.9 }] };
    expect(jumpCauseLine(both, true)).toBe("Yesterday: 8.8 g more salt and 55 g more carbs than usual");
    expect(jumpShort(both, "kg", true)).toMatch(/· 8\.8 g more salt yesterday$/);
    expect(jumpCauseLine(j!, true)).toMatch(/^Yesterday: \d+(\.\d)? g more salt than usual$/);
    expect(jumpShort(j!, "kg", true)).toMatch(/^Up \d\.\d kg · \d+(\.\d)? g more salt yesterday$/);
  });

  it("IN9: a day whose foods mostly don't carry sodium is not read for salt", () => {
    // The same salty day, but sodium is logged on no food at all.
    const p = person(20, { saltDays: new Set([60]), saltMg: 4000, saltWaterKgPerG: 0.25, noiseKg: 0.12 });
    const j = scaleJump(p, day(61));
    expect(j?.causes.some((c) => c.kind === "food") ?? false).toBe(false);
  });

  it("IN9: drinks are named for a jump only once the person's own mornings show it, and never sized from the evidence", () => {
    const drinkDays = new Set(Array.from({ length: 30 }, (_, i) => 2 + i * 4));
    const none = person(21, { drinkDays, drinkKg: 0, noiseKg: 0.25 });
    const named = [...scaleJumps(none, day(30), day(119)).values()].filter((j) => j.causes.some((c) => c.kind === "drinks"));
    expect(named).toEqual([]);
    const holds = person(22, { drinkDays, drinkKg: 0.9, noiseKg: 0.2 });
    const reads = [...scaleJumps(holds, day(90), day(119)).values()].filter((j) => j.personal && j.causes.some((c) => c.kind === "drinks"));
    expect(reads.length).toBeGreaterThan(0);
    expect(jumpCauseLine(reads[0], true)).toMatch(/^Yesterday: 54 g of alcohol/);
    expect(jumpShort(reads[0], "kg", true)).toMatch(/^Up \d\.\d kg · 54 g of alcohol yesterday$/);
    // IN9b: the same evenings logged as 4 drinks in Apple Health instead (4 × 14 g).
    const vitals = holds.foodEntries.filter((e) => e.alcoholG).map((e) => ({ id: `hk-v-${e.date}`, date: e.date, loggedAt: e.loggedAt, source: "healthkit" as const, schemaVersion: 1 as const, alcoholDrinks: 4 }));
    const fromHealth = { ...holds, foodEntries: holds.foodEntries.filter((e) => !e.alcoholG), vitals };
    const healthReads = [...scaleJumps(fromHealth, day(90), day(119)).values()].filter((j) => j.personal && j.causes.some((c) => c.kind === "drinks"));
    expect(healthReads.length).toBeGreaterThan(0);
    expect(jumpCauseLine(healthReads[0], true)).toMatch(/^Yesterday: 56 g of alcohol/);
    for (const t of [jumpCauseLine(reads[0], true), jumpShort(reads[0], "kg", true)]) {
      expect(bannedPhrasesIn(t)).toEqual([]);
      expect(t).not.toMatch(/\bfat\b|because|should|too many|binge|limit|cut back/i);
    }
  });

  // ── The acceptance study ──

  it("study: carb-spike mornings are explained 80% of the time or more; mornings food didn't move get a cause 5% or less", () => {
    let spikeSpoken = 0;
    let spikeExplained = 0;
    let spikeMornings = 0;
    let noiseSpoken = 0;
    let noiseNamed = 0;
    let noiseMornings = 0;
    for (let seed = 1; seed <= 30; seed++) {
      const sched = spikeSchedule(seed);
      const p = person(100 + seed, { spikeDays: sched, weighShare: 0.9 });
      const reads = scaleJumps(p, day(45), day(119));
      for (let k = 45; k < 120; k++) {
        const j = reads.get(day(k)) ?? null;
        if (sched.has(k - 1)) {
          spikeMornings++;
          if (j && j.direction === "up") {
            spikeSpoken++;
            if (j.causes.some((c) => c.kind === "food")) spikeExplained++;
          }
        } else if (![1, 2, 3, 4].some((b) => sched.has(k - b)) && Math.abs(p.foodKg.get(day(k)) ?? 0) < 0.15) {
          // Noise only: no spike in the four days before, and what was eaten moved this morning by under 0.15 kg.
          noiseMornings++;
          if (j) {
            noiseSpoken++;
            if (j.causes.length > 0) noiseNamed++;
          }
        }
      }
    }
    const explained = spikeExplained / spikeSpoken;
    const named = noiseNamed / Math.max(1, noiseSpoken);
    const namedPerDay = noiseNamed / noiseMornings;
    // Printed for STATUS: how often the app speaks on each kind of morning.
    console.info(`scale-jump study: spike mornings ${spikeMornings}, spoken ${spikeSpoken} (${((spikeSpoken / spikeMornings) * 100).toFixed(0)}%), explained ${((explained) * 100).toFixed(0)}%; noise mornings ${noiseMornings}, spoken ${noiseSpoken} (${((noiseSpoken / noiseMornings) * 100).toFixed(1)}%), given a cause ${noiseNamed} (${(namedPerDay * 100).toFixed(1)}% of those mornings, ${(named * 100).toFixed(1)}% of the reads)`);
    expect(explained).toBeGreaterThanOrEqual(0.8);
    // The acceptance bar (08 IN2) is per morning; a read that does speak names a wrong cause rarely too.
    expect(namedPerDay).toBeLessThanOrEqual(0.05);
    expect(named).toBeLessThanOrEqual(0.15);
    // An ordinary scale is quiet: under one morning in 20 is called a jump.
    expect(noiseSpoken / noiseMornings).toBeLessThan(0.05);
    // A 180 g, 900 kcal day adds about 0.8 kg against a scale that wanders about 0.35 kg a day, so about half are lost in the noise; silence there is the point.
    expect(spikeSpoken / spikeMornings).toBeGreaterThan(0.4);
  });
});
