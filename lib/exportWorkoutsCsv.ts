import { getWorkoutHistory, type StoredWorkout } from "@/lib/trainingAnalysis";

// One row per logged set. Schema is stable and self-describing — testers can
// open the file in Excel / Numbers / Sheets without a separate guide.
const CSV_HEADERS = [
  "completed_at",
  "workout_name",
  "duration_sec",
  "exercise_id",
  "exercise_name",
  "set_index",
  "weight",
  "reps",
  "rir",
  "rest_sec",
  "notes",
] as const;

function csvEscape(value: unknown): string {
  if (value === null || value === undefined) return "";
  const s = String(value);
  if (/[",\n\r]/.test(s)) {
    return `"${s.replace(/"/g, '""')}"`;
  }
  return s;
}

export function buildWorkoutsCsv(workouts: StoredWorkout[]): string {
  const lines: string[] = [CSV_HEADERS.join(",")];
  for (const w of workouts) {
    for (const ex of w.exercises ?? []) {
      const sets = Array.isArray(ex.sets) ? ex.sets : [];
      if (sets.length === 0) {
        // Preserve a row even for an exercise with no sets — useful as evidence
        // the exercise was attached to the workout, even if not completed.
        lines.push(
          [
            csvEscape(w.completedAt),
            csvEscape(w.name ?? ""),
            csvEscape(w.durationSec ?? ""),
            csvEscape(ex.exerciseId ?? ""),
            csvEscape(ex.name),
            csvEscape(""),
            csvEscape(""),
            csvEscape(""),
            csvEscape(""),
            csvEscape(ex.restSec ?? ""),
            csvEscape(""),
          ].join(",")
        );
        continue;
      }
      sets.forEach((s, idx) => {
        lines.push(
          [
            csvEscape(w.completedAt),
            csvEscape(w.name ?? ""),
            csvEscape(w.durationSec ?? ""),
            csvEscape(ex.exerciseId ?? ""),
            csvEscape(ex.name),
            csvEscape(idx + 1),
            csvEscape(s.weight ?? ""),
            csvEscape(s.reps ?? ""),
            csvEscape(s.rir ?? ""),
            csvEscape(ex.restSec ?? ""),
            csvEscape(s.notes ?? ""),
          ].join(",")
        );
      });
    }
  }
  return lines.join("\n");
}

/** Build the CSV from localStorage and trigger a browser download. */
export function downloadAllWorkoutsCsv(): { rows: number; workouts: number } {
  const workouts = getWorkoutHistory();
  const csv = buildWorkoutsCsv(workouts);
  const rows = csv.split("\n").length - 1; // exclude header
  if (typeof window !== "undefined" && typeof URL !== "undefined") {
    const blob = new Blob([csv], { type: "text/csv;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    const stamp = new Date().toISOString().slice(0, 10);
    a.href = url;
    a.download = `gym-app-workouts-${stamp}.csv`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    setTimeout(() => URL.revokeObjectURL(url), 0);
  }
  return { rows, workouts: workouts.length };
}
