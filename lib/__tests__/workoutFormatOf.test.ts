import { describe, expect, it } from "vitest";
import { workoutFormatOf } from "@/lib/csvImport";
import { sampleDailyLog, sampleWorkoutsCsv } from "@/lib/import/sample";

describe("workoutFormatOf (C7)", () => {
  it("knows a workout export from its header and leaves a daily log alone", () => {
    expect(workoutFormatOf(sampleWorkoutsCsv("2026-10-18"))).toBe("strong");
    expect(workoutFormatOf("﻿Title,start_time,end_time,exercise_title,set_index,weight_kg,reps\n")).toBe("hevy");
    expect(workoutFormatOf("Workout Start;Workout End;Exercise;Weight;Reps\n")).toBe("repcount");
    expect(workoutFormatOf(sampleDailyLog("2026-10-18").csv)).toBeNull();
    expect(workoutFormatOf("")).toBeNull();
  });
});
