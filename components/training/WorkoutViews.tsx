"use client";

import Link from "next/link";
import { Chevron } from "@/components/physique/ui";
import { SET_TYPE_MARK, getCompletedLoggedSets, setTypeOf } from "@/lib/completedSets";
import { exerciseIdentity } from "@/lib/exerciseLibrary";
import type { StoredWorkout } from "@/lib/trainingAnalysis";
import { RECORD_LABEL, bestSet, formatDuration, formatLoad, formatSet, formatVolume, setNumber, type RecordKind, type WorkoutRecord, type WorkoutStats } from "@/lib/training/workoutSummary";

/** Shared pieces of a finished workout (TR4, TR5): the stats strip, the record lines and each exercise's sets. */

/** "Saturday 18 October · 07:42" in the viewer's zone. */
export function workoutWhen(iso: string, long = true): string {
  const d = new Date(iso);
  if (!Number.isFinite(d.getTime())) return "";
  const day = d.toLocaleDateString("en-GB", long ? { weekday: "long", day: "numeric", month: "long" } : { weekday: "short", day: "numeric", month: "short" }).replace(",", "");
  const time = d.toLocaleTimeString("en-GB", { hour: "2-digit", minute: "2-digit" });
  return `${day} · ${time}`;
}

/** The name people see: the stored name, else the first exercise's. */
export function workoutTitle(w: Pick<StoredWorkout, "name" | "exercises">): string {
  const n = w.name?.trim();
  if (n) return n;
  const first = w.exercises?.[0]?.name?.trim();
  return first ? `${first} workout` : "Workout";
}

/** Link to one workout. `completedAt` is the workout's identity in storage. */
export function workoutHref(w: Pick<StoredWorkout, "completedAt">): string {
  return `/history/workout?at=${encodeURIComponent(w.completedAt)}`;
}

/** Link to one exercise's history and records. */
export function exerciseHref(ex: { name: string; exerciseId?: string }): string {
  const q = new URLSearchParams({ name: ex.name });
  if (ex.exerciseId) q.set("id", ex.exerciseId);
  return `/exercise?${q.toString()}`;
}

/** Duration, volume, sets and records on one strip. */
export function StatsStrip({ stats, records, unit }: { stats: WorkoutStats; records: number; unit: string }) {
  const cells: { label: string; value: string; good?: boolean }[] = [
    { label: "Duration", value: formatDuration(stats.durationSec) },
    { label: "Volume", value: stats.volume > 0 ? formatVolume(stats.volume, unit) : "—" },
    { label: "Sets", value: String(stats.sets) },
    { label: "Records", value: String(records), good: records > 0 },
  ];
  return (
    <dl className="grid grid-cols-4 overflow-hidden rounded-[12px]" style={{ background: "#141416" }}>
      {cells.map((c, i) => (
        <div key={c.label} className="flex min-w-0 flex-col gap-1 px-3 py-3" style={i > 0 ? { borderLeft: "1px solid #2a2a2e" } : undefined}>
          <dt className="text-[11px] font-medium" style={{ color: "#6f6f76" }}>
            {c.label}
          </dt>
          <dd className="truncate text-[15px] font-semibold" style={{ color: c.good ? "#00e5b0" : "#f2f2f0", fontVariantNumeric: "tabular-nums" }}>
            {c.value}
          </dd>
        </div>
      ))}
    </dl>
  );
}

/** A small mint mark for a row that set a record. */
export function RecordMark({ kinds }: { kinds: readonly RecordKind[] }) {
  if (kinds.length === 0) return null;
  return (
    <span className="inline-flex h-[20px] shrink-0 items-center rounded-full px-2 text-[11px] font-semibold" style={{ background: "rgba(0,229,176,0.12)", color: "#00e5b0" }} title={kinds.map((k) => RECORD_LABEL[k]).join(", ")}>
      {kinds.length === 1 ? "Record" : `${kinds.length} records`}
    </span>
  );
}

/** The records a workout set, one line each. */
export function RecordList({ records, unit }: { records: readonly WorkoutRecord[]; unit: string }) {
  if (records.length === 0) return null;
  return (
    <ul className="overflow-hidden rounded-[12px] divide-y divide-[#2a2a2e]" style={{ background: "#141416" }}>
      {records.map((r, i) => (
        <li key={`${r.name}-${r.kind}-${i}`} className="flex min-h-[56px] items-center justify-between gap-3 px-4 py-2">
          <span className="flex min-w-0 flex-col">
            <span className="truncate text-[15px]" style={{ color: "#f2f2f0" }}>
              {r.name}
            </span>
            <span className="text-[12px]" style={{ color: "#6f6f76" }}>
              {RECORD_LABEL[r.kind]}, was {r.kind === "reps" ? r.previous : `${formatLoad(r.previous)} ${unit}`}
            </span>
          </span>
          <span className="shrink-0 text-[15px] font-semibold" style={{ color: "#00e5b0", fontVariantNumeric: "tabular-nums" }}>
            {r.kind === "reps" ? `${r.value} reps` : `${formatLoad(r.value)} ${unit}`}
          </span>
        </li>
      ))}
    </ul>
  );
}

/** One row per exercise: sets done and the best set, a record mark, a link to the exercise. */
export function ExerciseBestList({ workout, recordKinds, unit, linked = true }: { workout: StoredWorkout; recordKinds: Map<string, RecordKind[]>; unit: string; linked?: boolean }) {
  const rows = (workout.exercises ?? []).filter((ex) => getCompletedLoggedSets(ex.sets ?? []).length > 0);
  return (
    <ul className="overflow-hidden rounded-[12px] divide-y divide-[#2a2a2e]" style={{ background: "#141416" }}>
      {rows.map((ex, i) => {
        const hard = getCompletedLoggedSets(ex.sets ?? []).filter((s) => setTypeOf(s) !== "warmup").length;
        const kinds = recordKinds.get(exerciseIdentity(ex)) ?? [];
        const inner = (
          <>
            <span className="flex min-w-0 flex-1 flex-col">
              <span className="flex items-center gap-2">
                <span className="truncate text-[15px]" style={{ color: "#f2f2f0" }}>
                  {ex.name}
                </span>
                <RecordMark kinds={kinds} />
              </span>
              <span className="text-[12px]" style={{ color: "#6f6f76" }}>
                {hard} {hard === 1 ? "set" : "sets"}
              </span>
            </span>
            <span className="shrink-0 text-[15px] font-medium" style={{ color: "#a3a3a8", fontVariantNumeric: "tabular-nums" }}>
              {formatSet(bestSet(ex.sets), unit)}
            </span>
            {linked && <Chevron />}
          </>
        );
        const cls = "flex min-h-[56px] w-full items-center gap-3 px-4 py-2 text-left";
        return (
          <li key={`${ex.name}-${i}`}>
            {linked ? (
              <Link href={exerciseHref(ex)} className={`${cls} transition-colors active:bg-[#1d1d20]`}>
                {inner}
              </Link>
            ) : (
              <div className={cls}>{inner}</div>
            )}
          </li>
        );
      })}
    </ul>
  );
}

/** Each exercise with every set: W for warm-ups, working sets numbered, the best set marked. */
export function ExerciseSetsList({ workout, recordKinds, unit }: { workout: StoredWorkout; recordKinds: Map<string, RecordKind[]>; unit: string }) {
  const rows = (workout.exercises ?? []).filter((ex) => getCompletedLoggedSets(ex.sets ?? []).length > 0);
  return (
    <div className="flex flex-col gap-3">
      {rows.map((ex, i) => {
        const sets = getCompletedLoggedSets(ex.sets ?? []);
        const best = bestSet(sets);
        let bestShown = false;
        let n = 0;
        const kinds = recordKinds.get(exerciseIdentity(ex)) ?? [];
        return (
          <section key={`${ex.name}-${i}`} className="overflow-hidden rounded-[12px]" style={{ background: "#141416" }} aria-label={ex.name}>
            <Link href={exerciseHref(ex)} className="flex min-h-[52px] items-center gap-2 px-4 py-2 transition-colors active:bg-[#1d1d20]">
              <span className="min-w-0 flex-1 truncate text-[16px] font-semibold" style={{ color: "#f2f2f0" }}>
                {ex.name}
              </span>
              <RecordMark kinds={kinds} />
              <Chevron />
            </Link>
            <ol className="px-4 pb-3">
              {sets.map((s, j) => {
                const type = setTypeOf(s);
                if (type !== "warmup") n += 1;
                const mark = SET_TYPE_MARK[type] || String(n);
                const w = setNumber(s.weight) ?? 0;
                const r = setNumber(s.reps) ?? 0;
                const isBest = !bestShown && best != null && type !== "warmup" && type !== "drop" && w === best.weight && r === best.reps;
                if (isBest) bestShown = true;
                return (
                  <li key={j} className="flex min-h-[32px] items-center gap-3 text-[15px]" style={{ fontVariantNumeric: "tabular-nums" }}>
                    <span className="w-6 shrink-0 text-center text-[13px] font-semibold" style={{ color: type === "working" ? "#a3a3a8" : "#6f6f76" }}>
                      {mark}
                    </span>
                    <span className="flex-1" style={{ color: type === "warmup" ? "#a3a3a8" : "#f2f2f0" }}>
                      {w > 0 ? `${formatLoad(w)} ${unit} × ${r}` : `${r} reps`}
                      {s.notes?.trim() ? (
                        <span className="block text-[12px]" style={{ color: "#6f6f76" }}>
                          {s.notes.trim()}
                        </span>
                      ) : null}
                    </span>
                    {isBest && (
                      <span className="text-[11px] font-medium" style={{ color: "#6f6f76" }}>
                        Best set
                      </span>
                    )}
                  </li>
                );
              })}
            </ol>
          </section>
        );
      })}
    </div>
  );
}
