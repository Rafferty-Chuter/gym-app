import { describe, expect, it } from "vitest";
import { addRow, estimateMinutes, moveItem, plannedRows, removeRow, restLabel, routineExercisesFromWorkout, routineSummary, uniqueRoutineName, withRows, workingSetCount } from "@/lib/training/routine";
import type { TemplateExercise } from "@/lib/templateStorage";

const bench: TemplateExercise = { name: "Barbell Bench Press", targetSets: 3, restSec: 120 };

describe("routine helpers (TR2)", () => {
  it("an older routine plans targetSets empty working rows", () => {
    expect(plannedRows(bench)).toEqual([{}, {}, {}]);
  });

  it("adding a working set copies the last plan; a warm-up goes first and is not a working set", () => {
    const planned = withRows(bench, [{ kg: 80, reps: 8 }, { kg: 80, reps: 8 }]);
    const more = addRow(planned);
    expect(more.sets).toEqual([{ kg: 80, reps: 8 }, { kg: 80, reps: 8 }, { kg: 80, reps: 8 }]);
    expect(more.targetSets).toBe(3);
    const warm = addRow(more, "warmup");
    expect(warm.sets?.[0]).toEqual({ type: "warmup" });
    expect(warm.targetSets).toBe(3);
  });

  it("the last working set cannot be removed", () => {
    const one = withRows(bench, [{ type: "warmup" }, { reps: 5 }]);
    expect(removeRow(one, 1)).toBe(one);
    expect(removeRow(one, 0).sets).toEqual([{ reps: 5 }]);
  });

  it("moves, labels and summaries", () => {
    expect(moveItem(["a", "b", "c"], 0, 2)).toEqual(["b", "c", "a"]);
    expect(moveItem(["a", "b"], 0, 5)).toEqual(["a", "b"]);
    expect(restLabel(0)).toBe("Off");
    expect(restLabel(45)).toBe("45s");
    expect(restLabel(90)).toBe("1:30");
    const t = { exercises: [bench, { name: "Overhead Press", targetSets: 3, restSec: 120 }, { name: "Lateral Raise", targetSets: 3, restSec: 60 }, { name: "Rope Pushdown", targetSets: 2, restSec: 60 }] };
    expect(routineSummary(t)).toBe("Barbell Bench Press, Overhead Press, Lateral Raise and 1 more");
    expect(workingSetCount(t)).toBe(11);
    expect(estimateMinutes(t)).toBe(25);
  });

  it("a finished workout becomes planned rows in kg, warm-ups kept, empty exercises dropped (TR5)", () => {
    const ex = routineExercisesFromWorkout(
      {
        exercises: [
          { name: "Bench Press", exerciseId: "bench", restSec: 120, sets: [{ weight: "88", reps: "10", type: "warmup" }, { weight: "176", reps: "8" }, { weight: "", reps: "" }] },
          { name: "Plank", sets: [{ weight: "", reps: "" }] },
          { name: "Push Up", sets: [{ weight: "", reps: "15" }] },
        ],
      },
      "lb",
    );
    expect(ex.map((e) => e.name)).toEqual(["Bench Press", "Push Up"]);
    expect(ex[0]).toMatchObject({ exerciseId: "bench", targetSets: 1, restSec: 120 });
    expect(ex[0].sets).toEqual([{ type: "warmup", kg: 39.92, reps: 10 }, { kg: 79.83, reps: 8 }]);
    expect(ex[1]).toMatchObject({ targetSets: 1, restSec: 90, sets: [{ reps: 15 }] });
  });

  it("a saved routine never takes a name already in use", () => {
    expect(uniqueRoutineName("Push A", ["Legs"])).toBe("Push A");
    expect(uniqueRoutineName("Push A", ["push a", "Push A 2"])).toBe("Push A 3");
    expect(uniqueRoutineName("  ", [])).toBe("Routine");
  });
});
