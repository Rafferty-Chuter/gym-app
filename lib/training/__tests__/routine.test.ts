import { describe, expect, it } from "vitest";
import { addRow, estimateMinutes, moveItem, plannedRows, removeRow, restLabel, routineSummary, withRows, workingSetCount } from "@/lib/training/routine";
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
});
