import { describe, expect, it } from "vitest";
import { exampleBundle } from "@/lib/physique/exampleData";
import { connections } from "@/lib/physique/connections";
import { spottedFor } from "@/lib/physique/spottedFor";

const NOW = { today: "2026-10-22", tz: "UTC" };

describe("Spotted from the records (IN11)", () => {
  it("says nothing with nothing logged", () => {
    expect(spottedFor({ weighIns: [], foodEntries: [], dayFlags: {}, sleepNights: [], workouts: [], goal: null, program: null, expenditure: null, profile: {} }, NOW, "kg")).toEqual([]);
  });

  it("reads the example person as the report would, and reuses reads it is handed", () => {
    const { scenario: sc, expenditure } = exampleBundle(NOW, "kg");
    const sources = { ...sc, expenditure: expenditure?.series ?? null, profile: sc.profile };
    const out = spottedFor(sources, NOW, "kg");
    expect(out.length).toBeGreaterThan(0);
    expect(out.length).toBeLessThanOrEqual(3);
    const conn = connections({ workouts: sc.workouts, sleepNights: sc.sleepNights, foodEntries: sc.foodEntries, dayFlags: sc.dayFlags, weighIns: sc.weighIns, expenditure: expenditure?.series ? [...expenditure.series] : null, unit: "kg" }, NOW);
    expect(spottedFor(sources, NOW, "kg", { connections: conn }).map((s) => s.key)).toEqual(out.map((s) => s.key));
  });
});
