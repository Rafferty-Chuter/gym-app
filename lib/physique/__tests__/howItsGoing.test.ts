import { describe, expect, it } from "vitest";
import { addDays } from "@/lib/dates";
import { makeScenario } from "@/lib/physique/fixtures";
import { buildWeekReport } from "@/lib/physique/weekReport";
import { howItsGoing, pulseWindows, trainedRecently, type PulseInputs } from "@/lib/physique/howItsGoing";
import { bannedPhrasesIn } from "@/lib/physique/copy";
import { INTAKE_ON_TARGET_KCAL } from "@/lib/physique/weekScorecard";
import { workoutDate } from "@/lib/physique/strength";
import type { StrengthStatus } from "@/lib/physique/types";

describe("How it's going (H1)", () => {
  const sc = makeScenario({
    seed: 7,
    days: 42,
    preDays: 7,
    bodyweightKg: 85,
    trueTdeeKcal: 2800,
    intake: "toTarget",
    goal: { ratePctPerWeek: -0.6, targetKg: 78 },
    lifts: [{ name: "Squat", startE1rm: 150, profile: "linear" as const, changePct: 4, perWeek: 2, cv: 0.02 }],
    sleep: { meanH: 7.2, sdH: 0.3, source: "manual", loggedShare: 1 },
  });
  const now = { today: sc.today, tz: "UTC" };
  const inputs = { weighIns: sc.weighIns, foodEntries: sc.foodEntries, dayFlags: sc.dayFlags, sleepNights: sc.sleepNights, workouts: sc.workouts, program: sc.program, goal: sc.goal, weightUnit: "kg" as const, expenditure: null };
  const build = (over: Partial<typeof inputs> = {}, strength: StrengthStatus | null = "holding"): PulseInputs => {
    const i = { ...inputs, ...over };
    const { recentStart, foodStart } = pulseWindows(now.today);
    return { recent: buildWeekReport(i, recentStart, now), food: buildWeekReport(i, foodStart, now), trainedRecently: trainedRecently(i.workouts, now), strength };
  };

  it("reads the 7 days through today, and food through yesterday", () => {
    const { recentStart, foodStart } = pulseWindows("2026-10-18");
    expect(recentStart).toBe("2026-10-12");
    expect(foodStart).toBe("2026-10-11");
  });

  it("gives one row per pillar, each a number and a plain judgement linking to its tab", () => {
    const rows = howItsGoing(build());
    expect(rows.map((r) => r.id)).toEqual(["calories", "protein", "training", "sleep"]);
    for (const r of rows) {
      expect(r.value.length).toBeGreaterThan(0);
      expect(r.note.length).toBeGreaterThan(0);
      expect(r.href.startsWith("/")).toBe(true);
      expect(`${r.value} ${r.note}`).not.toMatch(/not logged|missed|no weigh/i);
      expect(bannedPhrasesIn(`${r.value} ${r.note}`)).toEqual([]);
    }
    const delta = build().food.food.deltaKcal as number;
    expect(rows.find((r) => r.id === "calories")?.note).toBe(Math.abs(delta) <= INTAKE_ON_TARGET_KCAL ? "On target" : `${Math.abs(Math.round(delta)).toLocaleString("en-GB")} ${delta > 0 ? "over" : "under"}`);
    expect(rows.find((r) => r.id === "training")).toMatchObject({ note: "Lifts holding", tone: "good" });
  });

  it("leaves a pillar out until it has three days, rather than showing it empty", () => {
    const rows = howItsGoing(build({ foodEntries: [], sleepNights: [] }));
    expect(rows.map((r) => r.id)).toEqual(["training"]);
    const cut = addDays(now.today, -1);
    const twoNights = sc.sleepNights.filter((n) => n.date >= cut);
    expect(howItsGoing(build({ sleepNights: twoNights })).some((r) => r.id === "sleep")).toBe(false);
  });

  it("says a rest week once and neutrally, and says nothing about training for someone who does not train", () => {
    const old = sc.workouts.filter((w) => {
      const d = workoutDate(w, now.tz);
      return d != null && d < addDays(now.today, -10);
    });
    const rest = howItsGoing(build({ workouts: old })).find((r) => r.id === "training");
    expect(rest).toMatchObject({ value: "No sessions", tone: "neutral" });
    expect(howItsGoing(build({ workouts: [] })).some((r) => r.id === "training")).toBe(false);
  });

  it("takes the lifts from the strength engine, as the verdict does, and falls back to hard sets", () => {
    const at = (s: StrengthStatus | null) => howItsGoing(build({}, s)).find((r) => r.id === "training");
    expect(at("dropping")).toMatchObject({ note: "Lifts dropping", tone: "watch" });
    expect(at("one-lift")).toMatchObject({ note: "One lift down", tone: "watch" });
    expect(at("rising")).toMatchObject({ note: "Lifts rising", tone: "good" });
    expect(at("unclear")?.note).toMatch(/hard sets$/);
    expect(at(null)?.tone).toBe("neutral");
  });

  it("tones calories by distance from the target", () => {
    const heavy = sc.foodEntries.map((e) => ({ ...e, kcal: e.kcal * 1.3 }));
    const row = howItsGoing(build({ foodEntries: heavy })).find((r) => r.id === "calories");
    expect(row?.tone).toBe("watch");
    expect(row?.note).toMatch(/over$/);
  });
});
