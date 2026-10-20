import { describe, expect, it } from "vitest";
import { formatPhysiqueContextBlock, PHYSIQUE_BLOCK_MAX_CHARS, validatePhysiquePayload } from "@/lib/assistantPhysiqueContext";
import type { AssistantPhysiquePayload } from "@/lib/physique/payload";
import type { RuleId } from "@/lib/physique/types";

function maximalPayload(): AssistantPhysiquePayload {
  const days = Array.from({ length: 14 }, (_, i) => -13 + i);
  const verdict = (id: RuleId) => ({
    id,
    title: "Losing faster than planned and lifts are dropping",
    detail:
      "Losing 1.52 %/wk over 28 days (24 weigh-ins), against a 1.00 %/wk goal, while eating within 40 kcal of target; squat and bench are down 8.1% and 7.6% since the cut began. A 1.0 %/wk goal is above the range that protects strength.",
    windowDays: 28,
    n: 24,
    evidenceIds: ["helms2014", "garthe2011", "hall2011"],
    confidence: "high" as const,
  });
  return {
    now: { today: "2026-10-17", tz: "Europe/London" },
    analysis: {
      asOf: "2026-10-17",
      phase: "lose",
      data: { weighIns14: 14, loggedShare14: 0.93, nightsLogged14: 13, expenditureState: "stable", partialDaysLeftOut: ["2026-10-10", "2026-10-12"], updatingDays: 44 },
      weight: { trendKg: 85.43, latestKg: 85.1, ratePctPerWeek: -1.52, rateWindowDays: 28, rateN: 24, margin: 0.31, weighInsNeeded: 0 },
      expenditure: { kcal: 3312, state: "stable", plusMinus: 300 },
      targets: { kcal: 2340, proteinG: 185, fatG: 70, carbsG: 242 },
      adherence: { deltaKcal: -38, onTarget: true, proteinGPerKg: 2.1, daysLogged: 13 },
      strength: {
        status: "dropping",
        lifts: [
          { name: "Barbell Back Squat", changePct: -8.1 },
          { name: "Barbell Bench Press", changePct: -7.6 },
          { name: "Romanian Deadlift", changePct: -2.2 },
          { name: "Overhead Press", changePct: null },
        ],
        baselineMissing: false,
        strOk: false,
        mainLifts: 4,
        liftsRead: 3,
      },
      sleep: { mean14h: 7.05, nightsLogged14: 13, status: "ok", acute: true, source: "manual", debt7h: 2.5, lastNightH: 5.9, sleepOk: true },
      training: { status: "intermediate", source: "lifts", medianSlopePctPerWeek: 0.4 },
      goal: { id: "g", createdAt: "2026-09-01T00:00:00Z", type: "lose", startDate: "2026-09-01", startTrendKg: 90.2, targetKg: 80, ratePctPerWeek: -1.0, trainingStatusAtCreation: "intermediate", schemaVersion: 1 },
      verdict: verdict("LOSS-1"),
      flags: [verdict("STR-1"), verdict("SLEEP-2"), verdict("DATA-PARTIAL")],
      recommendation: { kind: "change_rate", fromPctPerWeek: -1.0, toPctPerWeek: -0.6, kcalDeltaAtCurrentBW: 410 },
      recommendationLabel: "Ease goal to 0.6 %/wk (about +410 kcal/day)",
      status: { state: "attention", label: "Slow the cut" },
      checkInDue: true,
      rules: { fired: ["LOSS-1", "STR-1"], suppressed: [] },
    },
    recent: {
      weighIns: days.map((d) => ({ d, kg: 85 + d * 0.15 })),
      intake: days.map((d) => ({ d, kcal: 2300 + d * 7, p: 180, status: d % 5 === 0 ? ("partial" as const) : ("complete" as const) })),
      sleep: days.map((d) => ({ d, h: 7 + (d % 3) * 0.3 })),
      lifts: [
        { name: "Barbell Back Squat", e1rm: [{ d: -9, kg: 170.2 }, { d: -5, kg: 161.4 }, { d: -1, kg: 156.3 }] },
        { name: "Barbell Bench Press", e1rm: [{ d: -8, kg: 120.4 }, { d: -4, kg: 112.1 }, { d: 0, kg: 111.2 }] },
        { name: "Romanian Deadlift", e1rm: [{ d: -10, kg: 180.0 }, { d: -3, kg: 176.5 }, { d: -1, kg: 176.1 }] },
        { name: "Overhead Press", e1rm: [{ d: -7, kg: 70.1 }, { d: -2, kg: 69.8 }, { d: 0, kg: 69.5 }] },
      ],
      goal: { type: "lose", targetKg: 80, ratePctPerWeek: -1.0, startDate: "2026-09-01" },
      targets: { kcal: 2340, proteinG: 185, fatG: 70, carbsG: 242, since: "2026-10-13" },
    },
  };
}

describe("assistant physique context (I2)", () => {
  it("the block stays under the budget for the largest valid payload", () => {
    const block = formatPhysiqueContextBlock(maximalPayload());
    expect(block.length, `block was ${block.length} chars`).toBeLessThanOrEqual(PHYSIQUE_BLOCK_MAX_CHARS);
    expect(block).toContain("VERDICT LOSS-1");
    expect(block).toContain("rate -1.52 %/wk over 28 d (24 weigh-ins");
    expect(block).toContain("RECOMMENDATION: Ease goal");
  });

  it("validates a valid payload without changing its verdict, and rejects malformed ones", () => {
    const ok = validatePhysiquePayload(maximalPayload());
    expect(ok.ok).toBe(true);
    if (ok.ok) {
      expect(ok.payload.analysis.verdict.id).toBe("LOSS-1");
      expect(ok.payload.analysis.weight.ratePctPerWeek).toBe(-1.52);
    }
    expect(validatePhysiquePayload({ analysis: {}, now: {} }).ok).toBe(false);
    expect(validatePhysiquePayload({ ...maximalPayload(), now: { today: "17/10/2026", tz: "x" } }).ok).toBe(false);
    const bad = maximalPayload();
    (bad.analysis as unknown as { verdict: unknown }).verdict = { id: "LOSS-1" };
    expect(validatePhysiquePayload(bad).ok).toBe(false);
    expect(validatePhysiquePayload("nope").ok).toBe(false);
    const huge = maximalPayload();
    (huge.recent as unknown as { blob: string }).blob = "x".repeat(70_000);
    expect(validatePhysiquePayload(huge).ok).toBe(false);
  });
});
