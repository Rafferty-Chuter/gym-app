import { describe, expect, it } from "vitest";
import { makeScenario } from "@/lib/physique/fixtures";
import { BANNED_PHRASES, bannedPhrasesIn, fmtDrop, fmtHours, fmtKcalDelta, fmtRate, fmtWindow, recommendationLabel, STATUS_LABEL, verdictCopy, type VerdictFacts } from "@/lib/physique/copy";
import { RULE_EVIDENCE } from "@/lib/physique/evidence";
import type { PhysiqueAnalysis, Recommendation, RuleId } from "@/lib/physique/types";
import { analyse, fixedBulk, fixedCut, FLAT_LIFTS, runRow, SCENARIO_TABLE, stepLifts } from "@/lib/physique/__tests__/judgeHelpers";

const ALL_RULES = Object.keys(RULE_EVIDENCE) as RuleId[];

/** Every string the UI could show from an analysis. */
function textsOf(a: PhysiqueAnalysis): string[] {
  const out = [a.verdict.title, a.verdict.detail, a.status.label, a.recommendationLabel ?? ""];
  for (const f of a.flags) out.push(f.title, f.detail);
  return out;
}

function expectClean(text: string, where: string) {
  const hits = bannedPhrasesIn(text);
  expect(hits, `${where}: "${text}" contains ${hits.join(", ")}`).toEqual([]);
  expect(text, `${where}: em dash`).not.toContain("—");
}

describe("banned-phrase linter (02 §10)", () => {
  it("matches case-insensitive substrings, '!' and REM as a case-sensitive whole word only", () => {
    expect(bannedPhrasesIn("You are Losing Muscle")).toEqual(["losing muscle"]);
    expect(bannedPhrasesIn("Great job!")).toEqual(["great job", "!"]);
    expect(bannedPhrasesIn("Fat loss has stalled")).toEqual(["fat loss has stalled"]);
    expect(bannedPhrasesIn("Low REM sleep")).toEqual(["REM"]);
    expect(bannedPhrasesIn("the remaining weeks; a remedy; rem")).toEqual([]);
    expect(bannedPhrasesIn("Weight loss has stalled")).toEqual([]);
    expect(bannedPhrasesIn("Lifts are dropping")).toEqual([]);
    expect(BANNED_PHRASES).toContain("reverse diet");
  });

  it("every fixture scenario's verdict, flags, label and recommendation row are clean", () => {
    for (const row of SCENARIO_TABLE) {
      for (const a of runRow(row, 25).analyses) for (const t of textsOf(a)) expectClean(t, `${row.name} / ${a.verdict.id}`);
    }
    const extra = [
      analyse(fixedCut({ deficit: 1400, lifts: stepLifts(-8, 35, 0) })),
      analyse(fixedCut({ deficit: 2200, days: 49, lifts: stepLifts(-8, 35, 0) })),
      analyse(fixedCut({ deficit: 1000, targetKg: 84, lifts: stepLifts(-8, 35, 0) })),
      analyse(fixedCut({ deficit: 1300, lifts: FLAT_LIFTS })),
      analyse(fixedCut({ deficit: 1300 })),
      analyse(fixedCut({ deficit: 0, goalRate: -0.6 })),
      analyse(fixedCut({ deficit: 0, goalRate: -0.6, lifts: stepLifts(4, 21, 0) })),
      analyse(fixedCut({ deficit: 1000, sleep: { meanH: 6.3, sdH: 0.3, source: "manual" } })),
      analyse(fixedBulk({ surplus: 600, waist: { startCm: 85, changeCm: 8 } })),
      analyse(fixedBulk({ surplus: 0, goalRate: 0.35, lifts: FLAT_LIFTS })),
      analyse(fixedBulk({ surplus: 0, goalRate: 0.35, lifts: stepLifts(4, 21, 0) })),
      analyse(makeScenario({ seed: 1, days: 30, bodyweightKg: 85, trueTdeeKcal: 2800, goal: null })),
    ];
    for (const a of extra) for (const t of textsOf(a)) expectClean(t, a.verdict.id);
  });

  it("every rule's copy is clean in each variant, with every number supplied", () => {
    const base: VerdictFacts = {
      phase: "lose",
      goalRate: -1.0,
      rate: { ratePctPerWeek: -1.5, windowDays: 28, n: 24 },
      strength: "holding",
      lifts: [
        { name: "Squat", changePct: -8 },
        { name: "Bench Press", changePct: -3.6 },
      ],
      adherent: true,
      adherenceDeltaKcal: -320,
      sleepMeanH: 6.07,
      sleepNights: 14,
      sleepIntakeDiffKcal: 300,
      proteinGPerKg: 1.5,
      proteinTargetG: 165,
      proteinWeeksLow: 2,
      fatGPerKg: 0.4,
      fatShare: 0.12,
      waistDeltaCm: -2.4,
      waistWeeks: 4,
      weighInsNeeded: 6,
      updatingDays: 8,
      foodDaysNeeded: 2,
      weighInNeeded: true,
      partialDays: [
        { date: "2026-09-15", kcal: 640 },
        { date: "2026-09-17", kcal: 900 },
      ],
      trendKg: 84.6,
      targetKg: 58,
      floorKcal: 1500,
      bmiTarget: 17.9,
      phaseAgeDays: 42,
      intakeDropShare: 0.18,
    };
    const recs: Array<Recommendation | null> = [
      null,
      { kind: "change_rate", fromPctPerWeek: -1.0, toPctPerWeek: -0.6, kcalDeltaAtCurrentBW: 397 },
      { kind: "refresh_targets", fromKcal: 2100, toKcal: 2400 },
    ];
    const variants: Array<Partial<VerdictFacts>> = [
      {},
      { goalOutOfRange: true },
      { nearGoal: true },
      { advanced: true, phase: "gain", goalRate: 0.75, rate: { ratePctPerWeek: 0.75, windowDays: 42, n: 40 }, lifts: [{ name: "Squat", changePct: 3 }, { name: "Row", changePct: 4 }] },
      { phase: "maintain", strength: "rising" },
      { safeReason: "rate" },
      { adherent: false, strength: "unclear", lifts: [] },
      { partialDays: [{ date: "2026-09-15", kcal: 640 }], weighInsNeeded: 1, foodDaysNeeded: 0 },
    ];
    for (const id of ALL_RULES) {
      for (const v of variants) {
        for (const recommendation of recs) {
          const copy = verdictCopy(id, { ...base, ...v, recommendation });
          expect(copy.title.length, id).toBeGreaterThan(0);
          expect(copy.detail.length, id).toBeGreaterThan(0);
          expectClean(copy.title, `${id} title`);
          expectClean(copy.detail, `${id} detail`);
          expect(copy.detail, `${id}: unformatted number`).not.toMatch(/\d\.\d{3,}/);
          expect(copy.detail, `${id}: NaN or undefined`).not.toMatch(/NaN|undefined|null/);
        }
      }
      expectClean(STATUS_LABEL[id], `${id} status label`);
    }
  });

  it("every recommendation kind has a clean row label", () => {
    const all: Recommendation[] = [
      { kind: "change_rate", fromPctPerWeek: -1.0, toPctPerWeek: -0.6, kcalDeltaAtCurrentBW: 397 },
      { kind: "change_rate", fromPctPerWeek: 0.75, toPctPerWeek: 0.25, kcalDeltaAtCurrentBW: -441 },
      { kind: "change_rate", fromPctPerWeek: 0.1, toPctPerWeek: 0.2, kcalDeltaAtCurrentBW: 88 },
      { kind: "refresh_targets", fromKcal: 2100, toKcal: 2400 },
      { kind: "refresh_targets", fromKcal: 2400, toKcal: 2250 },
      { kind: "eat_to_target", deltaKcal: -320 },
      { kind: "eat_to_target", deltaKcal: 280 },
      { kind: "protein", toG: 165 },
      { kind: "sleep", targetHours: 7.5 },
      { kind: "sleep", targetHours: 8 },
      { kind: "diet_break", weeks: 1 },
      { kind: "maintenance_first", weeks: 2 },
      { kind: "log_more", what: "weight", needed: 6 },
      { kind: "log_more", what: "food", needed: 1 },
      { kind: "log_more", what: "sleep", needed: 3 },
      { kind: "log_more", what: "waist", needed: 4 },
      { kind: "confirm_days", dates: ["2026-09-15", "2026-09-17"] },
      { kind: "pause_and_seek_help" },
    ];
    for (const rec of all) {
      const label = recommendationLabel(rec);
      expect(label, rec.kind).not.toBeNull();
      expectClean(label!, rec.kind);
    }
    expect(recommendationLabel(all[0])).toBe("Ease goal to 0.6 %/wk (about +400 kcal/day)");
    expect(recommendationLabel(all[1])).toBe("Ease goal to 0.25 %/wk (about −440 kcal/day)");
    expect(recommendationLabel(all[3])).toBe("Update targets now (+300 kcal/day)");
    expect(recommendationLabel(all[5])).toBe("Eat to target (about 320 kcal/day more)");
    expect(recommendationLabel(null)).toBeNull();
  });
});

describe("formatting", () => {
  it("formats rates, windows, kcal deltas, hours and lift drops", () => {
    expect(fmtRate(-0.6)).toBe("0.6");
    expect(fmtRate(-1.52)).toBe("1.5");
    expect(fmtRate(0.24)).toBe("0.24");
    expect(fmtWindow(28, 24)).toBe("over 28 days (24 weigh-ins)");
    expect(fmtWindow(14, 1)).toBe("over 14 days (1 weigh-in)");
    expect(fmtKcalDelta(397)).toBe("+400");
    expect(fmtKcalDelta(-154)).toBe("−150");
    expect(fmtKcalDelta(3)).toBe("0");
    expect(fmtHours(6.07)).toBe("6h04m");
    expect(fmtHours(8)).toBe("8h00m");
    expect(fmtDrop([-8, -8.4])).toBe("down 8%");
    expect(fmtDrop([-3.2, -4.4])).toBe("down 3 to 4%");
  });

  it("copy matches the design library examples", () => {
    // Z3: facts only, no advice.
    expect(verdictCopy("NO-GOAL", { phase: "none" })).toEqual({ title: "No goal set", detail: "Add a target weight in Body to read the trend against it." });
    expect(verdictCopy("DATA-EXP", { phase: "lose", updatingDays: 8 }).detail).toBe("Maintenance estimate: day 9 of about 21.");
    expect(verdictCopy("DATA-HOLD", { phase: "lose", foodDaysNeeded: 2 }).detail).toBe("Targets update after 2 more days of food this week.");
    const partial = verdictCopy("DATA-PARTIAL", { phase: "lose", partialDays: [{ date: "2026-09-15", kcal: 640 }, { date: "2026-09-17", kcal: 900 }] });
    expect(partial.title).toBe("Confirm two days");
    expect(partial.detail).toBe("Tue and Thu look incomplete (640 and 900 kcal). Confirm them first.");
    expect(verdictCopy("ON-TRACK", { phase: "lose", strength: "holding", rate: { ratePctPerWeek: -0.6, windowDays: 28, n: 24 } }).detail).toBe("Losing 0.6 %/wk over 28 days (24 weigh-ins), lifts holding.");
    expect(verdictCopy("ADH-1", { phase: "lose", adherenceDeltaKcal: -320 })).toEqual({ title: "320 kcal under target", detail: "On average over the last 14 days." });
    expect(verdictCopy("SLEEP-1", { phase: "lose", sleepMeanH: 6.07, sleepNights: 14, lifts: [{ name: "Squat", changePct: -3 }, { name: "Bench", changePct: -4 }] }).detail).toBe(
      "Averaging 6h04m over 14 nights, and Squat and Bench are down 3 to 4%."
    );
  });
});
