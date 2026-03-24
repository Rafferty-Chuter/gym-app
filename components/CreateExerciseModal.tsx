"use client";

import { useEffect, useState } from "react";
import {
  PRIMARY_MUSCLE_OPTIONS,
  EQUIPMENT_OPTIONS,
  MOVEMENT_PATTERN_OPTIONS,
  addUserExerciseRecord,
  type PrimaryMuscleValue,
  type EquipmentValue,
  type UserExerciseRecord,
} from "@/lib/userExerciseLibrary";
import type { Exercise } from "@/lib/exerciseLibrary";

type Props = {
  open: boolean;
  initialName: string;
  onClose: () => void;
  onCreated: (record: UserExerciseRecord) => void;
};

const SECONDARY_OPTIONS: { value: "" | PrimaryMuscleValue; label: string }[] = [
  { value: "", label: "None" },
  ...PRIMARY_MUSCLE_OPTIONS.map((o) => ({ value: o.value, label: o.label })),
];

const LATERALITY_OPTIONS: { value: "unilateral" | "bilateral" | "either"; label: string }[] = [
  { value: "either", label: "Either / not specified" },
  { value: "bilateral", label: "Bilateral" },
  { value: "unilateral", label: "Unilateral" },
];

export default function CreateExerciseModal({ open, initialName, onClose, onCreated }: Props) {
  const [name, setName] = useState("");
  const [primaryMuscle, setPrimaryMuscle] = useState<PrimaryMuscleValue>("chest");
  const [equipment, setEquipment] = useState<EquipmentValue>("dumbbell");
  const [secondaryMuscle, setSecondaryMuscle] = useState<"" | PrimaryMuscleValue>("");
  const [movementPattern, setMovementPattern] = useState<Exercise["movementPattern"]>("isolation");
  const [laterality, setLaterality] = useState<"unilateral" | "bilateral" | "either">("either");

  useEffect(() => {
    if (open) {
      setName(initialName.trim());
      setPrimaryMuscle("chest");
      setEquipment("dumbbell");
      setSecondaryMuscle("");
      setMovementPattern("isolation");
      setLaterality("either");
    }
  }, [open, initialName]);

  if (!open) return null;

  function submit() {
    const trimmed = name.trim();
    if (!trimmed) return;
    const record = addUserExerciseRecord({
      name: trimmed,
      primaryMuscle,
      equipment,
      ...(secondaryMuscle ? { secondaryMuscle } : {}),
      movementPattern,
      ...(laterality !== "either" ? { laterality } : {}),
    });
    onCreated(record);
    onClose();
  }

  return (
    <div
      className="fixed inset-0 z-[60] flex items-center justify-center p-4 bg-black/75"
      role="dialog"
      aria-modal="true"
      aria-labelledby="create-exercise-title"
      onClick={onClose}
    >
      <div
        className="w-full max-w-md max-h-[min(90vh,640px)] overflow-y-auto rounded-2xl border border-teal-950/50 bg-gradient-to-b from-zinc-900 to-teal-950/30 shadow-xl p-5 sm:p-6"
        onClick={(e) => e.stopPropagation()}
      >
        <h2 id="create-exercise-title" className="text-lg font-semibold text-white mb-1">
          Create new exercise
        </h2>
        <p className="text-sm text-app-secondary mb-4">
          Saved to your library for workouts, templates, and analysis.
        </p>

        <div className="space-y-3">
          <label className="block">
            <span className="label-section mb-1 block">Name</span>
            <input
              type="text"
              value={name}
              onChange={(e) => setName(e.target.value)}
              className="input-app w-full p-3 text-base"
              placeholder="Exercise name"
              autoFocus
            />
          </label>

          <label className="block">
            <span className="label-section mb-1 block">Primary muscle</span>
            <select
              value={primaryMuscle}
              onChange={(e) => setPrimaryMuscle(e.target.value as PrimaryMuscleValue)}
              className="input-app w-full p-3 text-base"
            >
              {PRIMARY_MUSCLE_OPTIONS.map((o) => (
                <option key={o.value} value={o.value}>
                  {o.label}
                </option>
              ))}
            </select>
          </label>

          <label className="block">
            <span className="label-section mb-1 block">Equipment</span>
            <select
              value={equipment}
              onChange={(e) => setEquipment(e.target.value as EquipmentValue)}
              className="input-app w-full p-3 text-base"
            >
              {EQUIPMENT_OPTIONS.map((o) => (
                <option key={o} value={o}>
                  {o.charAt(0).toUpperCase() + o.slice(1)}
                </option>
              ))}
            </select>
          </label>

          <label className="block">
            <span className="label-section mb-1 block">Secondary muscle (optional)</span>
            <select
              value={secondaryMuscle}
              onChange={(e) => setSecondaryMuscle(e.target.value as "" | PrimaryMuscleValue)}
              className="input-app w-full p-3 text-base"
            >
              {SECONDARY_OPTIONS.map((o) => (
                <option key={o.value || "none"} value={o.value}>
                  {o.label}
                </option>
              ))}
            </select>
          </label>

          <label className="block">
            <span className="label-section mb-1 block">Movement pattern (optional)</span>
            <select
              value={movementPattern}
              onChange={(e) => setMovementPattern(e.target.value as Exercise["movementPattern"])}
              className="input-app w-full p-3 text-base"
            >
              {MOVEMENT_PATTERN_OPTIONS.map((o) => (
                <option key={o.value} value={o.value}>
                  {o.label}
                </option>
              ))}
            </select>
          </label>

          <label className="block">
            <span className="label-section mb-1 block">Unilateral / bilateral (optional)</span>
            <select
              value={laterality}
              onChange={(e) =>
                setLaterality(e.target.value as "unilateral" | "bilateral" | "either")
              }
              className="input-app w-full p-3 text-base"
            >
              {LATERALITY_OPTIONS.map((o) => (
                <option key={o.value} value={o.value}>
                  {o.label}
                </option>
              ))}
            </select>
          </label>
        </div>

        <div className="flex gap-2 justify-end mt-6">
          <button type="button" onClick={onClose} className="btn-secondary">
            Cancel
          </button>
          <button
            type="button"
            onClick={submit}
            disabled={!name.trim()}
            className="px-4 py-2.5 rounded-xl btn-primary text-sm font-semibold disabled:opacity-40 disabled:cursor-not-allowed"
          >
            Save & add
          </button>
        </div>
      </div>
    </div>
  );
}
