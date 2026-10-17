import { describe, expect, it } from "vitest";
import { ACCUMULATION_WEEKS, deloadSets, deloadSuggestion, liftsDownOnLastWeek, readDeload, weeksAccumulated } from "@/lib/training/deload";
import type { StoredWorkout } from "@/lib/trainingAnalysis";

const now = { today: "2026-10-17", tz: "UTC" } as const;
const iso = (daysAgo: number) => new Date(Date.UTC(2026, 9, 17 - daysAgo, 18, 0, 0)).toISOString();
const sets = (w: number, r: number, n = 4) => Array.from({ length: n }, () => ({ weight: String(w), reps: String(r), rir: 2 }));
/** Two sessions a week for `weeks` weeks, newest first; `scale` lets a week run lighter or weaker. */
function history(weeks: number, opts: { lastWeekFactor?: number; lastWeekSets?: number } = {}): StoredWorkout[] {
  const out: StoredWorkout[] = [];
  for (let w = 0; w < weeks; w++) {
    const f = w === 0 ? (opts.lastWeekFactor ?? 1) : 1;
    const n = w === 0 ? (opts.lastWeekSets ?? 4) : 4;
    out.push({ completedAt: iso(w * 7 + 1), name: "Upper", exercises: [ { name: "Bench Press", sets: sets(80 * f, 8, n) }, { name: "Weighted Chin-Up", sets: sets(10 * f, 8, n) }, { name: "Overhead Press", sets: sets(50 * f, 8, n) } ] });
    out.push({ completedAt: iso(w * 7 + 3), name: "Lower", exercises: [ { name: "Back Squat", sets: sets(110 * f, 6, n) }, { name: "Romanian Deadlift", sets: sets(100 * f, 8, n) } ] });
  }
  return out;
}

describe("deloads", () => {
  it("counts the weeks trained since the last deload or week off", () => {
    expect(weeksAccumulated(history(3), now, null)).toBe(3);
    // A week off two weeks back ends the count.
    const gap = history(5).filter((w) => { const d = (Date.parse(now.today + "T00:00:00Z") - Date.parse(w.completedAt)) / 86_400_000; return !(d >= 14 && d < 21); });
    expect(weeksAccumulated(gap, now, null)).toBe(2);
    // A started deload ends it too.
    expect(weeksAccumulated(history(6), now, { startDate: "2026-09-26", reason: "manual", startedAt: iso(21) })).toBe(2);
  });

  it("is due on schedule by training status and silent before two weeks", () => {
    expect(readDeload({ workouts: history(1), unit: "kg", now, status: "intermediate", record: null })).toEqual({ state: "early" });
    const r = readDeload({ workouts: history(ACCUMULATION_WEEKS.intermediate), unit: "kg", now, status: "intermediate", record: null });
    expect(r).toMatchObject({ state: "due", reason: "scheduled", weeksAccumulated: 5 });
    const n = readDeload({ workouts: history(3), unit: "kg", now, status: "intermediate", record: null });
    expect(n).toMatchObject({ state: "none", weeksAccumulated: 3, weeksUntilDue: 2 });
    expect(readDeload({ workouts: history(4), unit: "kg", now, status: "advanced", record: null }).state).toBe("due");
  });

  it("triggers early when most lifts could not match last week, with a gate", () => {
    const weak = history(3, { lastWeekFactor: 0.95 });
    expect(liftsDownOnLastWeek(weak, "kg", now)).toEqual({ down: 5, compared: 5 });
    expect(readDeload({ workouts: weak, unit: "kg", now, status: "intermediate", record: null })).toMatchObject({ state: "due", reason: "triggered", liftsDown: 5, liftsCompared: 5 });
    // Within the 1.5 % band nothing is down.
    const same = history(3, { lastWeekFactor: 0.99 });
    expect(liftsDownOnLastWeek(same, "kg", now).down).toBe(0);
  });

  it("is active for seven days from its start and prescribes a light week", () => {
    const r = readDeload({ workouts: history(5), unit: "kg", now, status: "intermediate", record: { startDate: "2026-10-14", reason: "scheduled", startedAt: iso(3) } });
    expect(r).toMatchObject({ state: "active", startDate: "2026-10-14", endDate: "2026-10-20", daysLeft: 3 });
    expect(deloadSets(4)).toBe(2);
    expect(deloadSets(1)).toBe(1);
    expect(deloadSuggestion({ kind: "next", loadKg: 100, reps: 8, rir: 2, e1rmKg: 120 }, "barbell")).toMatchObject({ loadKg: 90, reps: 8, rir: 4 });
    expect(deloadSuggestion({ kind: "early", sessions: 1 }, "barbell")).toEqual({ kind: "early", sessions: 1 });
  });
});
