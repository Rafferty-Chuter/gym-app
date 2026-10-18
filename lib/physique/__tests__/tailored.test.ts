import { describe, expect, it } from "vitest";
import { addDays } from "@/lib/dates";
import { makeScenario } from "@/lib/physique/fixtures";
import { cofidToItems } from "@/lib/food/cofid";
import { scaleMacros } from "@/lib/food/portions";
import { buildWeekReport, reportWeekStart, type WeekReportInputs } from "@/lib/physique/weekReport";
import { FIBRE_TARGET_G, focusFor, rateVsPlan, scorecard, STEPS_GOOD } from "@/lib/physique/weekScorecard";
import { howItsGoing, pulseWindows, trainedRecently } from "@/lib/physique/howItsGoing";
import { bandsFor } from "@/lib/training/volumeTargets";
import { bannedPhrasesIn } from "@/lib/physique/copy";
import type { DailySteps, FoodEntry } from "@/lib/physique/types";

describe("tailored to the goal (B3)", () => {
  const sc = makeScenario({
    seed: 21,
    days: 42,
    preDays: 7,
    bodyweightKg: 85,
    trueTdeeKcal: 2800,
    intake: "toTarget",
    goal: { ratePctPerWeek: -0.6, targetKg: 78 },
    lifts: [{ name: "Squat", startE1rm: 150, profile: "linear" as const, changePct: 4, perWeek: 2, cv: 0.02 }],
    sleep: { meanH: 7.2, sdH: 0.3, source: "healthkit", loggedShare: 1, hrv: { meanMs: 50, sdPct: 8, rhrBpm: 52 } },
    waist: { startCm: 90, changeCm: -6 },
  });
  const now = { today: sc.today, tz: "UTC" };
  const base: WeekReportInputs = { weighIns: sc.weighIns, foodEntries: sc.foodEntries, dayFlags: sc.dayFlags, sleepNights: sc.sleepNights, workouts: sc.workouts, program: sc.program, goal: sc.goal, weightUnit: "kg", expenditure: null, waist: sc.waist };
  const start = addDays(reportWeekStart(sc.today), -7);
  const week = (over: Partial<WeekReportInputs> = {}) => buildWeekReport({ ...base, ...over }, start, now);
  const ids = (goalType: Parameters<typeof scorecard>[0]["goalType"], over: Partial<WeekReportInputs> = {}) => scorecard({ report: week(over), prev: null, unit: "kg", goalType, planRatePct: -0.6 }).map((t) => t.id);

  /** Every entry of the scenario with a fibre value: 12 g per 1,000 kcal. */
  const withFibre = (entries: readonly FoodEntry[]): FoodEntry[] => entries.map((e) => ({ ...e, fibreG: Math.round((e.kcal / 1000) * 12 * 10) / 10 }));
  /** The same, plus one food a day without a fibre value carrying as much energy as the rest. */
  const halfKnown = (entries: readonly FoodEntry[]): FoodEntry[] => {
    const byDate = new Map<string, number>();
    for (const e of entries) byDate.set(e.date, (byDate.get(e.date) ?? 0) + e.kcal);
    return [...withFibre(entries), ...[...byDate].map(([date, kcal]) => ({ ...entries[0], id: `x-${date}`, date, kcal, fibreG: undefined }))];
  };
  const steps = (from: string, to: string, count: number): DailySteps[] => {
    const out: DailySteps[] = [];
    for (let d = from; d <= to; d = addDays(d, 1)) out.push({ id: `hk-s-${d}`, date: d, loggedAt: `${d}T23:00:00.000Z`, source: "healthkit", schemaVersion: 1, steps: count });
    return out;
  };

  it("maps each goal to what it is judged on", () => {
    expect([focusFor("lose"), focusFor("gain"), focusFor("maintain"), focusFor(null)]).toEqual(["cut", "gain", "recomp", "health"]);
  });

  it("reads the rate against the plan: a cut either side is watch, a gain only when too fast", () => {
    expect(rateVsPlan(-0.5, -0.6, "cut")).toEqual({ text: "On plan", tone: "good" });
    expect(rateVsPlan(-1.0, -0.6, "cut")).toEqual({ text: "Faster than plan", tone: "watch" });
    expect(rateVsPlan(-0.1, -0.6, "cut")).toEqual({ text: "Slower than plan", tone: "watch" });
    expect(rateVsPlan(0.7, 0.25, "gain")).toEqual({ text: "Faster than plan", tone: "watch" });
    expect(rateVsPlan(-0.1, 0.25, "gain")).toEqual({ text: "Slower than plan", tone: "neutral" });
    // A plan above the lean-gain band: on plan is still too fast, as the judge's GAIN-1 says.
    expect(rateVsPlan(0.97, 0.75, "gain", 0.5)).toEqual({ text: "Above lean range", tone: "watch" });
    expect(rateVsPlan(0.7, 0.75, "gain", 0.5)).toEqual({ text: "Above lean range", tone: "watch" });
    expect(rateVsPlan(0.6, 0.5, "gain", 0.5)).toEqual({ text: "On plan", tone: "good" });
    expect(rateVsPlan(-0.1, 0, "recomp")).toBeNull();
    expect(rateVsPlan(null, -0.6, "cut")).toBeNull();
  });

  it("orders the scorecard by goal, filling missing optional tiles from the fallbacks", () => {
    expect(ids("lose")).toEqual(["weight", "calories", "protein", "strength", "sleep", "training"]);
    expect(ids("gain")).toEqual(["weight", "calories", "strength", "protein", "sleep", "training"]);
    expect(ids("gain", { emphasised: ["back", "chest"], volumeBands: bandsFor({ back: "emphasise", chest: "emphasise" }, "lean_bulk") })).toEqual(["weight", "calories", "strength", "priority", "protein", "sleep"]);
    expect(ids("maintain")).toEqual(["waist", "weight", "strength", "protein", "training", "sleep"]);
    expect(ids(null, { foodEntries: withFibre(sc.foodEntries), steps: steps(addDays(start, -30), addDays(start, 6), 8200) })).toEqual(["wake", "training", "protein", "fibre", "steps", "rhr"]);
  });

  it("states the cut's rate against the plan on the weight tile", () => {
    const tile = scorecard({ report: week(), prev: null, unit: "kg", goalType: "lose", planRatePct: -0.6 }).find((t) => t.id === "weight")!;
    expect(tile.sub).toMatch(/%\/wk · plan −0\.60$/);
    expect(["On plan", "Faster than plan", "Slower than plan"]).toContain(tile.delta?.text);
  });

  it("reads the recomp's waist and leaves the weekly rate out", () => {
    const tiles = scorecard({ report: week(), prev: null, unit: "kg", goalType: "maintain", planRatePct: 0 });
    const waist = tiles.find((t) => t.id === "waist")!;
    expect(waist.value).toMatch(/cm$/);
    expect(waist.delta).toMatchObject({ tone: "good" });
    expect(waist.delta?.text).toMatch(/^−\d\.\d cm$/);
    expect(tiles.find((t) => t.id === "weight")!.sub).not.toMatch(/%\/wk/);
  });

  it("reads fibre only when foods with a known value carry most of the day", () => {
    const full = week({ foodEntries: withFibre(sc.foodEntries) });
    expect(full.food.fibreDays).toBeGreaterThanOrEqual(3);
    expect(full.food.meanFibreG).toBeGreaterThan(0);
    const thin = week({ foodEntries: halfKnown(sc.foodEntries) });
    expect(thin.food.fibreDays).toBe(0);
    expect(thin.food.meanFibreG).toBeNull();
    const tile = scorecard({ report: full, prev: null, unit: "kg", goalType: null }).find((t) => t.id === "fibre")!;
    expect(tile.sub).toMatch(new RegExp(`^Target ${FIBRE_TARGET_G} g`));
  });

  it("counts animal foods and fats with a blank fibre value as no fibre, and leaves other blanks unknown", () => {
    const [chicken, buckwheat, pie] = cofidToItems([
      ["18-324", "Chicken, breast, grilled with skin, meat only", "MCA", 147, 29.8, 3.1, 0, null],
      ["11-006", "Buckwheat, groats", "AA", 364, 8.1, 1.5, 84.9, null],
      ["19-999", "Pork pie, individual", "MI", 362, 9.8, 24.9, 25.7, null],
    ]);
    expect(chicken.per100.fibreG).toBe(0);
    expect(buckwheat.per100.fibreG).toBeUndefined();
    expect(pie.per100.fibreG).toBeUndefined();
    expect(scaleMacros({ ...buckwheat, per100: { ...buckwheat.per100, fibreG: 2.1 } }, 200).fibreG).toBe(4.2);
    expect(scaleMacros(buckwheat, 200).fibreG).toBeUndefined();
  });

  it("reads steps through yesterday and resting heart rate against the usual", () => {
    const running = buildWeekReport({ ...base, steps: steps(addDays(sc.today, -10), sc.today, 9000) }, reportWeekStart(sc.today), now);
    expect(running.days.find((d) => d.date === sc.today)?.steps ?? null).toBeNull();
    const r = week({ steps: steps(start, addDays(start, 6), STEPS_GOOD + 500) });
    expect(r.health).toMatchObject({ stepDays: 7, meanSteps: STEPS_GOOD + 500 });
    expect(r.health.meanRhr).toBeGreaterThan(40);
    expect(r.health.usualRhr).toBeGreaterThan(40);
    const tiles = scorecard({ report: r, prev: null, unit: "kg", goalType: null });
    expect(tiles.find((t) => t.id === "steps")).toMatchObject({ href: null, delta: { tone: "good" } });
    expect(tiles.find((t) => t.id === "rhr")?.delta?.text).toBe("Near usual");
  });

  it("gives Home the goal's rows: a recomp leads with the waist, no goal with the health reads", () => {
    const pulse = (goalType: "maintain" | null, over: Partial<WeekReportInputs> = {}) => {
      const i = { ...base, ...over };
      const { recentStart, foodStart } = pulseWindows(now.today);
      return howItsGoing({ recent: buildWeekReport(i, recentStart, now), food: buildWeekReport(i, foodStart, now), trainedRecently: trainedRecently(i.workouts, now), strength: "holding", goalType, planRatePct: 0 });
    };
    expect(pulse("maintain").map((r) => r.id)[0]).toBe("waist");
    const health = pulse(null, { foodEntries: withFibre(sc.foodEntries), steps: steps(addDays(now.today, -40), now.today, 6000) });
    expect(health.map((r) => r.id)).toEqual(["wake", "training", "protein", "fibre", "steps", "rhr"]);
    expect(health.find((r) => r.id === "training")?.value).toMatch(/days?$/);
    expect(health.find((r) => r.id === "steps")).toMatchObject({ note: "Under 7,000", tone: "neutral", href: null });
    for (const r of health) expect(bannedPhrasesIn(`${r.value} ${r.note}`)).toEqual([]);
  });
});
