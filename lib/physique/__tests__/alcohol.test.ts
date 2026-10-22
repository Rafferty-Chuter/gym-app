import { describe, expect, it } from "vitest";
import { addDays, type LocalDate } from "@/lib/dates";
import { gaussian, mulberry32 } from "@/lib/physique/fixtures";
import { bannedPhrasesIn } from "@/lib/physique/copy";
import { ALC_MIN_EACH, alcoholLinks, type AlcoholInputs, type AlcoholOutcome } from "@/lib/physique/alcohol";
import { alcoholHeadline, alcoholRow, alcoholSameDaysNote, ALCOHOL_EVIDENCE } from "@/lib/physique/alcoholWords";
import { alcoholByEvening, bodyKgAt, DRINK_G_PER_KG, drinkingEvenings, drinkThresholdG, HEALTH_DRINK_G, sodiumByDay } from "@/lib/physique/dayExtras";
import type { DailyVitals, FoodEntry, SleepNight, WeighIn } from "@/lib/physique/types";

const START = "2026-04-01";
const day = (k: number): LocalDate => addDays(START, k);

type Opts = {
  days?: number;
  /** Share of evenings with drinks, at random. */
  drinkShare?: number;
  /** Drink on Fridays and Saturdays only, each with this probability. */
  weekendShare?: number;
  /** Evenings (day numbers) with drinks, instead of at random. */
  drinkDays?: ReadonlySet<number>;
  /** Grams of alcohol on a drinking evening (54 g is three pints of lager). */
  drinkG?: number;
  /** The next day's resting HR, bpm; HRV, %; sleep that night, minutes; after a drinking evening. */
  rhrBpm?: number;
  hrvPct?: number;
  sleepMin?: number;
  /** Weekend nights (Friday and Saturday evenings) sleep this many minutes differently, drink or not. */
  weekendSleepMin?: number;
  /** The scale the morning after and two mornings after a drinking evening, kg. */
  scaleKg?: [number, number];
  /** Drinks logged after midnight, on the next day's date. */
  lateDrinks?: boolean;
  /** HRV and resting HR as day vitals rather than on the night. */
  vitalsOnly?: boolean;
  /** IN9b: drinks logged in Apple Health (this many a drinking evening) instead of as food. */
  healthDrinks?: number;
  bodyKg?: number;
};

/**
 * A made-up person: food logged every day, drinks on some evenings, a watch
 * every night (resting HR around 55 bpm with carry-over from night to
 * night, HRV around 55 ms, about 7 hours asleep), and a weigh-in every
 * morning on a slow cut. Every effect of drinking is known.
 */
function person(seed: number, o: Opts = {}): AlcoholInputs & { drinks: Set<LocalDate> } {
  const r = mulberry32(seed);
  const days = o.days ?? 150;
  const foodEntries: FoodEntry[] = [];
  const sleepNights: SleepNight[] = [];
  const vitals: DailyVitals[] = [];
  const weighIns: WeighIn[] = [];
  const drinks = new Set<LocalDate>();
  let rhrNoise = 0;
  let scaleNoise = 0;
  let prevDrink = false;
  let prev2Drink = false;
  const body = o.bodyKg ?? 80;
  for (let k = 0; k < days; k++) {
    const date = day(k);
    const stamp = { date, loggedAt: `${date}T20:00:00.000Z`, source: "manual" as const, schemaVersion: 1 as const };
    // The morning: this date's night and weigh-in follow the evening before.
    const dow = new Date(`${date}T12:00:00Z`).getUTCDay();
    const afterWeekend = dow === 6 || dow === 0;
    rhrNoise = 0.4 * rhrNoise + 2 * gaussian(r);
    const rhr = Math.round(55 + rhrNoise + (prevDrink ? (o.rhrBpm ?? 0) : 0));
    const hrv = Math.round(55 * Math.exp(0.18 * gaussian(r)) * (prevDrink ? 1 + (o.hrvPct ?? 0) / 100 : 1));
    const asleep = Math.round(420 + 35 * gaussian(r) + (prevDrink ? (o.sleepMin ?? 0) : 0) + (afterWeekend ? (o.weekendSleepMin ?? 0) : 0));
    if (k > 0) {
      sleepNights.push({ id: `n${k}`, ...stamp, source: "healthkit", bedtime: "23:00", wakeTime: "07:00", asleepMin: asleep, inBedMin: asleep + 30, ...(o.vitalsOnly ? {} : { restingHr: rhr, hrvMs: hrv }) });
      if (o.vitalsOnly) vitals.push({ id: `hk-v-${date}`, ...stamp, source: "healthkit", restingHr: rhr, hrvMs: hrv });
    }
    scaleNoise = 0.4 * scaleNoise + 0.25 * gaussian(r);
    const kg = body - 0.04 * k + scaleNoise + (prevDrink ? (o.scaleKg?.[0] ?? 0) : 0) + (prev2Drink && !prevDrink ? (o.scaleKg?.[1] ?? 0) : 0);
    weighIns.push({ id: `w${k}`, ...stamp, loggedAt: `${date}T07:00:00.000Z`, kg: Math.round(kg * 100) / 100 });
    // The day's food, then the evening.
    foodEntries.push({ id: `f${k}`, ...stamp, label: "Day", kcal: 2300, proteinG: 160, carbsG: 250, fatG: 70, method: "quick", time: "13:00", sodiumMg: 2800 });
    const eveningDow = new Date(`${date}T12:00:00Z`).getUTCDay();
    const drink = o.drinkDays ? o.drinkDays.has(k) : o.weekendShare != null ? (eveningDow === 5 || eveningDow === 6) && r() < o.weekendShare : r() < (o.drinkShare ?? 0.15);
    if (drink && o.healthDrinks) {
      drinks.add(date);
      const v = vitals.find((x) => x.date === date);
      if (v) v.alcoholDrinks = o.healthDrinks;
      else vitals.push({ id: `hk-v-${date}`, ...stamp, source: "healthkit", alcoholDrinks: o.healthDrinks });
    } else if (drink) {
      drinks.add(date);
      const late = o.lateDrinks ? addDays(date, 1) : date;
      foodEntries.push({ id: `d${k}`, ...stamp, date: late, label: "Lager, standard", kcal: 409, proteinG: 3, carbsG: 30, fatG: 0, method: "search", time: o.lateDrinks ? "00:30" : "21:00", alcoholG: o.drinkG ?? 54, sodiumMg: 60 });
    }
    prev2Drink = prevDrink;
    prevDrink = drink;
  }
  return { foodEntries, dayFlags: {}, sleepNights, vitals, weighIns, drinks };
}

const nowAt = (k: number) => ({ today: day(k), tz: "UTC" });
const item = (r: ReturnType<typeof alcoholLinks>, id: AlcoholOutcome) => r.items.find((x) => x.id === id);

describe("drinking evenings (IN9)", () => {
  const stamp = (date: LocalDate, id: string) => ({ id, date, loggedAt: `${date}T20:00:00.000Z`, source: "manual" as const, schemaVersion: 1 as const });
  const food = (date: LocalDate, id: string, extra: Partial<FoodEntry>): FoodEntry => ({ ...stamp(date, id), label: "Food", kcal: 2000, proteinG: 150, carbsG: 200, fatG: 70, method: "quick", ...extra });

  it("a drink after midnight belongs to the evening before; a little is neither; an unlogged day is not dry", () => {
    const entries = [
      food(day(0), "a", {}),
      food(day(1), "b", {}),
      food(day(1), "late", { label: "Wine", kcal: 266, time: "01:15", alcoholG: 37 }),
      food(day(1), "sip", { label: "Wine", kcal: 40, time: "19:00", alcoholG: 5 }),
      food(day(2), "c", {}),
    ];
    const ev = drinkingEvenings(entries, {}, [], day(0), day(3));
    expect(ev.get(day(0))).toMatchObject({ kind: "drink", alcoholG: 37 });
    // 5 g on the evening of day 1: a sip, neither drinking nor dry.
    expect(ev.has(day(1))).toBe(false);
    expect(ev.get(day(2))).toMatchObject({ kind: "dry" });
    // Day 3 has no food logged: no record that it was dry.
    expect(ev.has(day(3))).toBe(false);
  });

  it("IN9b: Apple Health's drinks fill an evening with none logged as food, 14 g each, never counted twice", () => {
    const v = (date: LocalDate, n: number): DailyVitals => ({ id: `hk-v-${date}`, date, loggedAt: `${date}T23:00:00.000Z`, source: "healthkit", schemaVersion: 1, alcoholDrinks: n });
    const entries = [
      food(day(0), "a", {}),
      food(day(1), "b", {}),
      food(day(1), "pints", { label: "Lager", kcal: 409, time: "21:00", alcoholG: 54.5 }),
      food(day(2), "c", {}),
      food(day(2), "sauce", { label: "Coq au vin", kcal: 600, time: "19:00", alcoholG: 0.5 }),
      food(day(3), "d", {}),
    ];
    const vitals = [v(day(0), 2), v(day(1), 3), v(day(2), 3), v(day(3), 1), { ...v(day(3), 1), id: "hae-v" }];
    const g = alcoholByEvening(entries, vitals);
    // Health only: 2 × 14 g.
    expect(g.get(day(0))).toBe(2 * HEALTH_DRINK_G);
    // Logged as food too: the food log stands, Health's 3 aren't added.
    expect(g.get(day(1))).toBe(54.5);
    // A splash in the cooking is not a drink logged: Health's 3 count, with it.
    expect(g.get(day(2))).toBeCloseTo(3 * HEALTH_DRINK_G + 0.5);
    // The same day from two sources (the app and Health Auto Export) counts once.
    expect(g.get(day(3))).toBe(HEALTH_DRINK_G);
    // A drink at 00:30 logged both ways: the food log puts it on the evening before, and Health's count for that day is not added again.
    const late = [food(day(5), "e", {}), food(day(6), "late", { label: "Wine", kcal: 266, time: "00:30", alcoholG: 37 })];
    const lateG = alcoholByEvening(late, [v(day(6), 2)]);
    expect(lateG.get(day(5))).toBe(37);
    expect(lateG.has(day(6))).toBe(false);
    const ev = drinkingEvenings(entries, {}, [], day(0), day(3), { vitals });
    expect(ev.get(day(0))).toMatchObject({ kind: "drink", alcoholG: 28 });
    // One drink (14 g) is under the 20 g line at 80 kg, and an evening with a drink is never dry.
    expect(ev.has(day(3))).toBe(false);
  });

  it("a drinking night starts at 0.25 g of alcohol per kg of body weight", () => {
    expect(DRINK_G_PER_KG).toBe(0.25);
    const w = (k: number, kg: number): WeighIn => ({ id: `w${k}`, date: day(k), loggedAt: `${day(k)}T07:00:00.000Z`, source: "manual", schemaVersion: 1, kg });
    expect(bodyKgAt([w(0, 100), w(1, 100), w(2, 100)], day(5))).toBe(100);
    expect(drinkThresholdG(100)).toBe(25);
    // No weigh-ins: an 80 kg person's line.
    expect(drinkThresholdG(bodyKgAt([], day(5)))).toBe(20);
  });

  it("sodium is read for a day only when foods carrying it make up most of the day, and scaled to the whole day", () => {
    const entries = [
      food(day(0), "a", { kcal: 1800, sodiumMg: 1800 }),
      food(day(0), "b", { kcal: 200 }),
      food(day(1), "c", { kcal: 1000, sodiumMg: 1500 }),
      food(day(1), "d", { kcal: 1000 }),
    ];
    const s = sodiumByDay(entries, {}, day(0), day(1));
    // 90% of day 0's calories carry sodium: 1,800 mg on 1,800 kcal is 2,000 mg for the day.
    expect(s.get(day(0))).toBe(2000);
    // Half of day 1's is unknown: not read.
    expect(s.has(day(1))).toBe(false);
  });
});

describe("alcohol against that night and the next day (IN9)", () => {
  it("says nothing before 5 drinking nights and 5 without, and shows how far along it is", () => {
    const p = person(1, { days: 40, drinkDays: new Set([10, 17, 24, 31]), rhrBpm: 9, hrvPct: -25 });
    const r = alcoholLinks(p, nowAt(39));
    const rhr = item(r, "rhr")!;
    expect(rhr.state).toBe("building");
    expect(rhr.sameDays).toBeNull();
    expect(rhr.drink).toBe(4);
    expect(rhr.dry).toBeGreaterThanOrEqual(ALC_MIN_EACH);
    expect(rhr.diff).toBeNull();
  });

  it("a big effect shows once 5 drinking nights and 5 without have held for a week", () => {
    let found = 0;
    for (let s = 1; s <= 10; s++) {
      // Five drinking nights by day 39, a sixth on day 46: read on day 49 and, a week earlier, on day 42.
      const p = person(10 + s, { days: 50, drinkDays: new Set([10, 17, 24, 31, 38, 45]), rhrBpm: 9, hrvPct: -25 });
      const r = alcoholLinks(p, nowAt(49));
      const rhr = item(r, "rhr")!;
      if (rhr.state === "linked") {
        found++;
        expect(rhr.diff!).toBeGreaterThan(4);
        expect(rhr.diff!).toBeLessThan(14);
      }
    }
    expect(found).toBeGreaterThanOrEqual(8);
    // The day the fifth night arrives, a week before: still settling, not "no link".
    const first = alcoholLinks(person(11, { days: 50, drinkDays: new Set([10, 17, 24, 31, 38]), rhrBpm: 9 }), nowAt(42));
    expect(item(first, "rhr")?.state).toBe("building");
  });

  it("reads HRV lower in ms against the person's usual, and sleep in minutes", () => {
    const p = person(30, { drinkShare: 0.15, rhrBpm: 5, hrvPct: -20, sleepMin: -50 });
    const r = alcoholLinks(p, nowAt(149));
    const hrv = item(r, "hrv")!;
    expect(hrv.state).toBe("linked");
    expect(hrv.diff!).toBeLessThan(-5);
    expect(hrv.usual).toBeGreaterThan(45);
    expect(item(r, "sleep")).toMatchObject({ state: "linked" });
    expect(item(r, "sleep")!.diff!).toBeLessThan(-20);
    expect(r.drinkEvenings).toBeGreaterThanOrEqual(ALC_MIN_EACH);
    // 0.25 g per kg at about 75 kg, where this cut has the weight over the last two months.
    expect(r.thresholdG).toBe(19);
  });

  it("reads HRV and resting HR kept as day vitals when the night has none", () => {
    const p = person(31, { drinkShare: 0.15, rhrBpm: 8, vitalsOnly: true });
    expect(item(alcoholLinks(p, nowAt(149)), "rhr")?.state).toBe("linked");
  });

  it("IN9b: reads drinks logged only in Apple Health", () => {
    const r = alcoholLinks(person(11, { rhrBpm: 7, hrvPct: -20, healthDrinks: 3 }), nowAt(149));
    expect(r.drinkEvenings).toBeGreaterThan(10);
    expect(item(r, "rhr")?.state).toBe("linked");
    // Without the vitals, the same person's food log shows no drinking at all.
    const noHealth = person(11, { rhrBpm: 7, hrvPct: -20, healthDrinks: 3 });
    expect(alcoholLinks({ ...noHealth, vitals: [] }, nowAt(149)).drinkEvenings).toBe(0);
  });

  it("counts drinks logged after midnight to the night they were part of", () => {
    const p = person(32, { drinkShare: 0.15, rhrBpm: 8, lateDrinks: true });
    const r = alcoholLinks(p, nowAt(149));
    expect(item(r, "rhr")?.state).toBe("linked");
    expect(r.drinkEvenings).toBe([...p.drinks].filter((d) => d >= r.from && d < r.through).length);
  });

  it("finds no link for someone whose nights don't change, in at least 19 people of 20", () => {
    let withLink = 0;
    for (let s = 1; s <= 20; s++) {
      const r = alcoholLinks(person(100 + s, { drinkShare: 0.2 }), nowAt(149));
      if (r.items.some((x) => x.state === "linked")) withLink++;
      expect(r.items.every((x) => x.state !== "building")).toBe(true);
    }
    expect(withLink).toBeLessThanOrEqual(1);
  });

  it("a weekend that runs short anyway is not put down to the drinks when dry weekends say otherwise", () => {
    let linked = 0;
    for (let s = 1; s <= 10; s++) {
      const r = alcoholLinks(person(200 + s, { weekendShare: 0.7, weekendSleepMin: -60 }), nowAt(149));
      if (item(r, "sleep")?.state === "linked") linked++;
    }
    expect(linked).toBeLessThanOrEqual(1);
  });

  it("drinking every weekend with no dry ones to compare: a link says the weekend may be part of it", () => {
    const r = alcoholLinks(person(60, { weekendShare: 1, rhrBpm: 8 }), nowAt(149));
    const rhr = item(r, "rhr")!;
    expect(rhr.state).toBe("linked");
    expect(rhr.sameDays).toBe("unchecked");
    expect(r.weekendShare).toBe(1);
    expect(alcoholSameDaysNote(r)).toBe("Your drinking nights were mostly Fridays and Saturdays, with too few dry ones to compare, so the weekend may be part of it.");
    // Random evenings: checked against the same weekdays, no note.
    const random = alcoholLinks(person(61, { drinkShare: 0.2, rhrBpm: 8 }), nowAt(149));
    expect(item(random, "rhr")?.sameDays).toBe("held");
    expect(alcoholSameDaysNote(random)).toBeNull();
  });

  it("reads the scale the morning after and two mornings after, either way", () => {
    const up = alcoholLinks(person(40, { drinkShare: 0.2, scaleKg: [0.8, 0.4] }), nowAt(149));
    expect(item(up, "scale1")).toMatchObject({ state: "linked" });
    expect(item(up, "scale1")!.diff!).toBeGreaterThan(0.4);
    const down = alcoholLinks(person(41, { drinkShare: 0.2, scaleKg: [-0.7, 0] }), nowAt(149));
    expect(item(down, "scale1")).toMatchObject({ state: "linked" });
    expect(item(down, "scale1")!.diff!).toBeLessThan(-0.3);
  });

  it("leaves out what isn't recorded: no weigh-ins, no scale rows", () => {
    const p = person(42, { drinkShare: 0.2 });
    const r = alcoholLinks({ ...p, weighIns: [] }, nowAt(149));
    expect(r.items.map((x) => x.id)).toEqual(["rhr", "hrv", "sleep"]);
    expect(alcoholLinks({ ...p, foodEntries: [] }, nowAt(149)).items).toEqual([]);
  });

  it("words: after, never because; the counts; nothing about drinking less", () => {
    const p = person(30, { drinkShare: 0.15, rhrBpm: 6, hrvPct: -20, sleepMin: -50, scaleKg: [0.8, 0.3] });
    const r = alcoholLinks(p, nowAt(149));
    const head = alcoholHeadline(r, "kg");
    expect(head).toMatch(/^After drinking: resting HR \d+ bpm higher, HRV \d+ ms lower/);
    expect(head).toMatch(/· \d+ vs \d+ nights$/);
    const rhr = alcoholRow(item(r, "rhr")!, "kg");
    expect(rhr).toMatchObject({ label: "Resting heart rate" });
    expect(rhr.value).toMatch(/^\+\d+ bpm$/);
    expect(rhr.sub).toMatch(/^Next day · \d+ vs \d+ nights$/);
    const building = alcoholRow({ ...item(r, "rhr")!, state: "building", drink: 3, diff: null }, "kg");
    expect(building.value).toBe("3 of 5");
    // Past the count with a link not yet held a week: settling, never "No clear link".
    expect(alcoholRow({ ...item(r, "rhr")!, state: "building", drink: 5, dry: 30, diff: null }, "kg").value).toBe("Checking");
    const copy = [head, alcoholSameDaysNote({ ...r, weekendShare: 0.5, items: r.items.map((x) => ({ ...x, sameDays: "unchecked" as const })) }), ...r.items.flatMap((x) => Object.values(alcoholRow(x, "kg"))), alcoholRow(item(r, "scale1")!, "lb").value, ALCOHOL_EVIDENCE.nights.text, ALCOHOL_EVIDENCE.strength.text].join(" ");
    expect(bannedPhrasesIn(copy)).toEqual([]);
    expect(copy).not.toMatch(/because|caused|\bfat\b|should|try|aim|cut back|avoid|too many|binge|limit|careful|healthy|guilt|treat/i);
  });
});
