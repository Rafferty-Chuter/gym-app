import { describe, expect, it } from "vitest";
import { addDays, dayDiff } from "@/lib/dates";
import { ETA_MAX_WEEKS, goalEta, vsPlanWord } from "@/lib/physique/goalEta";
import type { PhysiqueGoal, WeighIn } from "@/lib/physique/types";

const START = "2026-09-01";

function goal(over: Partial<PhysiqueGoal> = {}): PhysiqueGoal {
  return { id: "g", createdAt: `${START}T08:00:00Z`, type: "lose", startDate: START, startTrendKg: 90, targetKg: 85, ratePctPerWeek: -0.6, ...over } as PhysiqueGoal;
}

/** Daily weigh-ins moving `kgPerDay` from 90 with a small fixed wobble. */
function weighIns(days: number, kgPerDay: number): WeighIn[] {
  return Array.from({ length: days }, (_, d) => ({
    id: `w${d}`,
    date: addDays(START, d),
    loggedAt: `${addDays(START, d)}T07:00:00Z`,
    source: "manual" as const,
    schemaVersion: 1 as const,
    kg: Math.round((90 + kgPerDay * d + (d % 3 === 0 ? 0.2 : d % 3 === 1 ? -0.2 : 0)) * 10) / 10,
  }));
}

describe("goalEta", () => {
  it("is null without a goal, on maintenance, or without weigh-ins", () => {
    expect(goalEta(null, [], {}, START)).toBeNull();
    expect(goalEta(goal({ type: "maintain", ratePctPerWeek: 0 }), weighIns(10, 0), {}, addDays(START, 9))).toBeNull();
    expect(goalEta(goal(), [], {}, START)).toBeNull();
  });

  it("uses the planned rate while the trend has no rate read", () => {
    const today = addDays(START, 2);
    const eta = goalEta(goal(), weighIns(3, -0.08), {}, today);
    expect(eta?.basis).toBe("planned");
    expect(eta?.reason).toBe("early");
    expect(eta?.weighInsNeeded).toBeGreaterThan(0);
    expect(eta?.date).not.toBeNull();
    expect(eta?.planDate).toBe(addDays(START, Math.round((5 / (0.006 * 90)) * 7)));
  });

  it("moves with the observed rate and brackets it with the margin", () => {
    const today = addDays(START, 34);
    const eta = goalEta(goal(), weighIns(35, -0.077), {}, today);
    expect(eta?.basis).toBe("observed");
    expect(eta?.reason).toBeNull();
    expect(eta?.date).not.toBeNull();
    expect(eta?.ratePctPerWeek).toBeLessThan(0);
    const weeks = eta!.weeksLeft!;
    expect(weeks).toBeGreaterThan(2);
    expect(weeks).toBeLessThan(10);
    expect(eta!.earliest! <= eta!.date!).toBe(true);
    expect(eta!.latest == null || eta!.latest >= eta!.date!).toBe(true);
    expect(typeof eta!.daysVsPlan).toBe("number");
    // A slower lifter lands later.
    const slower = goalEta(goal(), weighIns(35, -0.04), {}, today);
    expect(dayDiff(eta!.date!, slower!.date!)).toBeGreaterThan(0);
  });

  it("gives no date when the trend moves away, and flags a crawl", () => {
    const today = addDays(START, 34);
    const away = goalEta(goal(), weighIns(35, 0.05), {}, today);
    expect(away?.reason).toBe("away");
    expect(away?.date).toBeNull();
    const crawl = goalEta(goal({ targetKg: 60 }), weighIns(35, -0.005), {}, today);
    expect(crawl?.reason === "slow" || crawl?.reason === "away").toBe(true);
    if (crawl?.reason === "slow") expect(crawl.weeksLeft!).toBeGreaterThan(ETA_MAX_WEEKS);
  });

  it("reports reached once the trend passes the target", () => {
    const today = addDays(START, 34);
    const eta = goalEta(goal({ targetKg: 89 }), weighIns(35, -0.077), {}, today);
    expect(eta?.reached).toBe(true);
    expect(eta?.date).toBe(today);
  });

  it("words the plan comparison", () => {
    expect(vsPlanWord(null)).toBeNull();
    expect(vsPlanWord(2)).toBe("on plan");
    expect(vsPlanWord(6)).toBe("6 days behind plan");
    expect(vsPlanWord(-15)).toBe("2 weeks ahead of plan");
  });
});
