"use client";

import { useMemo, useState } from "react";
import Sheet from "@/components/ui/Sheet";
import CreateExerciseModal from "@/components/CreateExerciseModal";
import { PrimaryButton } from "@/components/physique/ui";
import { exerciseEquipment, getExerciseByName, searchExercises, type Exercise, type ExerciseEquipment } from "@/lib/exerciseLibrary";
import { recentExercises } from "@/lib/training/recentExercises";
import { useWorkouts } from "@/lib/physique/io/workouts";
import type { UserExerciseRecord } from "@/lib/userExerciseLibrary";

export type PickedExercise = { exerciseId?: string; name: string };

type Category = Exercise["displayCategory"];

const MUSCLES: ReadonlyArray<{ value: Category; label: string }> = [
  { value: "Chest", label: "Chest" },
  { value: "Back", label: "Back" },
  { value: "Shoulders", label: "Shoulders" },
  { value: "Biceps", label: "Biceps" },
  { value: "Triceps", label: "Triceps" },
  { value: "Quads", label: "Quads" },
  { value: "Hamstrings", label: "Hamstrings" },
  { value: "Glutes", label: "Glutes" },
  { value: "Calves", label: "Calves" },
  { value: "Core", label: "Core" },
  { value: "Compound / Full Body", label: "Full body" },
];

const EQUIPMENT: ReadonlyArray<{ value: ExerciseEquipment; label: string }> = [
  { value: "barbell", label: "Barbell" },
  { value: "dumbbell", label: "Dumbbell" },
  { value: "machine", label: "Machine" },
  { value: "cable", label: "Cable" },
  { value: "bodyweight", label: "Bodyweight" },
  { value: "smith", label: "Smith machine" },
  { value: "kettlebell", label: "Kettlebell" },
  { value: "band", label: "Band" },
  { value: "other", label: "Other" },
];

const EQUIPMENT_LABEL = Object.fromEntries(EQUIPMENT.map((e) => [e.value, e.label])) as Record<ExerciseEquipment, string>;
const MUSCLE_LABEL = Object.fromEntries(MUSCLES.map((m) => [m.value, m.label])) as Record<Category, string>;

/** "Chest · Barbell" for a library exercise, "Your exercise" for a custom one. */
export function exerciseSubtitle(ex: Exercise | null): string {
  if (!ex) return "Your exercise";
  return `${MUSCLE_LABEL[ex.displayCategory] ?? ex.displayCategory} · ${EQUIPMENT_LABEL[exerciseEquipment(ex)]}`;
}

function Check({ order }: { order: number | null }) {
  return (
    <span
      className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full text-[12px] font-semibold"
      style={order != null ? { background: "var(--status-good)", color: "var(--text-on-primary)" } : { border: "1.5px solid var(--border-strong)" }}
      aria-hidden
    >
      {order != null ? order : null}
    </span>
  );
}

/**
 * Add or replace exercises (TR1, after Hevy's Add Exercise): search by any
 * words, filter by equipment and muscle, recent exercises first, then
 * everything A to Z. In "multi" mode taps build an ordered selection and
 * one button adds them all; in "single" mode a tap picks and closes.
 * "Create" makes a custom exercise from what was typed.
 */
export default function ExercisePickerSheet({
  open,
  onClose,
  mode,
  title,
  onPick,
  inRoutine = [],
}: {
  open: boolean;
  onClose: () => void;
  mode: "multi" | "single";
  title?: string;
  onPick: (items: PickedExercise[]) => void;
  /** Names already in the routine or session, marked so they are not added twice by accident. */
  inRoutine?: readonly string[];
}) {
  return open ? <Inner onClose={onClose} mode={mode} title={title ?? (mode === "multi" ? "Add exercises" : "Replace exercise")} onPick={onPick} inRoutine={inRoutine} /> : null;
}

function Inner({ onClose, mode, title, onPick, inRoutine }: { onClose: () => void; mode: "multi" | "single"; title: string; onPick: (items: PickedExercise[]) => void; inRoutine: readonly string[] }) {
  const workouts = useWorkouts();
  const [query, setQuery] = useState("");
  const [equipment, setEquipment] = useState<ExerciseEquipment | null>(null);
  const [muscle, setMuscle] = useState<Category | null>(null);
  const [panel, setPanel] = useState<"equipment" | "muscle" | null>(null);
  const [selected, setSelected] = useState<PickedExercise[]>([]);
  const [creating, setCreating] = useState(false);
  const [revision, setRevision] = useState(0);
  const inSet = useMemo(() => new Set(inRoutine.map((n) => n.toLowerCase())), [inRoutine]);

  const filtered = useMemo(() => {
    void revision;
    return searchExercises(query).filter((ex) => (!equipment || exerciseEquipment(ex) === equipment) && (!muscle || ex.displayCategory === muscle));
  }, [query, equipment, muscle, revision]);
  const browsing = !query.trim() && !equipment && !muscle;
  const recent = useMemo(() => (browsing ? recentExercises(workouts) : []), [browsing, workouts]);
  const alphabetical = useMemo(() => (browsing ? [...filtered].sort((a, b) => a.name.localeCompare(b.name)) : filtered), [browsing, filtered]);

  const orderOf = (name: string) => {
    const i = selected.findIndex((s) => s.name.toLowerCase() === name.toLowerCase());
    return i >= 0 ? i + 1 : null;
  };

  function tap(item: PickedExercise) {
    if (mode === "single") {
      onPick([item]);
      onClose();
      return;
    }
    setSelected((cur) => (cur.some((s) => s.name.toLowerCase() === item.name.toLowerCase()) ? cur.filter((s) => s.name.toLowerCase() !== item.name.toLowerCase()) : [...cur, item]));
  }

  function created(record: UserExerciseRecord) {
    setCreating(false);
    setRevision((r) => r + 1);
    setQuery("");
    tap({ exerciseId: record.id, name: record.name });
  }

  const row = (item: PickedExercise, meta: Exercise | null, key: string, extra?: string) => {
    const order = orderOf(item.name);
    const already = inSet.has(item.name.toLowerCase());
    return (
      <li key={key}>
        <button type="button" onClick={() => tap(item)} className="flex min-h-[56px] w-full items-center gap-3 py-2 text-left transition-colors active:opacity-70" aria-pressed={mode === "multi" ? order != null : undefined} aria-label={`${item.name}${already ? ", already added" : ""}`}>
          <span className="flex min-w-0 flex-1 flex-col">
            <span className="truncate text-[15px]" style={{ color: "var(--text)" }}>
              {item.name}
            </span>
            <span className="truncate text-[12px]" style={{ color: "var(--text-tertiary)" }}>
              {exerciseSubtitle(meta)}
              {extra ? ` · ${extra}` : ""}
              {already ? " · in this routine" : ""}
            </span>
          </span>
          {mode === "multi" && <Check order={order} />}
        </button>
      </li>
    );
  };

  const chip = (label: string, active: boolean, onClick: () => void, ariaLabel: string) => (
    <button
      type="button"
      onClick={onClick}
      aria-expanded={undefined}
      aria-label={ariaLabel}
      className="h-[34px] flex-1 truncate rounded-[10px] px-3 text-[13px] font-medium transition-colors"
      style={active ? { background: "var(--primary)", color: "var(--text-on-primary)" } : { background: "var(--surface-raised)", color: "var(--text)" }}
    >
      {label}
    </button>
  );

  const options = <T extends string>(items: ReadonlyArray<{ value: T; label: string }>, value: T | null, set: (v: T | null) => void, allLabel: string) => (
    <div className="mt-2 flex flex-wrap gap-1.5" role="listbox" aria-label={allLabel}>
      {[{ value: null as T | null, label: allLabel }, ...items].map((o) => {
        const on = o.value === value;
        return (
          <button
            key={o.label}
            type="button"
            role="option"
            aria-selected={on}
            onClick={() => {
              set(o.value);
              setPanel(null);
            }}
            className="h-[30px] rounded-full px-3 text-[12px] font-medium"
            style={on ? { background: "var(--primary)", color: "var(--text-on-primary)" } : { background: "var(--surface-raised)", color: "var(--text-secondary)" }}
          >
            {o.label}
          </button>
        );
      })}
    </div>
  );

  const header = (
    <div className="pb-2 pt-1">
      <div className="flex items-center justify-between gap-2 py-2">
        <button type="button" onClick={onClose} className="text-[15px]" style={{ color: "var(--text-secondary)" }}>
          Cancel
        </button>
        <span className="text-[17px] font-semibold" style={{ color: "var(--text)" }}>
          {title}
        </span>
        <button type="button" onClick={() => setCreating(true)} className="text-[15px] font-semibold" style={{ color: "var(--text)" }}>
          Create
        </button>
      </div>
      <input
        type="search"
        value={query}
        onChange={(e) => setQuery(e.target.value)}
        placeholder="Search exercises"
        aria-label="Search exercises"
        data-sheet-autofocus
        className="h-[40px] w-full rounded-[10px] px-3 text-[15px] outline-none placeholder:text-[var(--text-tertiary)]"
        style={{ background: "var(--surface-raised)", color: "var(--text)" }}
      />
      <div className="mt-2 flex gap-2">
        {chip(equipment ? EQUIPMENT_LABEL[equipment] : "All equipment", !!equipment || panel === "equipment", () => setPanel(panel === "equipment" ? null : "equipment"), "Filter by equipment")}
        {chip(muscle ? MUSCLE_LABEL[muscle] : "All muscles", !!muscle || panel === "muscle", () => setPanel(panel === "muscle" ? null : "muscle"), "Filter by muscle")}
      </div>
      {panel === "equipment" && options(EQUIPMENT, equipment, setEquipment, "All equipment")}
      {panel === "muscle" && options(MUSCLES, muscle, setMuscle, "All muscles")}
    </div>
  );

  const footer =
    mode === "multi" ? (
      <PrimaryButton onClick={() => (onPick(selected), onClose())} disabled={selected.length === 0}>
        {selected.length === 0 ? "Pick exercises" : selected.length === 1 ? "Add 1 exercise" : `Add ${selected.length} exercises`}
      </PrimaryButton>
    ) : undefined;

  const sectionTitle = (t: string) => (
    <p className="pb-1 pt-3 text-[11px] font-medium uppercase tracking-[0.04em]" style={{ color: "var(--text-tertiary)" }}>
      {t}
    </p>
  );

  return (
    <Sheet open onClose={onClose} header={header} footer={footer} full ariaLabel={title}>
      {recent.length > 0 && (
        <>
          {sectionTitle("Recent")}
          <ul className="divide-y divide-[var(--border)]">{recent.map((r) => row({ name: r.name, ...(r.exerciseId ? { exerciseId: r.exerciseId } : {}) }, getExerciseByName(r.name), `recent-${r.name}`, r.times > 1 ? `${r.times} times` : undefined))}</ul>
        </>
      )}
      {sectionTitle(browsing ? "All exercises" : `${alphabetical.length} ${alphabetical.length === 1 ? "match" : "matches"}`)}
      {alphabetical.length === 0 ? (
        <div className="flex flex-col items-start gap-2 py-3">
          <p className="text-[13px]" style={{ color: "var(--text-secondary)" }}>
            Nothing matches{query.trim() ? ` "${query.trim()}"` : " these filters"}.
          </p>
          {query.trim() && (
            <button type="button" onClick={() => setCreating(true)} className="h-[34px] rounded-[10px] px-3 text-[13px] font-semibold" style={{ background: "var(--surface-raised)", color: "var(--text)" }}>
              Create &ldquo;{query.trim()}&rdquo;
            </button>
          )}
        </div>
      ) : (
        <ul className="divide-y divide-[var(--border)]">{alphabetical.map((ex) => row({ exerciseId: ex.id, name: ex.name }, ex, `all-${ex.id}`))}</ul>
      )}
      <CreateExerciseModal open={creating} initialName={query} onClose={() => setCreating(false)} onCreated={created} />
    </Sheet>
  );
}
