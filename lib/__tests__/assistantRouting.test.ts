import { describe, expect, it } from "vitest";
import { classifyAssistantQuestionKind, isPhysiqueQuestion } from "@/lib/assistantQuestionRouting";
import { applyStrictIntentLock, computeStrictIntentLock } from "@/lib/assistantStrictIntentLock";

function route(m: string) {
  return applyStrictIntentLock(classifyAssistantQuestionKind(m), computeStrictIntentLock(m));
}

const PHYSIQUE = [
  "how long until I hit 90kg?",
  "is my cut working?",
  "am I losing weight too fast?",
  "should I eat more calories on training days",
  "why has my weight stalled for two weeks",
  "how much protein should I be eating on this cut",
  "is my deficit too big",
  "when will I reach 80 kg at this rate",
  "my sleep has been bad, is that why the scale isn't moving",
  "what should my macros be for a lean bulk",
  "is 0.5% a week a sensible rate to lose",
];

const BENCH = [
  "when can I expect to bench 120kg?",
  "what's my estimated 1rm on bench",
  "how long until I hit 100 kg on bench press",
  "based on my recent bench sessions when will I hit 110kg",
  "is my bench progressing or has it plateaued",
];

describe("physique routing (I2)", () => {
  it.each(PHYSIQUE)("'%s' routes to physique_progress", (m) => {
    expect(isPhysiqueQuestion(m)).toBe(true);
    expect(route(m)).toBe("physique_progress");
  });

  it.each(BENCH)("'%s' still routes to the bench path", (m) => {
    expect(isPhysiqueQuestion(m)).toBe(false);
    expect(["projection_estimate", "exercise_progression", "progression_readiness_path", "coaching_recommendation"]).toContain(route(m));
  });

  it("a general training question never becomes physique", () => {
    expect(isPhysiqueQuestion("what rep range is best for hypertrophy")).toBe(false);
    expect(route("what rep range is best for hypertrophy")).not.toBe("physique_progress");
    expect(route("how much volume for chest per week")).not.toBe("physique_progress");
  });
});
