// @vitest-environment happy-dom
import { beforeEach, describe, expect, it } from "vitest";
import { commitImportedWorkouts } from "@/lib/csvImport";

describe("re-importing supplies the start a pre-IN1 import lacked (IN1)", () => {
  beforeEach(() => localStorage.clear());

  it("fills startedAt on the stored duplicate and adds nothing", () => {
    const sets = [{ name: "Squat", sets: [{ weight: "140", reps: "5" }] }];
    localStorage.setItem("workoutHistory", JSON.stringify([{ completedAt: "2026-10-14T18:00:00.000Z", name: "Legs", durationSec: 4200, exercises: sets }]));
    const r = commitImportedWorkouts([{ completedAt: "2026-10-14T18:00:00.000Z", startedAt: "2026-10-14T18:00:00.000Z", name: "Legs", durationSec: 4200, exercises: sets }], "append");
    expect(r).toMatchObject({ written: 0, duplicatesSkipped: 1, total: 1 });
    expect(JSON.parse(localStorage.getItem("workoutHistory")!)[0].startedAt).toBe("2026-10-14T18:00:00.000Z");
  });
});
