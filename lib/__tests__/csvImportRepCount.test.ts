import { describe, expect, it } from "vitest";
import { detectFormat, parseImportCsv } from "@/lib/csvImport";

const SAMPLE = `Workout Start,Workout End,Exercise,Weight,Reps,Notes,Kcal,Distance,Duration,Category,Name,Bodyweight
2026-10-16 18:01,2026-10-16 18:34,"Pull Up",0,9,"",,,,"Back","Pull",
2026-10-16 18:01,2026-10-16 18:34,"Pull Up",0,7,"",,,,"Back","Pull",
2026-10-16 18:01,2026-10-16 18:34,"Upper Back Row",40.5,8,"",,,,"Back","Pull",
2026-10-16 18:01,2026-10-16 18:34,"Upper Back Row",40.5,8,"",,,,"Back","Pull",
2026-10-16 18:01,2026-10-16 18:34,"Dumbbell Bicep Curl",10,9,"",,,,"Biceps","Pull",
2026-10-16 18:01,2026-10-16 18:34,"Dumbbell Bicep Curl",12.5,5,"",,,,"Biceps","Pull",
2026-10-16 18:01,2026-10-16 18:34,"Reverse curls",,,"",,,,"Biceps","Pull",
2026-10-16 18:01,2026-10-16 18:34,"Reverse curls",,,"",,,,"Biceps","Pull",
2026-10-14 18:35,2026-10-14 19:13,"Chest press",65,9,"Depth terrible",,,,"Chest","Push",82.4
2026-10-14 18:35,2026-10-14 19:13,"Chest press",65,7,"",,,,"Chest","Push",
2026-10-14 18:35,2026-10-14 19:13,"Shoulder Press",20,4,"",,,,"Back","Push",
2026-07-13 12:28,2026-07-13 13:10,"Crunches"
`;

describe("Rep Count CSV import", () => {
  it("is detected from the header", () => {
    expect(detectFormat(["Workout Start", "Workout End", "Exercise", "Weight", "Reps", "Notes"])).toBe("repcount");
  });

  it("groups rows into workouts, skips planned sets, keeps notes and bodyweight", () => {
    const r = parseImportCsv(SAMPLE, { targetUnit: "kg" });
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.format).toBe("repcount");
    expect(r.workouts).toHaveLength(2);
    const [push, pull] = r.workouts; // ascending by date
    expect(pull.name).toBe("Pull");
    expect(pull.durationSec).toBe(33 * 60);
    expect(pull.exercises.map((e) => e.name)).toEqual(["Pull Up", "Upper Back Row", "Dumbbell Bicep Curl"]);
    expect(pull.exercises[0].sets).toEqual([{ weight: "", reps: "9", notes: undefined }, { weight: "", reps: "7", notes: undefined }]);
    expect(pull.exercises[2].sets.map((s) => s.weight)).toEqual(["10", "12.5"]);
    expect(push.exercises[0].sets[0]).toEqual({ weight: "65", reps: "9", notes: "Depth terrible" });
    expect(new Date(push.completedAt).getFullYear()).toBe(2026);
    expect(r.weighIns).toEqual([{ date: expect.stringMatching(/^2026-10-14$/), kg: 82.4 }]);
    expect(r.skippedRows).toBe(3); // two empty Reverse curls rows and the truncated Crunches row
  });

  it("converts the file's unit into the app's unit", () => {
    const r = parseImportCsv(SAMPLE, { targetUnit: "lb", sourceUnit: "kg" });
    if (!r.ok) throw new Error(r.error);
    const chest = r.workouts[0].exercises[0].sets[0].weight;
    expect(Number(chest)).toBeCloseTo(143.3, 0);
    const same = parseImportCsv(SAMPLE, { targetUnit: "kg", sourceUnit: "kg" });
    if (!same.ok) throw new Error(same.error);
    expect(same.workouts[0].exercises[0].sets[0].weight).toBe("65");
  });
});
