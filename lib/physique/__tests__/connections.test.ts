import { describe, expect, it } from "vitest";
import { addDays } from "@/lib/dates";
import { CONN_MIN_GROUP, compareThirds, connections, sessionStrength, type ConnectionInputs } from "@/lib/physique/connections";
import type { SleepNight } from "@/lib/physique/types";
import type { StoredWorkout } from "@/lib/trainingAnalysis";

const today = "2026-10-21";
const now = { today, tz: "UTC" };

/** Seeded uniform in [0, 1). */
function rng(seed: number) {
  let s = seed >>> 0;
  return () => {
    s = (s * 1664525 + 1013904223) >>> 0;
    return s / 2 ** 32;
  };
}

/**
 * Sixteen weeks of squat and bench three days a week (Mon, Wed, Fri), each
 * lift's top set progressing slowly with 1.5% noise, and a night of sleep
 * before every day. `sleepEffectPct` is how much weaker a session is after
 * a night under 6.5 hours.
 */
function history(seed: number, sleepEffectPct: number): ConnectionInputs {
  const r = rng(seed);
  const workouts: StoredWorkout[] = [];
  const sleepNights: SleepNight[] = [];
  const start = addDays(today, -111);
  for (let d = 0; d < 112; d++) {
    const date = addDays(start, d);
    const hours = 5.6 + r() * 2.8;
    sleepNights.push({ id: `n-${date}`, date, asleepMin: Math.round(hours * 60), source: "manual", loggedAt: `${date}T08:00:00.000Z`, schemaVersion: 1 } as SleepNight);
    const dow = new Date(`${date}T12:00:00Z`).getUTCDay();
    if (dow !== 1 && dow !== 3 && dow !== 5) continue;
    const short = hours < 6.5 ? 1 - sleepEffectPct / 100 : 1;
    const lift = (base: number) => {
      const level = base * (1 + 0.0004 * d);
      const noise = 1 + (r() - 0.5) * 0.03;
      return Math.round(level * noise * short * 2) / 2;
    };
    workouts.push({
      completedAt: `${date}T18:00:00.000Z`,
      name: "Full body",
      exercises: [
        { name: "Squat", sets: [{ weight: String(lift(120)), reps: "5" }] },
        { name: "Bench Press", sets: [{ weight: String(lift(90)), reps: "5" }] },
      ],
    });
  }
  return { workouts, sleepNights, foodEntries: [], dayFlags: {}, weighIns: [], unit: "kg" };
}

describe("Connections (L1)", () => {
  it("reads each session against the lift's own level, so steady progress is not a difference", () => {
    const h = history(1, 0);
    const s = sessionStrength(h.workouts, "kg", now, addDays(today, -111));
    expect(s.length).toBeGreaterThan(40);
    const avg = s.reduce((a, x) => a + x.pct, 0) / s.length;
    expect(Math.abs(avg)).toBeLessThan(0.5);
  });

  it("finds a 5% cost of short nights, with both groups' numbers in one factual sentence", () => {
    const res = connections(history(2, 5), now);
    const sleep = res.items.find((c) => c.id === "sleep");
    expect(sleep?.state).toBe("linked");
    expect(sleep!.diffPct).toBeGreaterThan(2.5);
    expect(sleep!.text).toMatch(/^After your longest nights \(\d+h \d+m on average\), your lifts were \d+\.\d% stronger than after your shortest \(\d+h \d+m\)\.$/);
    expect(sleep!.text).not.toMatch(/should|try|aim|get more|fix/i);
  });

  it("says no clear difference when sleep has no effect, across many seeds", () => {
    let linked = 0;
    for (let seed = 10; seed < 40; seed++) {
      const sleep = connections(history(seed, 0), now).items.find((c) => c.id === "sleep");
      expect(sleep).toBeDefined();
      if (sleep!.state === "linked") linked += 1;
    }
    expect(linked).toBeLessThanOrEqual(1);
  });

  it("stays silent with too few sessions, and leaves out conditions that were never recorded", () => {
    const h = history(3, 5);
    const short = { ...h, workouts: h.workouts.slice(-12) };
    expect(connections(short, now).items).toEqual([]);
    const ids = connections(h, now).items.map((c) => c.id);
    expect(ids).not.toContain("calories");
    expect(ids).not.toContain("hrv");
  });

  it("compares thirds only when they separate and each holds the minimum", () => {
    const tied = Array.from({ length: 3 * CONN_MIN_GROUP + 3 }, (_, i) => ({ pct: i % 2, v: 2 }));
    expect(compareThirds(tied)).toBeNull();
    const few = Array.from({ length: 3 * CONN_MIN_GROUP - 1 }, (_, i) => ({ pct: 0, v: i }));
    expect(compareThirds(few)).toBeNull();
    const ok = Array.from({ length: 3 * CONN_MIN_GROUP }, (_, i) => ({ pct: i < CONN_MIN_GROUP ? -3 : 3, v: i }));
    const c = compareThirds(ok);
    expect(c?.low).toHaveLength(CONN_MIN_GROUP);
    expect(c?.diff).toBeCloseTo(6, 5);
  });
});
