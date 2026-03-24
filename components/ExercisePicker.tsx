"use client";

import { useEffect, useMemo, useRef, useState, type RefObject } from "react";
import {
  getExerciseByName,
  getExercisesGroupedByCategory,
  searchExercises,
} from "@/lib/exerciseLibrary";

export type ExercisePickerValue = {
  exerciseId?: string;
  name: string;
};

type ExercisePickerProps = {
  value: string;
  onValueChange: (value: string) => void;
  onSelect: (exercise: ExercisePickerValue) => void;
  inputRef?: RefObject<HTMLInputElement | null>;
  placeholder?: string;
  inputClassName?: string;
  dropdownClassName?: string;
  showCustomOption?: boolean;
  customOptionLabel?: string;
  noMatchText?: string;
  maxResults?: number;
};

export default function ExercisePicker({
  value,
  onValueChange,
  onSelect,
  inputRef,
  placeholder = "Exercise name",
  inputClassName = "input-app w-full p-3 text-base",
  dropdownClassName = "mt-2 rounded-xl border border-teal-900/40 bg-zinc-900/90 max-h-72 overflow-y-auto",
  showCustomOption = true,
  customOptionLabel = "Add custom exercise",
  noMatchText = "No matches found.",
  maxResults = 25,
}: ExercisePickerProps) {
  const [open, setOpen] = useState(false);
  const containerRef = useRef<HTMLDivElement | null>(null);
  const groupedExercises = useMemo(() => getExercisesGroupedByCategory(), []);
  const searchResults = useMemo(() => searchExercises(value).slice(0, maxResults), [value, maxResults]);

  useEffect(() => {
    function handlePointerDown(event: MouseEvent) {
      const root = containerRef.current;
      if (!root) return;
      if (!root.contains(event.target as Node)) {
        setOpen(false);
      }
    }
    document.addEventListener("mousedown", handlePointerDown);
    return () => {
      document.removeEventListener("mousedown", handlePointerDown);
    };
  }, []);

  function selectLibraryExercise(name: string) {
    const matched = getExerciseByName(name);
    if (matched) {
      onSelect({ exerciseId: matched.id, name: matched.name });
    } else {
      onSelect({ name: name.trim() });
    }
    setOpen(false);
  }

  function selectCustomExercise() {
    const trimmed = value.trim();
    if (!trimmed) return;
    onSelect({ name: trimmed });
    setOpen(false);
  }

  return (
    <div ref={containerRef}>
      <input
        ref={inputRef}
        value={value}
        placeholder={placeholder}
        onFocus={() => setOpen(true)}
        onChange={(e) => {
          onValueChange(e.target.value);
          setOpen(true);
        }}
        onKeyDown={(e) => {
          if (e.key !== "Enter") return;
          e.preventDefault();
          const trimmed = value.trim();
          if (!trimmed) return;
          const exact = getExerciseByName(trimmed);
          if (exact) {
            onSelect({ exerciseId: exact.id, name: exact.name });
            setOpen(false);
            return;
          }
          if (showCustomOption) {
            onSelect({ name: trimmed });
            setOpen(false);
          }
        }}
        className={inputClassName}
      />

      {open && (
        <div className={dropdownClassName}>
          {value.trim() ? (
            <ul className="py-1">
              {searchResults.map((ex) => (
                <li key={ex.id}>
                  <button
                    type="button"
                    onMouseDown={(ev) => ev.preventDefault()}
                    onClick={() => selectLibraryExercise(ex.name)}
                    className="w-full text-left px-3 py-2 text-sm text-app-secondary hover:bg-teal-950/30 hover:text-white transition"
                  >
                    {ex.name}
                  </button>
                </li>
              ))}
              {searchResults.length === 0 && (
                <li className="px-3 py-2 text-xs text-app-meta">{noMatchText}</li>
              )}
              {showCustomOption && (
                <li className="border-t border-teal-900/40 mt-1">
                  <button
                    type="button"
                    onMouseDown={(ev) => ev.preventDefault()}
                    onClick={selectCustomExercise}
                    className="w-full text-left px-3 py-2 text-sm text-app-secondary hover:bg-teal-950/30 hover:text-white transition"
                  >
                    {customOptionLabel}
                  </button>
                </li>
              )}
            </ul>
          ) : (
            <div className="py-1">
              {groupedExercises.map((group) => (
                <div key={group.category}>
                  <p className="px-3 pt-2 pb-1 text-[11px] uppercase tracking-wide text-app-meta">
                    {group.category}
                  </p>
                  <ul>
                    {group.exercises.map((ex) => (
                      <li key={ex.id}>
                        <button
                          type="button"
                          onMouseDown={(ev) => ev.preventDefault()}
                          onClick={() => selectLibraryExercise(ex.name)}
                          className="w-full text-left px-3 py-2 text-sm text-app-secondary hover:bg-teal-950/30 hover:text-white transition"
                        >
                          {ex.name}
                        </button>
                      </li>
                    ))}
                  </ul>
                </div>
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  );
}
