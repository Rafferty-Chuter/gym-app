import { describe, expect, it } from "vitest";
import { addDays } from "@/lib/dates";
import { connections } from "@/lib/physique/connections";
import { computeExpenditure } from "@/lib/physique/expenditure";
import { findings } from "@/lib/physique/findings";
import { effectKg, referenceLift } from "@/lib/physique/liftEffect";
import { SHOWCASE_REF_END, showcaseScenario, shiftScenario, type ShowcaseScenario } from "@/lib/physique/showcaseData";

/** What Progress reads from the showcase on `today`: the connections, the reference lift and the findings. */
function read(today: string) {
  const sc: ShowcaseScenario = showcaseScenario(today);
  const now = { today, tz: "Europe/London" };
  const goals = sc.goal ? [sc.goal] : [];
  const exp = computeExpenditure({ profile: sc.profile, weighIns: sc.weighIns, foodEntries: sc.foodEntries, dayFlags: sc.dayFlags, goals, workouts: sc.workouts, onboarding: {} }, now);
  const conn = connections({ workouts: sc.workouts, sleepNights: sc.sleepNights, foodEntries: sc.foodEntries, dayFlags: sc.dayFlags, weighIns: sc.weighIns, expenditure: exp?.series ?? null, unit: "kg" }, now);
  const lift = referenceLift(sc.workouts, "kg", now);
  const sleep = conn.items.find((c) => c.id === "sleep" && c.state === "linked");
  const found = findings(
    { weighIns: sc.weighIns, foodEntries: sc.foodEntries, dayFlags: sc.dayFlags, sleepNights: sc.sleepNights, goal: sc.goal, program: sc.program, profile: { sex: sc.profile.sex, age: sc.profile.age, heightCm: sc.profile.heightCm }, workouts: sc.workouts, unit: "kg", sleepConnectionPct: sleep?.diffPct ?? null },
    today
  );
  return { sc, conn, lift, found };
}

describe("showcase data", () => {
  it("ends on the day it is loaded", () => {
    const today = "2026-12-03";
    const { sc } = read(today);
    expect(sc.endDate).toBe(today);
    expect(sc.weighIns.at(-1)?.date).toBe(today);
    expect(Object.keys(sc.dayFlags).every((d) => d <= today)).toBe(true);
  });

  it("leads with sleep, worth several kilos on the squat", () => {
    const { conn, lift } = read(SHOWCASE_REF_END);
    const linked = conn.items.filter((c) => c.state === "linked");
    expect(linked[0]?.id).toBe("sleep");
    expect(lift?.name).toBe("Squat");
    expect(effectKg(linked[0].diffPct, lift!.levelKg)).toBeGreaterThanOrEqual(5);
  });

  it("finds one food link and nothing that wasn't built in", () => {
    const { conn } = read(SHOWCASE_REF_END);
    const linked = conn.items.filter((c) => c.state === "linked").map((c) => c.id);
    expect(linked.filter((id) => id === "carbs" || id === "balance")).toHaveLength(1);
    expect(linked.filter((id) => id !== "sleep" && id !== "carbs" && id !== "balance")).toEqual([]);
    expect(conn.items.find((c) => c.id === "protein")?.state).toBe("none");
  });

  it("catches short sleep on a cut with the lifts down", () => {
    const { found } = read(SHOWCASE_REF_END);
    expect(found.map((f) => f.id)).toContain("sleep-lifts");
  });

  it("reads the same whatever day it is loaded", () => {
    // Time of day is left out: sessions are logged at 18:00 UTC, so a move across a clock change shifts their local hour.
    const links = (today: string) => read(today).conn.items.filter((c) => c.id !== "time").map((c) => [c.id, c.state, c.diffPct]);
    const base = links(SHOWCASE_REF_END);
    for (const n of [1, 3, 6, 40]) expect(links(addDays(SHOWCASE_REF_END, n))).toEqual(base);
  });

  it("moves times with their dates and leaves other strings alone", () => {
    const sc = showcaseScenario(SHOWCASE_REF_END);
    const moved = shiftScenario(sc, 2);
    expect(moved.workouts[0].completedAt).toBe(`${addDays(sc.workouts[0].completedAt.slice(0, 10), 2)}${sc.workouts[0].completedAt.slice(10)}`);
    expect(moved.workouts[0].name).toBe(sc.workouts[0].name);
    expect(moved.rand).toBe(sc.rand);
  });
});
