import { describe, expect, it } from "vitest";
import { mostSevere, physiqueSignalStatus, RULE_STATE, statusFor } from "@/lib/physique/status";
import { analyse, fixedCut, stepLifts } from "@/lib/physique/__tests__/judgeHelpers";

describe("status (02 §8.3 step 4)", () => {
  it("maps rules to states as the spec lists them", () => {
    expect(RULE_STATE["LOSS-3"]).toBe("attention");
    expect(RULE_STATE["SAFE-1"]).toBe("attention");
    expect(RULE_STATE["LOSS-1"]).toBe("watch");
    expect(RULE_STATE["ADH-1"]).toBe("watch");
    expect(RULE_STATE["DATA-HOLD"]).toBe("watch");
    expect(RULE_STATE["ON-TRACK"]).toBe("good");
    expect(RULE_STATE["RECOMP-1"]).toBe("good");
    expect(RULE_STATE["NO-GOAL"]).toBe("unknown");
    expect(RULE_STATE["DATA-RATE"]).toBe("unknown");
    expect(RULE_STATE["PRO-1"]).toBe("watch");
  });

  it("takes the most severe of the primary and the flags, with flag-only rules capped at watch", () => {
    expect(statusFor("ON-TRACK", [])).toEqual({ state: "good", label: "On track" });
    expect(statusFor("ON-TRACK", ["PRO-1"]).state).toBe("watch");
    expect(statusFor("ADH-1", ["LOSS-3"]).state).toBe("attention");
    expect(statusFor("DATA-RATE", ["DATA-EXP"]).state).toBe("unknown");
    expect(statusFor("LOSS-1", []).label).toBe("Slow the cut");
    expect(mostSevere("good", "unknown")).toBe("good");
    expect(mostSevere("watch", "attention")).toBe("attention");
  });

  it("home tile: the analysis state with a short label, 'Review ready' while the review is due", () => {
    expect(physiqueSignalStatus(null)).toEqual({ state: "unknown", status: "No data yet" });
    const a = analyse(fixedCut({ deficit: 1400, lifts: stepLifts(-8, 35, 0) }));
    expect(physiqueSignalStatus({ ...a, checkInDue: false })).toEqual({ state: "watch", status: "Slow the cut" });
    expect(physiqueSignalStatus({ ...a, checkInDue: true })).toEqual({ state: "watch", status: "Review ready" });
  });
});
