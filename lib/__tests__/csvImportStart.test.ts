import { describe, expect, it } from "vitest";
import { parseImportCsv } from "@/lib/csvImport";
import { workoutStartedAt } from "@/lib/workoutTime";

const HEVY = `title,start_time,end_time,description,exercise_title,superset_id,exercise_notes,set_index,set_type,weight_kg,reps,distance_km,duration_seconds,rpe
"Legs","2026-10-14T18:00:00.000Z","2026-10-14T19:10:00.000Z","","Squat (Barbell)","","",0,"normal",140,5,,,8
"Legs","2026-10-14T18:00:00.000Z","2026-10-14T19:10:00.000Z","","Squat (Barbell)","","",1,"normal",140,5,,,8.5
`;

const STRONG = `Date,Workout Name,Duration,Exercise Name,Set Order,Weight,Reps,Distance,Seconds,Notes,Workout Notes,RPE
2026-10-15 07:30:00,"Push","1h 5m","Bench Press (Barbell)",1,100,5,0,0,"","",
`;

const REPCOUNT = `Workout Start,Workout End,Exercise,Weight,Reps,Notes,Kcal,Distance,Duration,Category,Name,Bodyweight
2026-10-16 18:01,2026-10-16 18:34,"Pull Up",0,9,"",,,,"Back","Pull",
`;

describe("imports keep the session's start (IN1)", () => {
  it("Hevy: the start time, with the stamp unchanged so re-imports still match", () => {
    const r = parseImportCsv(HEVY, { targetUnit: "kg" });
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    const [w] = r.workouts;
    expect(w.startedAt).toBe("2026-10-14T18:00:00.000Z");
    expect(w.completedAt).toBe("2026-10-14T18:00:00.000Z");
    expect(w.durationSec).toBe(70 * 60);
    expect(workoutStartedAt(w)).toBe("2026-10-14T18:00:00.000Z");
  });

  it("Strong: the Date column is the start", () => {
    const r = parseImportCsv(STRONG, { targetUnit: "kg" });
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    const [w] = r.workouts;
    expect(w.startedAt).toBe(w.completedAt);
    expect(w.durationSec).toBe(65 * 60);
    expect(workoutStartedAt(w)).toBe(w.completedAt);
  });

  it("Rep Count: the start column, the stamp at the end", () => {
    const r = parseImportCsv(REPCOUNT, { targetUnit: "kg" });
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    const [w] = r.workouts;
    expect(Date.parse(w.completedAt) - Date.parse(w.startedAt ?? "")).toBe(33 * 60 * 1000);
    expect(workoutStartedAt(w)).toBe(w.startedAt);
  });
});
