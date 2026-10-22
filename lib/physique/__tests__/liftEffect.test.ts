import { describe, expect, it } from "vitest";
import { addDays } from "@/lib/dates";
import { effectKg, formatEffect, referenceLift } from "@/lib/physique/liftEffect";
import type { StoredWorkout } from "@/lib/trainingAnalysis";

const today = "2026-10-21";
const now = { today, tz: "UTC" };

/** Eight weeks of sessions: each lift on the given weekdays (0 = Sunday) at a steady top set of 5 reps. */
function weeks(lifts: Array<{ name: string; kg: number; days: number[] }>): StoredWorkout[] {
  const out: StoredWorkout[] = [];
  for (let d = 0; d < 56; d++) {
    const date = addDays(today, -55 + d);
    const dow = new Date(`${date}T12:00:00Z`).getUTCDay();
    const exercises = lifts.filter((l) => l.days.includes(dow)).map((l) => ({ name: l.name, sets: [{ weight: String(l.kg), reps: "5" }] }));
    if (exercises.length) out.push({ completedAt: `${date}T18:00:00.000Z`, name: "Session", exercises });
  }
  return out;
}

describe("A connection in kg on a lift (PR3)", () => {
  it("uses the main lift trained most, its level from the last six weeks", () => {
    const w = weeks([
      { name: "Squat", kg: 140, days: [1] },
      { name: "Bench Press", kg: 100, days: [1, 3, 5] },
    ]);
    const lift = referenceLift(w, "kg", now);
    expect(lift?.name).toBe("Bench Press");
    // 100 kg for 5 reps is an estimated 1RM a little over 110 kg.
    expect(lift!.levelKg).toBeGreaterThan(105);
    expect(lift!.levelKg).toBeLessThan(120);
  });

  it("on a tie, uses the heaviest, where the same share is the most kilos", () => {
    const w = weeks([
      { name: "Bench Press", kg: 100, days: [1, 4] },
      { name: "Squat", kg: 140, days: [1, 4] },
    ]);
    expect(referenceLift(w, "kg", now)?.name).toBe("Squat");
  });

  it("is null without main lifts", () => {
    expect(referenceLift([], "kg", now)).toBeNull();
  });

  it("turns a difference in percent into kilos on that level", () => {
    expect(effectKg(2.7, 154)).toBeCloseTo(4.158, 3);
    expect(effectKg(-2, 100)).toBeCloseTo(-2, 6);
  });

  it("rounds to half a kilo, or a whole pound, with its sign", () => {
    expect(formatEffect(3.4, "kg")).toBe("+3.5 kg");
    expect(formatEffect(4.158, "kg")).toBe("+4 kg");
    expect(formatEffect(-2.2, "kg")).toBe("−2 kg");
    expect(formatEffect(4.158, "lb")).toBe("+9 lb");
    expect(formatEffect(0.1, "kg")).toBe("0 kg");
  });
});
