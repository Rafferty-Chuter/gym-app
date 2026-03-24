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
  /** When set, unmatched names open the create flow instead of adding a bare custom name. */
  onRequestCreateExercise?: (typedName: string) => void;
  createPromptLabel?: string;
  /** @deprecated use onRequestCreateExercise; kept for pickers without create flow */
  showCustomOption?: boolean;
  customOptionLabel?: string;
  noMatchText?: string;
  maxResults?: number;
  /** Bump when user exercise library changes so lists refresh. */
  libraryRevision?: number;
};

export default function ExercisePicker({
  value,
  onValueChange,
  onSelect,
  inputRef,
  placeholder = "Exercise name",
  inputClassName = "input-app w-full p-3 text-base",
  dropdownClassName = "mt-2 rounded-xl border border-teal-900/40 bg-zinc-900/90 max-h-72 overflow-y-auto",
  onRequestCreateExercise,
  createPromptLabel = "Can't find it? Create it",
  showCustomOption = true,
  customOptionLabel = "Create new exercise",
  noMatchText = "No matches in your library.",
  maxResults = 25,
  libraryRevision = 0,
}: ExercisePickerProps) {
  const [open, setOpen] = useState(false);
  const containerRef = useRef<HTMLDivElement | null>(null);
  const groupedExercises = useMemo(
    () => getExercisesGroupedByCategory(),
    [libraryRevision]
  );
  const searchResults = useMemo(
    () => searchExercises(value).slice(0, maxResults),
    [value, maxResults, libraryRevision]
  );
  const exactMatchForInput = useMemo(() => {
    const t = value.trim();
    if (!t) return null;
    return getExerciseByName(t);
  }, [value, libraryRevision]);

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

  function selectCustomOrCreate() {
    const trimmed = value.trim();
    if (!trimmed) return;
    if (onRequestCreateExercise) {
      onRequestCreateExercise(trimmed);
      setOpen(false);
      return;
    }
    if (showCustomOption) {
      onSelect({ name: trimmed });
      setOpen(false);
    }
  }

  function handleEnter() {
    const trimmed = value.trim();
    if (!trimmed) return;
    const exact = getExerciseByName(trimmed);
    if (exact) {
      onSelect({ exerciseId: exact.id, name: exact.name });
      setOpen(false);
      return;
    }
    const results = searchExercises(trimmed);
    if (results.length === 1) {
      const only = results[0];
      onSelect({ exerciseId: only.id, name: only.name });
      setOpen(false);
      return;
    }
    if (onRequestCreateExercise) {
      if (results.length === 0) {
        onRequestCreateExercise(trimmed);
        setOpen(false);
      }
      return;
    }
    if (showCustomOption) {
      onSelect({ name: trimmed });
      setOpen(false);
    }
  }

  const trimmed = value.trim();
  const showCreateRow =
    Boolean(trimmed && onRequestCreateExercise && !exactMatchForInput);

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
          handleEnter();
        }}
        className={inputClassName}
      />

      {open && (
        <div className={dropdownClassName}>
          {trimmed ? (
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
              {showCreateRow && (
                <li className="border-t border-teal-900/40 mt-1">
                  <button
                    type="button"
                    onMouseDown={(ev) => ev.preventDefault()}
                    onClick={selectCustomOrCreate}
                    className="w-full text-left px-3 py-2 text-sm text-[color:var(--color-accent)] hover:bg-teal-950/30 transition"
                  >
                    {createPromptLabel}
                  </button>
                </li>
              )}
              {!onRequestCreateExercise && showCustomOption && (
                <li className="border-t border-teal-900/40 mt-1">
                  <button
                    type="button"
                    onMouseDown={(ev) => ev.preventDefault()}
                    onClick={selectCustomOrCreate}
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
