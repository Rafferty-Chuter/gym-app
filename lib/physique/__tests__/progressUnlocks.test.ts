import { describe, expect, it } from "vitest";
import { addDays } from "@/lib/dates";
import { makeScenario } from "@/lib/physique/fixtures";
import { computeExpenditure } from "@/lib/physique/expenditure";
import { connections } from "@/lib/physique/connections";
import { exampleScenario } from "@/lib/physique/exampleData";
import { progressUnlocks, type UnlockInputs } from "@/lib/physique/progressUnlocks";
import { CONN_MIN_SESSIONS } from "@/lib/physique/connections";
import { MAIN_LIFT_MIN_WEEKS_TRAINED } from "@/lib/physique/strength";
import { INITIAL_HOLD_DAYS, SETTLING_UPDATING_DAYS } from "@/lib/physique/expenditure";

const today = "2026-10-21";
const now = { today, tz: "UTC" };

function inputsOf(sc: ReturnType<typeof makeScenario>): UnlockInputs {
  const n = { today: sc.today, tz: "UTC" };
  const exp = computeExpenditure({ profile: sc.profile, weighIns: sc.weighIns, foodEntries: sc.foodEntries, dayFlags: sc.dayFlags, goals: sc.goal ? [sc.goal] : [], workouts: sc.workouts, onboarding: {} }, n);
  const conn = connections({ workouts: sc.workouts, sleepNights: sc.sleepNights, foodEntries: sc.foodEntries, dayFlags: sc.dayFlags, weighIns: sc.weighIns, expenditure: exp?.series ?? null, unit: "kg" }, n);
  return { goal: sc.goal, weighIns: sc.weighIns, sleepNights: sc.sleepNights, workouts: sc.workouts, expenditure: exp, connections: conn, unit: "kg" };
}

const byId = (u: ReturnType<typeof progressUnlocks>) => Object.fromEntries(u.map((x) => [x.id, x]));

describe("What Progress needs before each part shows (PR5)", () => {
  it("on day one, every part is waiting at zero, with the engine's own minimums", () => {
    const empty: UnlockInputs = { goal: null, weighIns: [], sleepNights: [], workouts: [], expenditure: null, connections: connections({ workouts: [], sleepNights: [], foodEntries: [], dayFlags: {}, weighIns: [], expenditure: null, unit: "kg" }, now), unit: "kg" };
    const u = byId(progressUnlocks(empty, now));
    expect(Object.keys(u)).toEqual(["goal", "weight", "maintenance", "lifts", "sleep", "connections"]);
    for (const x of Object.values(u)) expect(x.done).toBe(false);
    expect(u.weight).toMatchObject({ have: 0, need: 6, unit: "weigh-ins" });
    expect(u.maintenance).toMatchObject({ have: 0, need: INITIAL_HOLD_DAYS + SETTLING_UPDATING_DAYS, unit: "days", etaDays: null });
    expect(u.maintenance.startsOn).toBeUndefined();
    expect(u.lifts).toMatchObject({ have: 0, need: MAIN_LIFT_MIN_WEEKS_TRAINED, unit: "weeks" });
    expect(u.sleep).toMatchObject({ have: 0, need: 7, unit: "nights" });
    expect(u.connections).toMatchObject({ have: 0, need: CONN_MIN_SESSIONS, unit: "sessions" });
  });

  it("ten days in, counts what is there and says roughly how long is left", () => {
    const sc = makeScenario({ seed: 3, days: 10, startDate: addDays(today, -9), bodyweightKg: 85, trueTdeeKcal: 2800, intake: "toTarget", goal: { ratePctPerWeek: -0.5, targetKg: 78 }, sleep: { meanH: 7.1, sdH: 0.4, source: "manual", loggedShare: 1 }, lifts: [{ name: "Squat", startE1rm: 150, profile: "linear", changePct: 0, perWeek: 3, cv: 0.02 }] });
    const u = byId(progressUnlocks(inputsOf(sc), { today: sc.today, tz: "UTC" }));
    expect(u.goal.done).toBe(true);
    expect(u.sleep.done).toBe(true);
    // 10 daily weigh-ins: the count is met, the two weeks are not.
    expect(u.weight).toMatchObject({ done: false, unit: "days", need: 14 });
    expect(u.weight.etaDays).toBe(4);
    expect(u.maintenance.done).toBe(false);
    expect(u.lifts.have).toBeGreaterThanOrEqual(1);
    expect(u.lifts.have).toBeLessThan(MAIN_LIFT_MIN_WEEKS_TRAINED);
    expect(u.connections.done).toBe(false);
    expect(u.connections.etaDays).toBeGreaterThan(21);
  });

  it("counts maintenance from its first day, and says when the starting guess gives way to the log (IN12)", () => {
    const start = addDays(today, -5);
    const sc = makeScenario({ seed: 3, days: 6, startDate: start, bodyweightKg: 79, trueTdeeKcal: 2500, intake: "toTarget", goal: { ratePctPerWeek: -0.5, targetKg: 75 } });
    const inputs = inputsOf(sc);
    const u = byId(progressUnlocks(inputs, { today: sc.today, tz: "UTC" }));
    expect(inputs.expenditure?.maturity.updatingDays).toBe(0);
    expect(u.maintenance).toMatchObject({ done: false, have: 6, need: INITIAL_HOLD_DAYS + SETTLING_UPDATING_DAYS, etaDays: INITIAL_HOLD_DAYS + SETTLING_UPDATING_DAYS - 6, startsOn: addDays(inputs.expenditure!.seed.date, INITIAL_HOLD_DAYS) });
    // Ten days in, it has started moving: the hold's 7 days plus the updating days, and no start date.
    const later = byId(progressUnlocks(inputsOf(makeScenario({ seed: 3, days: 10, startDate: addDays(today, -9), bodyweightKg: 79, trueTdeeKcal: 2500, intake: "toTarget", goal: { ratePctPerWeek: -0.5, targetKg: 75 } })), now));
    expect(later.maintenance.have).toBeGreaterThan(INITIAL_HOLD_DAYS);
    expect(later.maintenance.startsOn).toBeUndefined();
  });

  it("with the 16-week example, everything is ready", () => {
    const u = progressUnlocks(inputsOf(exampleScenario(today)), now);
    expect(u.filter((x) => !x.done).map((x) => x.id)).toEqual([]);
  });
});
