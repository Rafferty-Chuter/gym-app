import { describe, expect, it } from "vitest";
import { EXERCISE_LIBRARY, exerciseEquipment, exerciseIdentity, getExerciseByName, sameExercise, searchExercises } from "@/lib/exerciseLibrary";
import { liftSeries } from "@/lib/physique/strength";
import { getDetailedMuscleGroupsForLoggedExercise } from "@/lib/trainingMetrics";

describe("exercise catalogue (TR1)", () => {
  it("every built-in exercise has equipment and a unique id", () => {
    expect(EXERCISE_LIBRARY.length).toBeGreaterThanOrEqual(130);
    expect(EXERCISE_LIBRARY.filter((e) => !e.equipment).map((e) => e.name)).toEqual([]);
    expect(new Set(EXERCISE_LIBRARY.map((e) => e.id)).size).toBe(EXERCISE_LIBRARY.length);
  });

  it("names from other apps and plain names resolve to the movement", () => {
    expect(getExerciseByName("Bench Press")?.id).toBe("barbell_bench_press");
    expect(getExerciseByName("Bench Press (Barbell)")?.id).toBe("barbell_bench_press");
    expect(getExerciseByName("Squat (Barbell)")?.id).toBe("barbell_squat");
    expect(getExerciseByName("pull-up")?.id).toBe("pull_up");
    expect(getExerciseByName("Deadlift")?.id).toBe("deadlift");
    expect(getExerciseByName("OHP")?.id).toBe("overhead_press");
    expect(getExerciseByName("Something Made Up")).toBeNull();
  });

  it("search takes words in any order and short forms", () => {
    const names = (q: string) => searchExercises(q).map((e) => e.name);
    expect(names("rdl")[0]).toBe("Romanian Deadlift");
    expect(names("db press")).toEqual(expect.arrayContaining(["Dumbbell Bench Press", "Incline Dumbbell Press"]));
    expect(names("press bench")).toContain("Barbell Bench Press");
    expect(names("Lat Pulldown")[0]).toBe("Lat Pulldown");
    expect(names("zzz")).toEqual([]);
  });

  it("equipment reads from the entry, else from the name", () => {
    expect(exerciseEquipment({ name: "Face Pull", equipment: "cable" })).toBe("cable");
    expect(exerciseEquipment({ name: "Smith Machine Row" })).toBe("smith");
    expect(exerciseEquipment({ name: "Dumbbell Thing" })).toBe("dumbbell");
    expect(exerciseEquipment({ name: "Mystery Lift" })).toBe("barbell");
  });

  it("a plain logged name now counts toward the library's muscles", () => {
    expect(getDetailedMuscleGroupsForLoggedExercise({ name: "Bench Press" })).toEqual(["chest"]);
    expect(getDetailedMuscleGroupsForLoggedExercise({ name: "Deadlift" }).sort()).toEqual(["glutes", "hamstrings"]);
  });

  it("one movement logged under different names is one history", () => {
    expect(sameExercise({ name: "Bench Press" }, { name: "Barbell Bench Press", exerciseId: "barbell_bench_press" })).toBe(true);
    expect(sameExercise({ name: "Bench Press (Barbell)" }, { name: "bench press" })).toBe(true);
    expect(sameExercise({ name: "Bench Press" }, { name: "Incline Bench Press" })).toBe(false);
    expect(exerciseIdentity({ name: "My Odd Lift" })).toBe("name:my odd lift");
    const w = (day: string, name: string) => ({ completedAt: `${day}T18:00:00.000Z`, exercises: [{ name, sets: [{ weight: "100", reps: "5" }] }] });
    const series = liftSeries([w("2026-10-01", "Bench Press"), w("2026-10-05", "Barbell Bench Press"), w("2026-10-08", "Bench Press (Barbell)")], "kg", { today: "2026-10-10", tz: "UTC" });
    expect(series).toHaveLength(1);
    expect(series[0].exposures).toHaveLength(3);
  });
});
