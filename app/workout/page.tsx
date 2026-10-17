"use client";
import { targetLabel, targetsForExercise } from "@/lib/training/targets";
import { equipmentFor, suggestNext, suggestionLabel, type ExerciseSession, type Phase } from "@/lib/training/progression";
import { DELOAD_DAYS, deloadSets, deloadSuggestion, type DeloadRecord } from "@/lib/training/deload";
import { deloadStore } from "@/lib/physique/io/deload";
import { addDays, localDateKey, type LocalDate } from "@/lib/dates";
import { goalStore } from "@/lib/physique/io/repos";
import { useSingleton } from "@/lib/storage/useStored";
import { useIsHydrated } from "@/lib/ui/useIsHydrated";
import {
  useState,
  useEffect,
  useLayoutEffect,
  useRef,
  useMemo,
} from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useWorkoutStore } from "@/lib/workout-store";
import {
  getWorkoutHistory,
} from "@/lib/trainingAnalysis";
import {
  getActiveWorkout,
  saveActiveWorkout,
  clearActiveWorkout,
  draftHasMeaningfulContent,
  type DraftWorkout,
} from "@/lib/activeWorkout";
import { useUnit } from "@/lib/unit-preference";
import {
  getExerciseByName,
  normalizeExerciseName,
} from "@/lib/exerciseLibrary";
import ExercisePicker, { type ExercisePickerValue } from "@/components/ExercisePicker";
import CreateExerciseModal from "@/components/CreateExerciseModal";
import { SortableList, DragHandle } from "@/components/SortableList";
import {
  USER_EXERCISE_LIBRARY_EVENT,
  userRecordToExercise,
  type UserExerciseRecord,
} from "@/lib/userExerciseLibrary";
import { getCompletedLoggedSets, nextSetType, SET_TYPE_LABEL, SET_TYPE_MARK, setTypeOf, type SetType } from "@/lib/completedSets";
import { getTemplateById } from "@/lib/templateStorage";
import RestBar from "@/components/workout/RestBar";
import PlateCalculator from "@/components/workout/PlateCalculator";

const TEMPLATE_FOR_WORKOUT_KEY = "workoutFromTemplate";
const WORKOUT_HISTORY_KEY = "workoutHistory";
const WORKOUT_SUGGESTED_MUSCLE_KEY = "workoutSuggestedMuscle";
const KG_TO_LB = 2.2046226218;

function convertWeightValue(weight: string, from: "kg" | "lb", to: "kg" | "lb"): string {
  if (from === to) return weight;
  const raw = String(weight ?? "");
  const trimmed = raw.trim();
  if (!trimmed) return raw;
  const n = Number.parseFloat(trimmed);
  if (!Number.isFinite(n)) return raw;
  const converted = from === "kg" && to === "lb" ? n * KG_TO_LB : n / KG_TO_LB;
  const rounded = Math.round(converted * 10) / 10;
  if (!Number.isFinite(rounded)) return raw;
  if (Math.abs(rounded - Math.round(rounded)) < 0.000001) return String(Math.round(rounded));
  return rounded.toFixed(1).replace(/\.0$/, "");
}

type StoredWorkout = {
  completedAt: string;
  exercises: {
    exerciseId?: string;
    name: string;
    sets: { weight: string; reps: string; notes?: string; rir?: number; type?: SetType }[];
  }[];
};

type ExerciseRef = { exerciseId?: string; name: string };
type RestTimerState = {
  timerRunning: boolean;
  restDurationSec: number;
  timerStartedAt?: number;
  timerTargetEndAt?: number;
  remainingSec: number;
};


function getLastPerformanceForExercise(exercise: ExerciseRef): { weight: string; reps: string } | null {
  if (typeof window === "undefined") return null;
  try {
    const raw = localStorage.getItem(WORKOUT_HISTORY_KEY);
    if (!raw) return null;
    const workouts: StoredWorkout[] = JSON.parse(raw);
    if (!Array.isArray(workouts)) return null;
    const normalized = exercise.name.trim().toLowerCase();
    const sorted = [...workouts].sort(
      (a, b) => new Date(b.completedAt).getTime() - new Date(a.completedAt).getTime()
    );
    for (const workout of sorted) {
      const match = workout.exercises?.find(
        (ex) =>
          (exercise.exerciseId && ex.exerciseId && ex.exerciseId === exercise.exerciseId) ||
          ex.name?.trim().toLowerCase() === normalized
      );
      if (match?.sets?.length) {
        const lastSet = match.sets[match.sets.length - 1];
        if (lastSet?.weight != null && lastSet?.reps != null)
          return { weight: String(lastSet.weight), reps: String(lastSet.reps) };
      }
    }
    return null;
  } catch {
    return null;
  }
}

function getLastSetsForExercise(exercise: ExerciseRef): {
  weight: string;
  reps: string;
  notes?: string;
}[] {
  if (typeof window === "undefined") return [];
  try {
    const raw = localStorage.getItem(WORKOUT_HISTORY_KEY);
    if (!raw) return [];
    const workouts: StoredWorkout[] = JSON.parse(raw);
    if (!Array.isArray(workouts)) return [];
    const normalized = exercise.name.trim().toLowerCase();
    const sorted = [...workouts].sort(
      (a, b) => new Date(b.completedAt).getTime() - new Date(a.completedAt).getTime()
    );
    for (const workout of sorted) {
      const match = workout.exercises?.find(
        (ex) =>
          (exercise.exerciseId && ex.exerciseId && ex.exerciseId === exercise.exerciseId) ||
          ex.name?.trim().toLowerCase() === normalized
      );
      if (match?.sets?.length) {
        return match.sets.map((s) => ({
          weight: String(s?.weight ?? ""),
          reps: String(s?.reps ?? ""),
          notes: typeof s?.notes === "string" ? s.notes : undefined,
        }));
      }
    }
    return [];
  } catch {
    return [];
  }
}

/** Every logged session of an exercise, by id or name, as the progression rule reads it. */
function getSessionsForExercise(exercise: ExerciseRef): ExerciseSession[] {
  if (typeof window === "undefined") return [];
  try {
    const raw = localStorage.getItem(WORKOUT_HISTORY_KEY);
    if (!raw) return [];
    const workouts: StoredWorkout[] = JSON.parse(raw);
    if (!Array.isArray(workouts)) return [];
    const normalized = exercise.name.trim().toLowerCase();
    const out: ExerciseSession[] = [];
    for (const workout of workouts) {
      const match = workout.exercises?.find(
        (ex) =>
          (exercise.exerciseId && ex.exerciseId && ex.exerciseId === exercise.exerciseId) ||
          ex.name?.trim().toLowerCase() === normalized
      );
      if (match?.sets?.length && typeof workout.completedAt === "string") out.push({ completedAt: workout.completedAt, sets: match.sets });
    }
    return out;
  } catch {
    return [];
  }
}

/** Digits and at most one decimal (. or , normalized to .). */
function sanitizeWeightInput(raw: string): string {
  let out = "";
  let seenDot = false;
  for (const ch of raw) {
    if (ch >= "0" && ch <= "9") {
      out += ch;
      continue;
    }
    if ((ch === "." || ch === ",") && !seenDot) {
      seenDot = true;
      out += ".";
    }
  }
  return out;
}

function sanitizeRepsInput(raw: string): string {
  return raw.replace(/\D/g, "");
}

/** Single digit 0–5; paste takes first digit, >5 clamps to 5. */
function sanitizeRirInput(raw: string): string {
  const digits = raw.replace(/\D/g, "");
  if (digits === "") return "";
  const d = digits[0]!;
  const n = Number.parseInt(d, 10);
  if (n > 5) return "5";
  return d;
}

/** Today's local date on the phone; the logger is client-only. */
function todayLocal(): LocalDate {
  return localDateKey(new Date(), Intl.DateTimeFormat().resolvedOptions().timeZone);
}

/** Whether a stored deload covers a date. */
function isDeloadActive(record: DeloadRecord | null, today: LocalDate): boolean {
  if (!record) return false;
  return record.startDate <= today && today <= addDays(record.startDate, DELOAD_DAYS - 1);
}

/** The same read at mount time, for the routine prefill. */
function deloadActiveNow(): boolean {
  return isDeloadActive(deloadStore.snapshot(), todayLocal());
}

export default function WorkoutPage() {
  const router = useRouter();
  const { addWorkout } = useWorkoutStore();
  const { unit } = useUnit();
  const goal = useSingleton(goalStore);
  const phase: Phase = goal?.type === "lose" ? "cut" : goal?.type === "gain" ? "lean_bulk" : "maintain";
  const deloadRecord = useSingleton(deloadStore);
  const deloadActive = isDeloadActive(deloadRecord, todayLocal());
  const [exerciseName, setExerciseName] = useState("");
  const [exercises, setExercises] = useState<
    {
      id: number;
      exerciseId?: string;
      name: string;
      sets: { weight: string; reps: string; done?: boolean; notes?: string; rir?: number; type?: SetType }[];
      targetSets?: number;
      restSec: number;
      /** Rep range and RIR from the routine (T3), when it came from one. */
      repMin?: number;
      repMax?: number;
      rir?: number;
    }[]
  >([]);
  const [expandedNoteKey, setExpandedNoteKey] = useState<string | null>(null);
  // Long-press to reveal per-row edit/delete actions — replaces always-on trailing icons.
  const [setActionMenuKey, setSetActionMenuKey] = useState<string | null>(null);
  /** R5: the plate calculator sheet, opened from a set's long-press menu with that set's weight. */
  const [plateCalcWeight, setPlateCalcWeight] = useState<number | null>(null);
  const longPressTimerRef = useRef<number | null>(null);
  const longPressFiredRef = useRef<boolean>(false);
  const [restAdjustExerciseId, setRestAdjustExerciseId] = useState<number | null>(null);
  const [exerciseMenuOpenId, setExerciseMenuOpenId] = useState<number | null>(null);
  const [reorderMode, setReorderMode] = useState(false);
  const [showSummary, setShowSummary] = useState(false);
  const [showDiscardConfirm, setShowDiscardConfirm] = useState(false);
  const [routineChanges, setRoutineChanges] = useState<string[] | null>(null);
  const [lastPerformance, setLastPerformance] = useState<
    Record<string, { weight: string; reps: string } | null>
  >({});
  const [nextTarget, setNextTarget] = useState<Record<string, string | null>>({});
  const [workoutName, setWorkoutName] = useState("");
  const [templateName, setTemplateName] = useState<string | null>(null);
  const [templateId, setTemplateId] = useState<string | null>(null);
  const [routineSaved, setRoutineSaved] = useState(false);
  const addExerciseInputRef = useRef<HTMLInputElement | null>(null);
  const setInputRefs = useRef<Record<string, HTMLInputElement | null>>({});
  const setDoneButtonRefs = useRef<Record<string, HTMLButtonElement | null>>({});
  const [pendingFocus, setPendingFocus] = useState<{ exerciseId: number; setIndex: number } | null>(null);
  const [elapsedSec, setElapsedSec] = useState(0);
  const [restByExercise, setRestByExercise] = useState<Record<number, RestTimerState>>({});
  const [startTime, setStartTime] = useState<number | null>(null);
  const [createExerciseOpen, setCreateExerciseOpen] = useState(false);
  const [createExerciseSeedName, setCreateExerciseSeedName] = useState("");
  const [replaceExerciseTargetId, setReplaceExerciseTargetId] = useState<number | null>(null);
  const [replaceExerciseInput, setReplaceExerciseInput] = useState("");
  const [userLibraryRevision, setUserLibraryRevision] = useState(0);
  const loadHandledRef = useRef(false);
  const persistReadyRef = useRef(false);
  /** After Finish or Discard, do not write activeWorkout again (state may still hold old exercises). */
  const persistEnabledRef = useRef(true);
  const latestWorkoutRef = useRef({
    exercises,
    workoutName,
    templateName,
    templateId,
    startTime,
    restByExercise,
  });
  latestWorkoutRef.current = { exercises, workoutName, templateName, templateId, startTime, restByExercise };

  function recalculateRestTimers(
    timers: Record<number, RestTimerState>,
    nowMs = Date.now()
  ): Record<number, RestTimerState> {
    const next: Record<number, RestTimerState> = {};
    for (const [k, t] of Object.entries(timers)) {
      const idNum = Number(k);
      if (!t) continue;
      if (!t.timerRunning) {
        next[idNum] = {
          ...t,
          timerRunning: false,
          remainingSec: Math.max(0, t.remainingSec ?? 0),
        };
        continue;
      }
      const target = t.timerTargetEndAt;
      if (!target || !Number.isFinite(target)) {
        next[idNum] = { ...t, timerRunning: false, remainingSec: 0 };
        continue;
      }
      const remainingSec = Math.max(0, Math.ceil((target - nowMs) / 1000));
      next[idNum] = {
        ...t,
        remainingSec,
        timerRunning: remainingSec > 0,
      };
    }
    return next;
  }

  useEffect(() => {
    if (startTime === null) return;
    const id = window.setInterval(() => {
      setElapsedSec(Math.floor((Date.now() - startTime) / 1000));
    }, 1000);
    return () => window.clearInterval(id);
  }, [startTime]);

  useEffect(() => {
    function handleUnitConverted(event: Event) {
      const custom = event as CustomEvent<{ from?: "kg" | "lb"; to?: "kg" | "lb" }>;
      const from = custom.detail?.from;
      const to = custom.detail?.to;
      if (!from || !to || from === to) return;
      setExercises((prev) =>
        prev.map((exercise) => ({
          ...exercise,
          sets: exercise.sets.map((set) => ({
            ...set,
            weight:
              typeof set.weight === "string"
                ? convertWeightValue(set.weight, from, to)
                : set.weight,
          })),
        }))
      );
    }
    window.addEventListener("weightUnitConverted", handleUnitConverted as EventListener);
    return () => {
      window.removeEventListener("weightUnitConverted", handleUnitConverted as EventListener);
    };
  }, []);

  useEffect(() => {
    const anyRunning = Object.values(restByExercise).some((t) => t.timerRunning && t.remainingSec > 0);
    if (!anyRunning) return;
    const id = window.setInterval(() => {
      setRestByExercise((prev) => recalculateRestTimers(prev));
    }, 1000);
    return () => window.clearInterval(id);
  }, [restByExercise]);

  useEffect(() => {
    function onVisibility() {
      if (document.visibilityState === "visible") {
        setRestByExercise((prev) => recalculateRestTimers(prev));
      }
    }
    document.addEventListener("visibilitychange", onVisibility);
    return () => document.removeEventListener("visibilitychange", onVisibility);
  }, []);

  useEffect(() => {
    if (restAdjustExerciseId === null) return;
    function onKey(e: globalThis.KeyboardEvent) {
      if (e.key === "Escape") setRestAdjustExerciseId(null);
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [restAdjustExerciseId]);

  useEffect(() => {
    if (restAdjustExerciseId === null) return;
    if (!exercises.some((e) => e.id === restAdjustExerciseId)) setRestAdjustExerciseId(null);
  }, [exercises, restAdjustExerciseId]);

  useEffect(() => {
    if (!pendingFocus) return;
    const key = `${pendingFocus.exerciseId}-${pendingFocus.setIndex}-weight`;
    const el = setInputRefs.current[key];
    if (!el) return;
    requestAnimationFrame(() => {
      el.focus();
      el.select?.();
    });
    setPendingFocus(null);
  }, [pendingFocus]);

  const totalSetsLogged = exercises.reduce((total, ex) => total + ex.sets.length, 0);
  const workoutHistory = getWorkoutHistory();
  const lastLoggedWorkout = [...workoutHistory].sort(
    (a, b) => new Date(b.completedAt).getTime() - new Date(a.completedAt).getTime()
  )[0];

  const hydrated = useIsHydrated();
  const recentExerciseHint = useMemo(() => {
    const exs = lastLoggedWorkout?.exercises ?? [];
    const seen = new Set<string>();
    const names: string[] = [];
    for (const ex of exs) {
      const n = ex.name?.trim();
      if (!n) continue;
      const key = n.toLowerCase();
      if (seen.has(key)) continue;
      seen.add(key);
      names.push(n);
      if (names.length >= 5) break;
    }
    return names;
  }, [lastLoggedWorkout]);

  useEffect(() => {
    function bump() {
      setUserLibraryRevision((r) => r + 1);
    }
    window.addEventListener(USER_EXERCISE_LIBRARY_EVENT, bump);
    return () => window.removeEventListener(USER_EXERCISE_LIBRARY_EVENT, bump);
  }, []);

  const showWorkoutStats = exercises.length > 0;

  function workoutDisplayName(w: { name?: string; exercises?: { name: string }[] }) {
    const n = typeof w.name === "string" ? w.name.trim() : "";
    if (n) return n;
    const first = w.exercises?.[0]?.name?.trim?.() ? w.exercises[0].name.trim() : "";
    if (first) return `${first} Workout`;
    return "Workout";
  }

  function formatElapsed(sec: number) {
    const h = Math.floor(sec / 3600);
    const m = Math.floor((sec % 3600) / 60);
    const s = sec % 60;
    if (h > 0) return `${h}:${String(m).padStart(2, "0")}:${String(s).padStart(2, "0")}`;
    return `${m}:${String(s).padStart(2, "0")}`;
  }

  function formatRest(sec: number) {
    const m = Math.floor(sec / 60);
    const s = sec % 60;
    return `${m}:${String(s).padStart(2, "0")}`;
  }

  function startExerciseRest(exerciseId: number, seconds: number) {
    const now = Date.now();
    const duration = Math.max(0, seconds);
    setRestByExercise((prev) => ({
      ...prev,
      [exerciseId]: {
        timerRunning: duration > 0,
        restDurationSec: duration,
        timerStartedAt: now,
        timerTargetEndAt: now + duration * 1000,
        remainingSec: duration,
      },
    }));
  }

  function resetExerciseRest(exerciseId: number) {
    setRestByExercise((prev) => ({
      ...prev,
      [exerciseId]: {
        timerRunning: false,
        restDurationSec: prev[exerciseId]?.restDurationSec ?? 0,
        remainingSec: 0,
      },
    }));
  }

  /** R5: −15 / +15 on a running rest moves its end time; the bar's progress keeps the new total. */
  function nudgeRunningRest(exerciseId: number, deltaSec: number) {
    setRestByExercise((prev) => {
      const t = prev[exerciseId];
      if (!t || !t.timerRunning || typeof t.timerTargetEndAt !== "number") return prev;
      const now = Date.now();
      const targetEnd = Math.max(now, t.timerTargetEndAt + deltaSec * 1000);
      const remainingSec = Math.max(0, Math.ceil((targetEnd - now) / 1000));
      return {
        ...prev,
        [exerciseId]: {
          ...t,
          timerRunning: remainingSec > 0,
          restDurationSec: Math.max(0, t.restDurationSec + deltaSec),
          timerTargetEndAt: targetEnd,
          remainingSec,
        },
      };
    });
  }

  function adjustExerciseRest(exerciseId: number, delta: number) {
    setExercises((prev) =>
      prev.map((ex) =>
        ex.id === exerciseId
          ? { ...ex, restSec: Math.max(0, Math.min(600, (ex.restSec ?? 90) + delta)) }
          : ex
      )
    );
  }

  function setExerciseRest(exerciseId: number, restSec: number) {
    setExercises((prev) =>
      prev.map((ex) =>
        ex.id === exerciseId ? { ...ex, restSec: Math.max(0, Math.min(600, restSec)) } : ex
      )
    );
  }

  function saveAsRoutineFromSession() {
    if (typeof window === "undefined") return;
    try {
      const STORAGE_KEY = "workoutTemplates";
      const raw = localStorage.getItem(STORAGE_KEY);
      const existing = raw ? JSON.parse(raw) : [];
      const templates = Array.isArray(existing) ? existing : [];

      const name =
        getWorkoutDisplayName().trim() ||
        `Routine ${new Date().toLocaleDateString(undefined, { month: "short", day: "numeric" })}`;

      const routine = {
        id: `tpl_${Date.now()}`,
        name,
        exercises: exercises.map((ex) => ({
          ...(ex.exerciseId ? { exerciseId: ex.exerciseId } : {}),
          name: ex.name,
          targetSets: Math.max(
            1,
            Math.min(20, (ex.targetSets ?? (ex.sets.length || 3)))
          ),
          restSec: ex.restSec ?? 90,
        })),
      };

      localStorage.setItem(STORAGE_KEY, JSON.stringify([...templates, routine]));
      setRoutineSaved(true);
    } catch {
      // ignore
    }
  }

  function overwriteTemplateFromSession() {
    if (typeof window === "undefined" || !templateId) return;
    try {
      const STORAGE_KEY = "workoutTemplates";
      const raw = localStorage.getItem(STORAGE_KEY);
      const existing = raw ? JSON.parse(raw) : [];
      const templates = Array.isArray(existing) ? existing : [];
      const updated = templates.map((tpl) =>
        tpl && typeof tpl === "object" && (tpl as { id?: string }).id === templateId
          ? {
              ...tpl,
              name: getWorkoutDisplayName().trim() || (tpl as { name?: string }).name || "Template",
              exercises: exercises.map((ex) => ({
                ...(ex.exerciseId ? { exerciseId: ex.exerciseId } : {}),
                name: ex.name,
                targetSets: Math.max(1, Math.min(20, ex.targetSets ?? ex.sets.length ?? 3)),
                restSec: ex.restSec ?? 90,
              })),
            }
          : tpl
      );
      localStorage.setItem(STORAGE_KEY, JSON.stringify(updated));
      setRoutineSaved(true);
    } catch {
      // ignore
    }
  }

  useEffect(() => {
    if (exercises.length === 0) {
      setLastPerformance({});
      setNextTarget({});
      return;
    }
    const lastMap: Record<string, { weight: string; reps: string } | null> = {};
    const targetMap: Record<string, string | null> = {};
    for (const ex of exercises) {
      lastMap[ex.name] = getLastPerformanceForExercise({
        exerciseId: ex.exerciseId,
        name: ex.name,
      });
      const targets =
        ex.repMin != null && ex.repMax != null && ex.rir != null
          ? { repMin: ex.repMin, repMax: ex.repMax, rir: ex.rir }
          : targetsForExercise(ex.name);
      const raw = suggestNext({ name: ex.name, targets, sessions: getSessionsForExercise({ exerciseId: ex.exerciseId, name: ex.name }), unit, phase });
      const s = deloadActive ? deloadSuggestion(raw, equipmentFor(ex.name)) : raw;
      const label = suggestionLabel(s, unit);
      targetMap[ex.name] = label && deloadActive && s.kind === "next" ? `${label.replace(/^Next/, "Deload")} · RIR ${s.rir}+` : label;
    }
    setLastPerformance(lastMap);
    setNextTarget(targetMap);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [exercises.map((e) => `${e.name}:${e.repMin}-${e.repMax}@${e.rir}`).join(","), unit, phase, deloadActive]);

  useEffect(() => {
    if (typeof window === "undefined" || loadHandledRef.current) return;
    loadHandledRef.current = true;
    const suggestedMuscle = sessionStorage.getItem(WORKOUT_SUGGESTED_MUSCLE_KEY);
    if (suggestedMuscle) {
      sessionStorage.removeItem(WORKOUT_SUGGESTED_MUSCLE_KEY);
      const suggestion = suggestedMuscle.trim();
      if (suggestion) {
        setExerciseName(suggestion);
      }
    }

    const fromTemplate = sessionStorage.getItem(TEMPLATE_FOR_WORKOUT_KEY);
    if (fromTemplate) {
      try {
        const data = JSON.parse(fromTemplate) as {
          exercises?: unknown[];
          templateName?: string;
          templateId?: string;
          emptyWorkout?: boolean;
          workoutName?: string;
        };
        const exercisesData = data?.exercises;
        const tName = typeof data?.templateName === "string" ? data.templateName.trim() : "";
        const tId = typeof data?.templateId === "string" ? data.templateId.trim() : "";
        sessionStorage.removeItem(TEMPLATE_FOR_WORKOUT_KEY);

        if (data.emptyWorkout === true) {
          clearActiveWorkout();
          setTemplateName(null);
          setTemplateId(null);
          const wn = typeof data.workoutName === "string" ? data.workoutName.trim() : "";
          setWorkoutName(wn);
          setStartTime(null);
          setElapsedSec(0);
          setExercises([]);
          persistReadyRef.current = true;
          return;
        }

        if (Array.isArray(exercisesData) && exercisesData.length > 0) {
          if (tName) {
            setTemplateName(tName);
            setWorkoutName((prev) => (prev.trim() ? prev : tName));
          }
          if (tId) setTemplateId(tId);
          const now = Date.now();
          setStartTime(now);
          const initial = exercisesData.map((ex, i) => {
            const name = typeof ex === "string" ? ex : (ex as { name?: string })?.name ?? "Exercise";
            const normalized = normalizeExerciseName(name);
            const byName = getExerciseByName(normalized);
            const exerciseIdFromTemplate =
              typeof ex === "object" && ex !== null && "exerciseId" in ex
                ? (ex as { exerciseId?: string }).exerciseId
                : undefined;
            const targetSets = typeof ex === "object" && ex !== null && "targetSets" in ex
              ? Math.max(1, Math.min(20, Number((ex as { targetSets?: number }).targetSets) || 3))
              : undefined;
            const rawRest = typeof ex === "object" && ex !== null && "restSec" in ex ? (ex as { restSec?: number }).restSec : undefined;
            const restSec =
              rawRest != null && Number.isFinite(Number(rawRest))
                ? Math.max(0, Math.min(600, Number(rawRest)))
                : 0;
            const t = typeof ex === "object" && ex !== null ? (ex as { repMin?: number; repMax?: number; rir?: number }) : {};
            const targets =
              Number.isFinite(Number(t.repMin)) && Number.isFinite(Number(t.repMax)) && Number.isFinite(Number(t.rir))
                ? { repMin: Number(t.repMin), repMax: Number(t.repMax), rir: Number(t.rir) }
                : {};
            const plannedSets = targetSets != null && deloadActiveNow() ? deloadSets(targetSets) : (targetSets ?? 0);
            const sets = Array.from(
              { length: Math.max(0, plannedSets) },
              () =>
                ({
                  weight: "",
                  reps: "",
                  done: false,
                  notes: "",
                } as {
                  weight: string;
                  reps: string;
                  done?: boolean;
                  notes?: string;
                  rir?: number;
                })
            );
            return {
              id: now + i,
              ...(exerciseIdFromTemplate || byName?.id
                ? { exerciseId: exerciseIdFromTemplate ?? byName?.id }
                : {}),
              name: byName?.name ?? name,
              sets,
              targetSets,
              restSec,
              ...targets,
            };
          });
          setExercises(initial);
        }
      } catch {
        sessionStorage.removeItem(TEMPLATE_FOR_WORKOUT_KEY);
      }
      persistReadyRef.current = true;
      return;
    }

    const draft = getActiveWorkout();
    if (draft && draftHasMeaningfulContent(draft)) {
      setWorkoutName(draft.workoutName);
      setTemplateName(draft.templateName);
      setTemplateId(draft.templateId ?? null);
      setExercises(
        draft.exercises.map((ex) => ({
          ...ex,
          sets:
            ex.sets && ex.sets.length > 0
              ? ex.sets
              : [{ weight: "", reps: "", done: false, notes: "" }],
        }))
      );
      setStartTime(draft.startedAt);
      setElapsedSec(Math.max(0, Math.floor((Date.now() - draft.startedAt) / 1000)));
      const restoredTimers: Record<number, RestTimerState> = {};
      for (const [k, t] of Object.entries(draft.restTimerByExercise ?? {})) {
        const key = Number(k);
        if (!Number.isFinite(key)) continue;
        const safeRest = Math.max(0, Number(t?.restDurationSec ?? 0) || 0);
        const timerRunning = Boolean(t?.timerRunning);
        const timerStartedAt =
          typeof t?.timerStartedAt === "number" && Number.isFinite(t.timerStartedAt)
            ? t.timerStartedAt
            : undefined;
        const timerTargetEndAt =
          typeof t?.timerTargetEndAt === "number" && Number.isFinite(t.timerTargetEndAt)
            ? t.timerTargetEndAt
            : undefined;
        const remainingSec =
          timerRunning && timerTargetEndAt
            ? Math.max(0, Math.ceil((timerTargetEndAt - Date.now()) / 1000))
            : 0;
        restoredTimers[key] = {
          timerRunning,
          restDurationSec: safeRest,
          timerStartedAt,
          timerTargetEndAt,
          remainingSec,
        };
      }
      setRestByExercise(recalculateRestTimers(restoredTimers));
    }
    persistReadyRef.current = true;
  }, []);

  useEffect(() => {
    persistEnabledRef.current = true;
  }, []);

  const persistActiveDraftRef = useRef<() => void>(() => {});
  persistActiveDraftRef.current = () => {
    if (typeof window === "undefined" || !persistReadyRef.current || !persistEnabledRef.current) return;
    const {
      exercises: exs,
      workoutName: wn,
      templateName: tn,
      templateId: tid,
      startTime: st,
      restByExercise: timers,
    } = latestWorkoutRef.current;
    const pseudo: DraftWorkout = {
      startedAt: 0,
      workoutName: wn,
      templateName: tn,
      ...(tid ? { templateId: tid } : {}),
      exercises: exs.map((ex) => ({
        id: ex.id,
        ...(ex.exerciseId ? { exerciseId: ex.exerciseId } : {}),
        name: ex.name,
        sets: ex.sets.map((s) => ({
          weight: s.weight,
          reps: s.reps,
          done: s.done,
          notes: s.notes,
          ...(typeof s.rir === "number" && Number.isFinite(s.rir) ? { rir: s.rir } : {}),
          ...(s.type && s.type !== "working" ? { type: s.type } : {}),
        })),
        targetSets: ex.targetSets,
        restSec: ex.restSec ?? 90,
      })),
    };
    if (!draftHasMeaningfulContent(pseudo)) {
      clearActiveWorkout();
      return;
    }
    let started = st;
    if (started === null) {
      started = Date.now();
      setStartTime(started);
    }
    const draft: DraftWorkout = {
      ...pseudo,
      startedAt: started,
      restTimerByExercise: Object.fromEntries(
        Object.entries(timers ?? {}).map(([k, t]) => [
          Number(k),
          {
            timerRunning: Boolean(t?.timerRunning),
            restDurationSec: Math.max(0, Number(t?.restDurationSec ?? 0) || 0),
            ...(typeof t?.timerStartedAt === "number" && Number.isFinite(t.timerStartedAt)
              ? { timerStartedAt: t.timerStartedAt }
              : {}),
            ...(typeof t?.timerTargetEndAt === "number" && Number.isFinite(t.timerTargetEndAt)
              ? { timerTargetEndAt: t.timerTargetEndAt }
              : {}),
          },
        ])
      ),
    };
    saveActiveWorkout(draft);
  };

  useLayoutEffect(() => {
    persistActiveDraftRef.current();
  }, [exercises, workoutName, templateName, startTime, restByExercise]);

  useEffect(() => {
    const flush = () => persistActiveDraftRef.current();
    const onVisibility = () => {
      if (document.visibilityState === "hidden") flush();
    };
    window.addEventListener("pagehide", flush);
    document.addEventListener("visibilitychange", onVisibility);
    return () => {
      window.removeEventListener("pagehide", flush);
      document.removeEventListener("visibilitychange", onVisibility);
    };
  }, []);

  function getWorkoutDisplayName() {
    const user = workoutName.trim();
    if (user) return user;
    const t = (templateName ?? "").trim();
    if (t) return t;
    const first = exercises[0]?.name?.trim();
    if (first) return `${first} Workout`;
    const d = new Date();
    const short = d.toLocaleDateString(undefined, { month: "short", day: "numeric" });
    return `Workout · ${short}`;
  }

  function detectRoutineChanges(
    templateExercises: { name: string; exerciseId?: string; targetSets: number }[],
    completedExercises: { name: string; exerciseId?: string; sets: unknown[] }[]
  ): string[] {
    const norm = (s: string) => s.toLowerCase().trim();
    const templateMap = new Map(
      templateExercises.map((ex) => [ex.exerciseId ?? norm(ex.name), ex])
    );
    const completedMap = new Map(
      completedExercises.map((ex) => [ex.exerciseId ?? norm(ex.name), ex])
    );
    const changes: string[] = [];

    for (const [key, tex] of templateMap) {
      const cex = completedMap.get(key);
      if (!cex) {
        changes.push(`Removed "${tex.name}"`);
      } else if ((cex.sets as unknown[]).length !== tex.targetSets) {
        changes.push(
          `"${tex.name}" — ${(cex.sets as unknown[]).length} set${(cex.sets as unknown[]).length !== 1 ? "s" : ""} instead of ${tex.targetSets}`
        );
      }
    }
    for (const [key, cex] of completedMap) {
      if (!templateMap.has(key)) {
        changes.push(`Added "${cex.name}"`);
      }
    }
    return changes;
  }

  function finishWorkout() {
    if (exercises.length === 0) return;
    setRoutineSaved(false);
    setRestByExercise({});
    const completedExercises = exercises
      .map(({ exerciseId, name, sets, restSec }) => {
        // P1.9: persist only confirmed sets (green check tapped).
        // Drafts — values entered but not confirmed — never enter the trend
        // data layer the AI / Signals / Plateau / Volume / Progress read from.
        const confirmedSetsOnly = sets.filter((s) => s.done === true);
        const completedSets = getCompletedLoggedSets(confirmedSetsOnly).map(({ weight, reps, notes, rir, type }) => {
          const out: { weight: string; reps: string; notes?: string; rir?: number; type?: SetType } = {
            weight: String(weight ?? ""),
            reps: String(reps ?? ""),
          };
          if (notes?.trim()) out.notes = notes.trim();
          if (typeof rir === "number" && Number.isFinite(rir)) out.rir = rir;
          if (type && type !== "working") out.type = type;
          return out;
        });
        return {
          ...(exerciseId ? { exerciseId } : {}),
          name,
          restSec,
          sets: completedSets,
        };
      })
      .filter((ex) => ex.sets.length > 0);
    const totalSets = completedExercises.reduce((total, ex) => total + ex.sets.length, 0);
    const finalName = getWorkoutDisplayName();
    const completed = {
      completedAt: new Date().toISOString(),
      name: finalName,
      durationSec: elapsedSec,
      exercises: completedExercises,
      totalExercises: completedExercises.length,
      totalSets,
    };
    addWorkout(completed);
    clearActiveWorkout();
    persistEnabledRef.current = false;

    if (templateId) {
      const sourceTemplate = getTemplateById(templateId);
      if (sourceTemplate) {
        const changes = detectRoutineChanges(sourceTemplate.exercises, completedExercises);
        setRoutineChanges(changes.length > 0 ? changes : null);
      } else {
        setRoutineChanges(null);
      }
    } else {
      setRoutineChanges(null);
    }

    setShowSummary(true);
  }

  function discardWorkout() {
    persistEnabledRef.current = false;
    clearActiveWorkout();
    setExercises([]);
    setWorkoutName("");
    setTemplateName(null);
    setTemplateId(null);
    setRestByExercise({});
    setShowSummary(false);
    setShowDiscardConfirm(false);
    router.push("/");
  }

  function openCreateExerciseFlow(seedName: string) {
    setCreateExerciseSeedName(seedName.trim());
    setCreateExerciseOpen(true);
  }

  function reorderExercisesByIds(nextIds: number[]) {
    setExercises((prev) => {
      const byId = new Map(prev.map((e) => [e.id, e] as const));
      const reordered = nextIds.map((id) => byId.get(id)).filter((e): e is typeof prev[number] => Boolean(e));
      // Append any exercises not in nextIds (shouldn't happen, but defensive)
      for (const e of prev) if (!nextIds.includes(e.id)) reordered.push(e);
      return reordered;
    });
  }

  function exerciseHasMeaningfulLoggedData(exerciseId: number): boolean {
    const ex = exercises.find((e) => e.id === exerciseId);
    if (!ex) return false;
    return ex.sets.some((s) => {
      const w = String(s.weight ?? "").trim();
      const r = String(s.reps ?? "").trim();
      const n = String(s.notes ?? "").trim();
      return Boolean(w || r || n || s.done || (typeof s.rir === "number" && Number.isFinite(s.rir)));
    });
  }

  function replaceExerciseAtSlot(exerciseId: number, nextExercise: { id: string; name: string }) {
    setExercises((prev) =>
      prev.map((ex) =>
        ex.id === exerciseId
          ? {
              ...ex,
              exerciseId: nextExercise.id,
              name: nextExercise.name,
              sets: [{ weight: "", reps: "", done: false, notes: "" }],
            }
          : ex
      )
    );
    setRestByExercise((prev) => ({
      ...prev,
      [exerciseId]: {
        timerRunning: false,
        restDurationSec: prev[exerciseId]?.restDurationSec ?? 0,
        remainingSec: 0,
      },
    }));
  }

  function requestReplaceExercise(selection?: ExercisePickerValue) {
    if (replaceExerciseTargetId === null) return;
    const value = (selection?.name ?? replaceExerciseInput).trim();
    if (!value) return;
    const selectedFromPicker = selection?.exerciseId
      ? { id: selection.exerciseId, name: selection.name }
      : null;
    const matched = selectedFromPicker ?? getExerciseByName(value);
    if (!matched) {
      openCreateExerciseFlow(value);
      return;
    }
    const hasData = exerciseHasMeaningfulLoggedData(replaceExerciseTargetId);
    if (
      hasData &&
      !window.confirm(
        "This exercise has logged data. Replacing it will clear sets for this slot. Continue?"
      )
    ) {
      return;
    }
    replaceExerciseAtSlot(replaceExerciseTargetId, { id: matched.id, name: matched.name });
    setReplaceExerciseTargetId(null);
    setReplaceExerciseInput("");
    setExerciseMenuOpenId(null);
  }

  function appendExerciseFromLibrary(matched: { id: string; name: string }) {
    const newExercise = {
      id: Date.now(),
      exerciseId: matched.id,
      name: matched.name,
      sets: [{ weight: "", reps: "", done: false, notes: "" }],
      restSec: 90,
    };
    setExercises((prev) => [...prev, newExercise]);
    setExerciseName("");
  }

  function handleUserExerciseCreated(record: UserExerciseRecord) {
    const ex = userRecordToExercise(record);
    if (replaceExerciseTargetId !== null) {
      const hasData = exerciseHasMeaningfulLoggedData(replaceExerciseTargetId);
      if (
        hasData &&
        !window.confirm(
          "This exercise has logged data. Replacing it will clear sets for this slot. Continue?"
        )
      ) {
        return;
      }
      replaceExerciseAtSlot(replaceExerciseTargetId, { id: ex.id, name: ex.name });
      setReplaceExerciseTargetId(null);
      setReplaceExerciseInput("");
      setExerciseMenuOpenId(null);
    } else {
      appendExerciseFromLibrary({ id: ex.id, name: ex.name });
    }
    setUserLibraryRevision((r) => r + 1);
  }

  function addExercise(selection?: ExercisePickerValue) {
    const trimmed = (selection?.name ?? exerciseName).trim();
    if (!trimmed) {
      addExerciseInputRef.current?.focus();
      return;
    }

    const selectedFromPicker = selection?.exerciseId
      ? { id: selection.exerciseId, name: selection.name }
      : null;
    const matched = selectedFromPicker ?? getExerciseByName(trimmed);

    if (!matched) {
      openCreateExerciseFlow(trimmed);
      return;
    }

    appendExerciseFromLibrary({ id: matched.id, name: matched.name });
  }

  function addSetRow(exerciseId: number) {
    const ex = exercises.find((e) => e.id === exerciseId);
    const nextIndex = ex?.sets?.length ?? 0;
    setExercises((prev) =>
      prev.map((exercise) =>
        exercise.id === exerciseId
          ? {
              ...exercise,
              sets: [...exercise.sets, { weight: "", reps: "", done: false, notes: "" }],
            }
          : exercise
      )
    );
    setPendingFocus({ exerciseId, setIndex: nextIndex });
  }

  function updateSetValue(
    exerciseId: number,
    setIndex: number,
    field: "weight" | "reps",
    value: string
  ) {
    setExercises((prev) =>
      prev.map((exercise) => {
        if (exercise.id !== exerciseId) return exercise;
        const sets = [...exercise.sets];
        while (sets.length <= setIndex) sets.push({ weight: "", reps: "", done: false, notes: "" });
        sets[setIndex] = { ...sets[setIndex], [field]: value };
        return { ...exercise, sets };
      })
    );
  }

  function updateSetRir(exerciseId: number, setIndex: number, raw: string) {
    setExercises((prev) =>
      prev.map((exercise) => {
        if (exercise.id !== exerciseId) return exercise;
        const sets = [...exercise.sets];
        while (sets.length <= setIndex) sets.push({ weight: "", reps: "", done: false, notes: "" });
        const cur = sets[setIndex];
        const trimmed = raw.trim();
        if (trimmed === "") {
          const { rir: _drop, ...rest } = cur;
          sets[setIndex] = rest;
          return { ...exercise, sets };
        }
        const n = Number.parseInt(trimmed, 10);
        if (!Number.isFinite(n)) return { ...exercise, sets };
        const clamped = Math.max(0, Math.min(5, n));
        sets[setIndex] = { ...cur, rir: clamped };
        return { ...exercise, sets };
      })
    );
  }

  /** T1: tap the set number to cycle working → warm-up → drop → failure. */
  function cycleSetType(exerciseId: number, setIndex: number) {
    setExercises((prev) =>
      prev.map((exercise) => {
        if (exercise.id !== exerciseId) return exercise;
        const sets = [...exercise.sets];
        const current = sets[setIndex];
        if (!current) return exercise;
        const next = nextSetType(setTypeOf(current));
        const updated = { ...current };
        if (next === "working") delete updated.type;
        else updated.type = next;
        sets[setIndex] = updated;
        return { ...exercise, sets };
      })
    );
  }

  function updateSetNotes(exerciseId: number, setIndex: number, value: string) {
    setExercises((prev) =>
      prev.map((exercise) => {
        if (exercise.id !== exerciseId) return exercise;
        const sets = [...exercise.sets];
        while (sets.length <= setIndex) sets.push({ weight: "", reps: "", done: false, notes: "" });
        sets[setIndex] = { ...sets[setIndex], notes: value };
        return { ...exercise, sets };
      })
    );
  }

  function toggleSetDone(
    exerciseId: number,
    setIndex: number,
    placeholderWeight?: string | null,
    placeholderReps?: string | null
  ) {
    setExercises((prev) =>
      prev.map((exercise) => {
        if (exercise.id !== exerciseId) return exercise;
        if (setIndex < 0) return exercise;
        const sets = [...exercise.sets];
        while (sets.length <= setIndex) sets.push({ weight: "", reps: "", done: false, notes: "" });
        const current = sets[setIndex] ?? { weight: "", reps: "", done: false, notes: "" };
        const willBeDone = !Boolean(current.done);
        // P1.9: tapping the green check on a row with the placeholder showing
        // (no user-typed value yet, but last-session value is visible as a
        // hint) commits those placeholder values as the user's confirmation.
        const weightToCommit =
          willBeDone && (current.weight ?? "").trim() === "" && placeholderWeight
            ? placeholderWeight
            : current.weight;
        const repsToCommit =
          willBeDone && (current.reps ?? "").trim() === "" && placeholderReps
            ? placeholderReps
            : current.reps;
        sets[setIndex] = {
          ...current,
          done: willBeDone,
          weight: weightToCommit,
          reps: repsToCommit,
        };
        return { ...exercise, sets };
      })
    );

    // When a set is completed, start the rest timer for this exercise.
    const ex = exercises.find((e) => e.id === exerciseId);
    if (ex) {
      const current = ex.sets[setIndex];
      const willBeDone = !Boolean(current?.done);
      if (willBeDone) {
        const isFinalPlannedSet =
          (typeof ex.targetSets === "number" && ex.targetSets > 0 && setIndex >= ex.targetSets - 1) ||
          setIndex >= ex.sets.length - 1;
        if (!isFinalPlannedSet) {
          startExerciseRest(exerciseId, ex.restSec ?? 90);
        } else {
          resetExerciseRest(exerciseId);
        }
        // If planned sets exist and we just completed the last logged set, auto-create the next slot.
        if (ex.targetSets && ex.sets.length < ex.targetSets && setIndex === ex.sets.length - 1) {
          setExercises((prev) =>
            prev.map((exercise) =>
              exercise.id === exerciseId
                ? { ...exercise, sets: [...exercise.sets, { weight: "", reps: "", done: false, notes: "" }] }
                : exercise
            )
          );
        }
      }
    }
  }

  function deleteSet(exerciseId: number, setIndex: number) {
    setExercises((prev) =>
      prev.map((exercise) => {
        if (exercise.id !== exerciseId) return exercise;
        const next = exercise.sets.filter((_, index) => index !== setIndex);
        return {
          ...exercise,
          sets:
            next.length === 0
              ? [{ weight: "", reps: "", done: false, notes: "" }]
              : next,
        };
      })
    );
  }

  function deleteExercise(exerciseId: number) {
    setExerciseMenuOpenId(null);
    setRestAdjustExerciseId((id) => (id === exerciseId ? null : id));
    setExercises((prev) => prev.filter((exercise) => exercise.id !== exerciseId));
  }

  return (
    <main className="min-h-screen bg-[#0a0a0b] text-white pb-32">
      {/* subtle depth on large screens */}
      

      <div className="relative max-w-[560px] mx-auto px-4 pt-4 sm:px-6 sm:pt-6">
        <header className="mb-5">
          <div className="flex items-center gap-3 mb-3">
            <Link
              href="/workout/start"
              className="shrink-0 flex touch-manipulation items-center justify-center h-10 w-10 rounded-xl border border-[#2a2a2e] bg-[#1d1d20] text-[#a3a3a8] hover:bg-[#1d1d20] hover:text-white transition active:opacity-90"
              aria-label="Back to workout start"
            >
              <svg className="h-5 w-5" fill="none" stroke="currentColor" viewBox="0 0 24 24" aria-hidden>
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" />
              </svg>
            </Link>
            <input
              type="text"
              placeholder={exercises.length === 0 ? "Optional workout name" : "Workout name"}
              aria-label="Workout name"
              value={workoutName}
              onChange={(e) => setWorkoutName(e.target.value)}
              className={`input-app flex-1 min-w-0 p-3 text-base truncate touch-manipulation border-[#2a2a2e] bg-[#1d1d20] shadow-sm shadow-black/20 placeholder:text-[#6f6f76] ${
                workoutName.trim() ? "font-medium text-[#f2f2f0]" : "font-normal text-[#a3a3a8]"
              }`}
            />
            {exercises.length > 0 ? (
              <div className="shrink-0 flex items-center gap-1.5 sm:gap-2">
                <button
                  type="button"
                  onClick={() => setShowDiscardConfirm(true)}
                  className="touch-manipulation px-2.5 py-2 sm:px-3 sm:py-2.5 rounded-xl text-xs font-medium text-[#6f6f76] border border-transparent hover:text-[#a3a3a8] hover:border-[#2a2a2e] hover:bg-[#1d1d20] active:opacity-80 transition"
                >
                  Discard
                </button>
                <button
                  type="button"
                  onClick={finishWorkout}
                  className="touch-manipulation px-4 py-2.5 sm:py-3 rounded-xl btn-primary text-sm font-semibold shadow-md shadow-black/25 active:scale-[0.98]"
                >
                  Finish
                </button>
              </div>
            ) : (
              <span className="shrink-0 w-[72px]" />
            )}
          </div>
          {showWorkoutStats && (
            <div className="flex flex-wrap items-center gap-2 text-sm text-[#a3a3a8]">
              <span className="tabular-nums px-2 py-1 rounded-full bg-[#1d1d20] border border-[#2a2a2e] shadow-sm shadow-black/20">
                {formatElapsed(elapsedSec)}
              </span>
              <span className="px-2 py-1 rounded-full bg-[#1d1d20] border border-[#2a2a2e] shadow-sm shadow-black/20">
                <span className="text-[#a3a3a8] mr-1">Exercises</span>
                <span className="tabular-nums text-white">{exercises.length}</span>
              </span>
              <span className="px-2 py-1 rounded-full bg-[#1d1d20] border border-[#2a2a2e] shadow-sm shadow-black/20">
                <span className="text-[#a3a3a8] mr-1">Sets</span>
                <span className="tabular-nums text-white">{totalSetsLogged}</span>
              </span>
            </div>
          )}
        </header>

        {exercises.length === 0 ? (
          <div className="min-h-[min(52vh,400px)] flex items-start justify-center px-1 pt-2 sm:pt-6 lg:pt-10">
            <div className="w-full max-w-lg rounded-3xl border border-[#2a2a2e] bg-[#141416] p-5 sm:p-7">
              <div className="mb-4">
                <p className="text-xl font-semibold tracking-tight text-white">Add your first exercise</p>
                <p className="text-sm text-app-secondary mt-1.5 leading-relaxed">
                  Your workout starts once you add the first movement.
                </p>
              </div>

              <div className="space-y-3">
                <ExercisePicker
                  value={exerciseName}
                  onValueChange={setExerciseName}
                  onSelect={(exercise) => addExercise(exercise)}
                  onRequestCreateExercise={openCreateExerciseFlow}
                  inputRef={addExerciseInputRef}
                  placeholder="Search or type a movement"
                  inputClassName="input-app w-full p-3 text-base shadow-sm shadow-black/10"
                  dropdownClassName="rounded-xl border border-[#2a2a2e] bg-[#141416] max-h-72 overflow-y-auto"
                  libraryRevision={userLibraryRevision}
                />
                {hydrated && recentExerciseHint.length > 0 && (
                  <p className="text-[11px] text-app-meta/90 leading-snug px-0.5">
                    Recent: {recentExerciseHint.join(", ")}
                  </p>
                )}
                <button
                  type="button"
                  onClick={() => addExercise()}
                  className="w-full py-3.5 rounded-2xl btn-primary text-base font-semibold"
                >
                  Add exercise
                </button>
                <p className="text-[11px] text-app-meta text-center">Tip: Enter selects a match or opens create when there’s no result.</p>
              </div>
            </div>
          </div>
        ) : reorderMode ? (
          <>
            <div className="mb-3 flex items-center justify-between gap-3 rounded-xl border border-[#2a2a2e] bg-[#141416] px-3 py-2">
              <p className="text-[12px] font-semibold text-[#f2f2f0]">
                Reorder exercises — drag to rearrange.
              </p>
              <button
                type="button"
                onClick={() => setReorderMode(false)}
                className="shrink-0 rounded-lg border border-[#a3a3a8] bg-[#2a2a2e] px-3 py-1.5 text-[12px] font-bold text-[#f2f2f0] hover:bg-[#2a2a2e] transition-colors"
              >
                Done
              </button>
            </div>
            <SortableList
              ids={exercises.map((e) => e.id)}
              onReorder={(nextIds) => reorderExercisesByIds(nextIds as number[])}
              className="space-y-2"
              renderItem={(id, handle) => {
                const exercise = exercises.find((e) => e.id === id);
                if (!exercise) return null;
                return (
                  <div className="flex items-center gap-3 rounded-xl border border-[#2a2a2e] bg-[#141416] px-3 py-3">
                    <DragHandle
                      attributes={handle.attributes}
                      listeners={handle.listeners}
                      isDragging={handle.isDragging}
                      ariaLabel={`Drag ${exercise.name} to reorder`}
                    />
                    <p className="flex-1 min-w-0 truncate text-[14px] font-semibold text-white">
                      {exercise.name}
                    </p>
                    <span className="shrink-0 text-[11px] text-app-meta tabular-nums">
                      {exercise.sets.length} set{exercise.sets.length === 1 ? "" : "s"}
                    </span>
                  </div>
                );
              }}
            />
          </>
        ) : (
          <>
            <section className="space-y-2 sm:space-y-2.5">
              {exercises.map((exercise) => {
                const lastP = lastPerformance[exercise.name];
                const lastStr = lastP
                  ? `Last: ${lastP.weight} ${unit} × ${lastP.reps}`
                  : "Last: —";
                const targetStr = nextTarget[exercise.name];
                const repTargets =
                  exercise.repMin != null && exercise.repMax != null && exercise.rir != null
                    ? targetLabel({ repMin: exercise.repMin, repMax: exercise.repMax, rir: exercise.rir })
                    : null;
                const contextLine = [repTargets, lastStr, targetStr].filter(Boolean).join(" · ");

                return (
                  <div
                    key={exercise.id}
                    className="rounded-xl border border-[#2a2a2e] bg-[#141416] px-3 py-2.5 sm:px-3.5 sm:py-3"
                  >
                    <div className="flex items-start gap-2 min-w-0">
                      <div className="min-w-0 flex-1">
                        <h3 className="text-[15px] font-semibold tracking-tight text-white truncate leading-snug">
                          {exercise.name}
                        </h3>
                        <p className="text-[11px] text-[#a3a3a8] mt-0.5 leading-snug line-clamp-2">
                          {contextLine}
                        </p>
                      </div>
                      <div className="relative shrink-0" data-exercise-menu-root>
                        <button
                          type="button"
                          onClick={() =>
                            setExerciseMenuOpenId((id) => (id === exercise.id ? null : exercise.id))
                          }
                          className="h-8 w-8 rounded-lg border border-[#2a2a2e] bg-[#1d1d20] text-[#a3a3a8] hover:text-white hover:bg-[#2a2a2e] transition flex items-center justify-center"
                          aria-label="Exercise options"
                          aria-expanded={exerciseMenuOpenId === exercise.id}
                        >
                          <svg className="h-4 w-4" fill="currentColor" viewBox="0 0 24 24" aria-hidden>
                            <path d="M12 8c1.1 0 2-.9 2-2s-.9-2-2-2-2 .9-2 2 .9 2 2 2zm0 2c-1.1 0-2 .9-2 2s.9 2 2 2 2-.9 2-2-.9-2-2-2zm0 6c-1.1 0-2 .9-2 2s.9 2 2 2 2-.9 2-2-.9-2-2-2z" />
                          </svg>
                        </button>
                        {exerciseMenuOpenId === exercise.id && (
                          <div
                            className="absolute right-0 top-full z-20 mt-1 min-w-[11rem] rounded-lg border border-[#2a2a2e] bg-[#1d1d20] py-0.5"
                            onClick={(e) => e.stopPropagation()}
                          >
                            <button
                              type="button"
                              className="w-full px-3 py-2 text-left text-[11px] text-[#f2f2f0] hover:bg-[#2a2a2e] transition"
                              onClick={() => {
                                setReplaceExerciseTargetId(exercise.id);
                                setReplaceExerciseInput("");
                                setExerciseMenuOpenId(null);
                              }}
                            >
                              Replace exercise
                            </button>
                            <button
                              type="button"
                              className="w-full px-3 py-2 text-left text-[11px] text-[#f2f2f0] hover:bg-[#2a2a2e] transition"
                              onClick={() => {
                                setReorderMode(true);
                                setExerciseMenuOpenId(null);
                              }}
                            >
                              Reorder exercises
                            </button>
                            <button
                              type="button"
                              className="w-full px-3 py-2 text-left text-[11px] text-[#f2f2f0] hover:bg-[#2a2a2e] transition"
                              onClick={() => {
                                setRestAdjustExerciseId(exercise.id);
                                setExerciseMenuOpenId(null);
                              }}
                            >
                              Adjust rest
                            </button>
                            <button
                              type="button"
                              className="w-full px-3 py-2 text-left text-[11px] text-[#f26d7d] hover:bg-transparent transition"
                              onClick={() => {
                                deleteExercise(exercise.id);
                              }}
                            >
                              Delete exercise
                            </button>
                          </div>
                        )}
                      </div>
                    </div>

                    <div className="mt-2 pt-2 border-t border-[#2a2a2e]">
                      {(() => {
                        const lastSets = getLastSetsForExercise({
                          exerciseId: exercise.exerciseId,
                          name: exercise.name,
                        });
                        const nextIdx = exercise.sets.findIndex((s) => !s?.done);
                        const effectiveNextIdx = nextIdx === -1 ? exercise.sets.length : nextIdx;
                        const logInputShell =
                          "relative min-w-0 h-9 rounded-xl bg-[#1d1d20] border border-[#2a2a2e] flex items-center transition-colors duration-150 focus-within:ring-2 focus-within:ring-[#2a2a2e] focus-within:border-[#a3a3a8] shadow-[inset_0_1px_0_0_rgba(255,255,255,0.04)]";
                        const rowIconBtn =
                          "min-h-[44px] min-w-[44px] sm:min-h-8 sm:min-w-8 shrink-0 rounded-lg border border-[#2a2a2e] bg-[#1d1d20] flex items-center justify-center touch-manipulation select-none transition active:scale-[0.96] active:opacity-90";
                        const logInputInner =
                          "min-w-0 flex-1 h-full bg-transparent border-0 rounded-xl px-2 text-xs tabular-nums text-[#f2f2f0] focus:outline-none focus:ring-0 disabled:opacity-55 disabled:cursor-not-allowed placeholder:text-[#6f6f76]";

                        return (
                          <div className="overflow-x-auto -mx-0.5 px-0.5">
                            <div className="min-w-[min(100%,20rem)]">
                            <div className="mb-1 grid grid-cols-[1.125rem_minmax(3.25rem,0.8fr)_minmax(4.25rem,1.3fr)_minmax(2.75rem,0.9fr)_2rem_2.75rem] gap-x-2 items-center px-0.5">
                              <span className="text-[9px] font-medium uppercase tracking-wide text-[#6f6f76] text-center">
                                #
                              </span>
                              <span className="text-[9px] font-medium uppercase tracking-wide text-[#6f6f76] pl-0.5">
                                Previous
                              </span>
                              <span className="text-[9px] font-medium uppercase tracking-wide text-[#6f6f76] pl-0.5">
                                Weight
                              </span>
                              <span className="text-[9px] font-medium uppercase tracking-wide text-[#6f6f76] pl-0.5">
                                Reps
                              </span>
                              <span className="text-[9px] font-medium uppercase tracking-wide text-[#6f6f76] text-center">
                                RIR
                              </span>
                              <span className="sr-only">Done</span>
                            </div>

                            <ul className="space-y-1 text-[#f2f2f0]">
                              {exercise.sets.map((set, index) => {
                                const lastSet = lastSets[index];
                                const prevWeightStr =
                                  lastSet &&
                                  lastSet.weight !== undefined &&
                                  String(lastSet.weight).trim() !== ""
                                    ? String(lastSet.weight).trim()
                                    : null;
                                const prevRepsStr =
                                  lastSet &&
                                  lastSet.reps !== undefined &&
                                  String(lastSet.reps).trim() !== ""
                                    ? String(lastSet.reps).trim()
                                    : null;
                                const noteKey = `${exercise.id}-${index}`;
                                const isNoteExpanded = expandedNoteKey === noteKey;
                                const isDone = Boolean(set.done);
                                const isNext = !isDone && index === effectiveNextIdx;
                                // Draft = user typed values but hasn't tapped the green check yet.
                                // P1.9: visually flag it so users know nothing is committed.
                                const hasUserTypedValues =
                                  (set.weight ?? "").trim() !== "" ||
                                  (set.reps ?? "").trim() !== "";
                                const isDraft = !isDone && hasUserTypedValues;
                                const note = (set.notes ?? "").trim();
                                const hasNote = note.length > 0;

                                return (
                                  <li key={`${exercise.id}-set-${index}`} className="rounded-lg">
                                    {(() => {
                                      const timer = restByExercise[exercise.id] ?? {
                                        timerRunning: false,
                                        restDurationSec: exercise.restSec ?? 90,
                                        remainingSec: 0,
                                      };
                                      const isActive = timer.timerRunning && timer.remainingSec > 0;
                                      return (
                                        <>
                                          {isNext && isActive && (
                                            <div className="mb-0.5 text-[10px] tabular-nums text-[#a3a3a8]">
                                              <span className="text-[#6f6f76]">Rest </span>
                                              <span className="text-[color:var(--color-accent)] font-semibold">
                                                {formatRest(timer.remainingSec)}
                                              </span>
                                            </div>
                                          )}
                                          <div
                                            className={`grid grid-cols-[1.125rem_minmax(3.25rem,0.8fr)_minmax(4.25rem,1.3fr)_minmax(2.75rem,0.9fr)_2rem_2.75rem] gap-x-2 items-center rounded-lg py-0.5 ${
                                              isNext
                                                ? "ring-1 ring-[color:var(--color-accent)]/55 bg-[#1d1d20] shadow-[inset_3px_0_0_0_rgba(45,212,191,0.55),inset_0_0_0_1px_rgba(45,212,191,0.14)]"
                                                : isDraft
                                                  ? "border border-dashed border-[#2a2a2e] bg-[#1d1d20]"
                                                  : ""
                                            } ${isDraft && !isDone ? "[&_input]:text-[#a3a3a8]" : ""} ${isDone ? "bg-[rgba(0,229,176,0.08)]" : ""}`}
                                            role="button"
                                            tabIndex={0}
                                            onClick={(e) => {
                                              if (longPressFiredRef.current) {
                                                longPressFiredRef.current = false;
                                                e.preventDefault();
                                                return;
                                              }
                                              if (
                                                e.target instanceof HTMLInputElement ||
                                                e.target instanceof HTMLButtonElement
                                              )
                                                return;
                                              setInputRefs.current[
                                                `${exercise.id}-${index}-weight`
                                              ]?.focus();
                                            }}
                                            onPointerDown={(e) => {
                                              if (
                                                e.target instanceof HTMLInputElement ||
                                                e.target instanceof HTMLButtonElement
                                              )
                                                return;
                                              longPressFiredRef.current = false;
                                              if (longPressTimerRef.current) {
                                                window.clearTimeout(longPressTimerRef.current);
                                              }
                                              longPressTimerRef.current = window.setTimeout(() => {
                                                longPressFiredRef.current = true;
                                                setSetActionMenuKey(noteKey);
                                                try {
                                                  navigator.vibrate?.(15);
                                                } catch {
                                                  /* ignore */
                                                }
                                              }, 500);
                                            }}
                                            onPointerUp={() => {
                                              if (longPressTimerRef.current) {
                                                window.clearTimeout(longPressTimerRef.current);
                                                longPressTimerRef.current = null;
                                              }
                                            }}
                                            onPointerLeave={() => {
                                              if (longPressTimerRef.current) {
                                                window.clearTimeout(longPressTimerRef.current);
                                                longPressTimerRef.current = null;
                                              }
                                            }}
                                            onPointerCancel={() => {
                                              if (longPressTimerRef.current) {
                                                window.clearTimeout(longPressTimerRef.current);
                                                longPressTimerRef.current = null;
                                              }
                                            }}
                                            onContextMenu={(e) => {
                                              // Mirror long-press for desktop right-click.
                                              e.preventDefault();
                                              setSetActionMenuKey(noteKey);
                                            }}
                                            onKeyDown={(e) => {
                                              if (e.target instanceof HTMLInputElement) return;
                                              if (e.key === "Enter" || e.key === " ") {
                                                e.preventDefault();
                                                setInputRefs.current[
                                                  `${exercise.id}-${index}-weight`
                                                ]?.focus();
                                              }
                                            }}
                                          >
                                            {(() => {
                                              const t = setTypeOf(set);
                                              const mark = SET_TYPE_MARK[t];
                                              return (
                                                <button
                                                  type="button"
                                                  onClick={(e) => {
                                                    e.stopPropagation();
                                                    cycleSetType(exercise.id, index);
                                                  }}
                                                  className="h-9 w-full rounded-md text-center text-[11px] tabular-nums font-semibold touch-manipulation"
                                                  style={{ color: t === "working" ? undefined : t === "warmup" ? "#6f6f76" : t === "drop" ? "#a3a3a8" : "#f2f2f0" }}
                                                  aria-label={`Set ${index + 1}, ${SET_TYPE_LABEL[t].toLowerCase()}. Change set type`}
                                                  title={SET_TYPE_LABEL[t]}
                                                >
                                                  <span className={t === "working" ? "text-[#a3a3a8]" : ""}>{mark || index + 1}</span>
                                                </button>
                                              );
                                            })()}
                                            {/* R5 (Hevy): last session's set; tapping it fills an empty row. */}
                                            <button
                                              type="button"
                                              disabled={!prevWeightStr && !prevRepsStr}
                                              onClick={(e) => {
                                                e.stopPropagation();
                                                if (prevWeightStr && (set.weight ?? "").trim() === "") updateSetValue(exercise.id, index, "weight", prevWeightStr);
                                                if (prevRepsStr && (set.reps ?? "").trim() === "") updateSetValue(exercise.id, index, "reps", prevRepsStr);
                                              }}
                                              className="h-9 min-w-0 truncate rounded-lg px-1 text-left text-[11px] tabular-nums text-[#6f6f76] disabled:cursor-default"
                                              aria-label={prevWeightStr || prevRepsStr ? `Previous set ${prevWeightStr ?? "—"} ${unit} × ${prevRepsStr ?? "—"}. Use it` : "No previous set"}
                                            >
                                              {prevWeightStr || prevRepsStr ? `${prevWeightStr ?? "—"} × ${prevRepsStr ?? "—"}` : "—"}
                                            </button>
                                            <div className={logInputShell}>
                                              <input
                                                ref={(el) => {
                                                  setInputRefs.current[`${exercise.id}-${index}-weight`] =
                                                    el;
                                                }}
                                                type="text"
                                                inputMode="decimal"
                                                enterKeyHint="next"
                                                autoComplete="off"
                                                autoCorrect="off"
                                                autoCapitalize="off"
                                                spellCheck={false}
                                                placeholder={prevWeightStr ?? "—"}
                                                value={set.weight ?? ""}
                                                onChange={(e) =>
                                                  updateSetValue(
                                                    exercise.id,
                                                    index,
                                                    "weight",
                                                    sanitizeWeightInput(e.target.value)
                                                  )
                                                }
                                                onKeyDown={(e) => {
                                                  if (e.key === "Enter") {
                                                    e.preventDefault();
                                                    const repsKey = `${exercise.id}-${index}-reps`;
                                                    const next = setInputRefs.current[repsKey];
                                                    next?.focus();
                                                    next?.select?.();
                                                  }
                                                }}
                                                aria-label={`Set ${index + 1} weight (${unit}), numbers and decimal only`}
                                                className={`${logInputInner} pl-2 pr-1`}
                                              />
                                              <span
                                                className="shrink-0 ml-1 pr-2 text-[9px] font-semibold uppercase tracking-wide text-[#6f6f76] tabular-nums select-none"
                                                aria-hidden
                                              >
                                                {unit}
                                              </span>
                                            </div>
                                            <div className={logInputShell}>
                                              <input
                                                ref={(el) => {
                                                  setInputRefs.current[`${exercise.id}-${index}-reps`] = el;
                                                }}
                                                type="text"
                                                inputMode="numeric"
                                                enterKeyHint="next"
                                                autoComplete="off"
                                                autoCorrect="off"
                                                autoCapitalize="off"
                                                spellCheck={false}
                                                pattern="[0-9]*"
                                                placeholder={prevRepsStr ?? "—"}
                                                value={set.reps ?? ""}
                                                onChange={(e) =>
                                                  updateSetValue(
                                                    exercise.id,
                                                    index,
                                                    "reps",
                                                    sanitizeRepsInput(e.target.value)
                                                  )
                                                }
                                                onKeyDown={(e) => {
                                                  if (e.key === "Enter") {
                                                    e.preventDefault();
                                                    const rirKey = `${exercise.id}-${index}-rir`;
                                                    const next = setInputRefs.current[rirKey];
                                                    next?.focus();
                                                    next?.select?.();
                                                  }
                                                }}
                                                aria-label={`Set ${index + 1} reps, whole numbers only`}
                                                className={`${logInputInner} [appearance:textfield] [&::-webkit-outer-spin-button]:appearance-none [&::-webkit-inner-spin-button]:appearance-none`}
                                              />
                                            </div>
                                            <input
                                              ref={(el) => {
                                                setInputRefs.current[`${exercise.id}-${index}-rir`] = el;
                                              }}
                                              type="text"
                                              inputMode="numeric"
                                              enterKeyHint={
                                                set.rir === undefined ? "done" : index === exercise.sets.length - 1 ? "done" : "next"
                                              }
                                              autoComplete="off"
                                              autoCorrect="off"
                                              autoCapitalize="off"
                                              spellCheck={false}
                                              pattern="[0-5]*"
                                              maxLength={1}
                                              placeholder="—"
                                              value={set.rir === undefined ? "" : String(set.rir)}
                                              onChange={(e) =>
                                                updateSetRir(
                                                  exercise.id,
                                                  index,
                                                  sanitizeRirInput(e.target.value)
                                                )
                                              }
                                              onKeyDown={(e) => {
                                                if (e.key === "Enter") {
                                                  e.preventDefault();
                                                  const rirUnset = set.rir === undefined;
                                                  if (rirUnset) {
                                                    const doneKey = `${exercise.id}-${index}`;
                                                    setDoneButtonRefs.current[doneKey]?.focus();
                                                    return;
                                                  }
                                                  if (index === exercise.sets.length - 1) {
                                                    addSetRow(exercise.id);
                                                    return;
                                                  }
                                                  const nextWeightKey = `${exercise.id}-${index + 1}-weight`;
                                                  const nw = setInputRefs.current[nextWeightKey];
                                                  nw?.focus();
                                                  nw?.select?.();
                                                }
                                              }}
                                              aria-label={`Set ${index + 1} RIR 0–5, optional`}
                                              className="h-8 sm:h-9 min-h-0 w-full rounded-lg border border-[#2a2a2e] bg-[#1d1d20] px-1 text-center text-[11px] tabular-nums text-[#f2f2f0] placeholder:text-[#6f6f76] shadow-[inset_0_1px_0_0_rgba(255,255,255,0.04)] focus:outline-none focus:ring-1 focus:ring-[#2a2a2e] focus:border-[#a3a3a8] disabled:opacity-55 disabled:cursor-not-allowed [appearance:textfield] [&::-webkit-outer-spin-button]:appearance-none [&::-webkit-inner-spin-button]:appearance-none"
                                            />
                                            <div className="flex justify-center">
                                              <button
                                                type="button"
                                                ref={(el) => {
                                                  setDoneButtonRefs.current[`${exercise.id}-${index}`] = el;
                                                }}
                                                onClick={(e) => {
                                                  e.stopPropagation();
                                                  toggleSetDone(exercise.id, index, prevWeightStr, prevRepsStr);
                                                }}
                                                className={`${rowIconBtn} rounded-full ${
                                                  isDone
                                                    ? "border border-[color:var(--color-accent)]/70 bg-[color:var(--color-accent)]/12 text-[color:var(--color-accent)] shadow-sm shadow-[color:var(--color-accent)]/10"
                                                    : "border-[#2a2a2e] text-[#a3a3a8] hover:bg-[#1d1d20] hover:border-[#2a2a2e] hover:text-[#f2f2f0]"
                                                }`}
                                                aria-label={`Mark set ${index + 1} complete`}
                                              >
                                                <span className="text-sm sm:text-xs font-semibold leading-none">
                                                  ✓
                                                </span>
                                              </button>
                                            </div>
                                          </div>

                                          {setActionMenuKey === noteKey && (
                                            <div
                                              className="mt-1 flex items-center gap-2 rounded-lg border border-[#2a2a2e] bg-[#141416] px-2 py-1.5 shadow-md shadow-black/30"
                                              onClick={(e) => e.stopPropagation()}
                                            >
                                              <button
                                                type="button"
                                                onClick={() => {
                                                  setSetActionMenuKey(null);
                                                  setExpandedNoteKey(noteKey);
                                                }}
                                                className="flex-1 rounded-md border border-[#2a2a2e] bg-[#1d1d20] px-2 py-2 text-[12px] font-semibold text-[#f2f2f0] transition hover:bg-[#1d1d20] active:scale-[0.98]"
                                              >
                                                {hasNote ? "Edit note" : "Add note"}
                                              </button>
                                              <button
                                                type="button"
                                                onClick={() => {
                                                  setSetActionMenuKey(null);
                                                  const w = parseFloat((set.weight ?? "").trim() || (prevWeightStr ?? ""));
                                                  setPlateCalcWeight(Number.isFinite(w) ? w : 0);
                                                }}
                                                className="flex-1 rounded-md border border-[#2a2a2e] bg-[#1d1d20] px-2 py-2 text-[12px] font-semibold text-[#f2f2f0] transition hover:bg-[#1d1d20] active:scale-[0.98]"
                                              >
                                                Plates
                                              </button>
                                              <button
                                                type="button"
                                                onClick={() => {
                                                  setSetActionMenuKey(null);
                                                  deleteSet(exercise.id, index);
                                                }}
                                                className="flex-1 rounded-md border border-[#2a2a2e] bg-transparent px-2 py-2 text-[12px] font-semibold text-[#f26d7d] transition hover:bg-transparent active:scale-[0.98]"
                                              >
                                                Delete set
                                              </button>
                                              <button
                                                type="button"
                                                onClick={() => setSetActionMenuKey(null)}
                                                className="rounded-md border border-[#2a2a2e] bg-[#141416] px-2 py-2 text-[12px] font-semibold text-[#a3a3a8] transition hover:bg-[#1d1d20]"
                                                aria-label="Close actions"
                                              >
                                                Close
                                              </button>
                                            </div>
                                          )}

                                          {isNoteExpanded &&
                                            (() => {
                                              const lastSetInner = lastSets[index];
                                              const lastNoteInner = (lastSetInner?.notes ?? "").trim();
                                              const notePlaceholderInner =
                                                !(set.notes ?? "").trim() && lastNoteInner
                                                  ? lastNoteInner.length > 96
                                                    ? `${lastNoteInner.slice(0, 96)}…`
                                                    : lastNoteInner
                                                  : "Note…";
                                              return (
                                                <div
                                                  className="mt-1 rounded-md border border-[#2a2a2e] bg-[#1d1d20] px-2 py-1.5 shadow-sm shadow-black/20"
                                                  onClick={(e) => e.stopPropagation()}
                                                >
                                                  <input
                                                    type="text"
                                                    placeholder={notePlaceholderInner}
                                                    value={set.notes ?? ""}
                                                    onChange={(e) =>
                                                      updateSetNotes(exercise.id, index, e.target.value)
                                                    }
                                                    className="input-app w-full h-8 min-h-0 px-2 py-1 text-xs"
                                                    autoFocus
                                                  />
                                                  <div className="mt-1 flex justify-end">
                                                    <button
                                                      type="button"
                                                      onClick={() => setExpandedNoteKey(null)}
                                                      className="text-[10px] px-2 py-1 rounded-md text-[#a3a3a8] hover:text-white hover:bg-[#2a2a2e] transition"
                                                    >
                                                      Done
                                                    </button>
                                                  </div>
                                                </div>
                                              );
                                            })()}
                                        </>
                                      );
                                    })()}
                                  </li>
                                );
                              })}
                            </ul>

                            </div>

                            {(() => {
                              const rest = exercise.restSec ?? 90;
                              const timer = restByExercise[exercise.id] ?? {
                                timerRunning: false,
                                restDurationSec: rest,
                                remainingSec: 0,
                              };
                              const isActive = timer.timerRunning && timer.remainingSec > 0;

                              return (
                                <div className="mt-2 flex flex-wrap items-center gap-x-2 gap-y-1.5">
                                  <div
                                    className={`inline-flex items-center gap-2 rounded-lg border px-2.5 py-1.5 text-xs shadow-sm shadow-black/15 ${
                                      isActive
                                        ? "border-[color:var(--color-accent)]/30 bg-[color:var(--color-accent)]/8 text-[#f2f2f0]"
                                        : "border-[#2a2a2e] bg-[#1d1d20] text-[#f2f2f0]"
                                    }`}
                                  >
                                    {isActive ? (
                                      <span className="tabular-nums font-semibold text-[color:var(--color-accent)]">
                                        {formatRest(timer.remainingSec)}
                                      </span>
                                    ) : (
                                      <>
                                        <span className="text-[#6f6f76]">Rest</span>
                                        <span className="tabular-nums font-medium text-[#f2f2f0]">
                                          {formatRest(rest)}
                                        </span>
                                      </>
                                    )}
                                    <button
                                      type="button"
                                      onClick={() =>
                                        isActive
                                          ? resetExerciseRest(exercise.id)
                                          : startExerciseRest(exercise.id, rest)
                                      }
                                      className="rounded-md border border-[#2a2a2e] bg-[#1d1d20] px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-[#f2f2f0] hover:bg-[#2a2a2e] hover:border-[#a3a3a8] transition touch-manipulation"
                                    >
                                      {isActive ? "Stop" : "Start"}
                                    </button>
                                  </div>

                                  <button
                                    type="button"
                                    onClick={() => addSetRow(exercise.id)}
                                    className="text-[10px] px-2.5 py-1.5 rounded-lg btn-primary font-semibold ml-auto sm:ml-0 touch-manipulation"
                                  >
                                    + Set
                                  </button>
                                </div>
                              );
                            })()}
                          </div>
                        );
                      })()}
                    </div>
                  </div>
                );
              })}
            </section>

            <section className="mt-5 mb-3 rounded-xl border border-[#2a2a2e] bg-[#1d1d20] p-3 shadow-md shadow-black/25">
              <div className="flex gap-2 items-stretch">
                <div className="flex-1 min-w-0">
                  <ExercisePicker
                    value={exerciseName}
                    onValueChange={setExerciseName}
                    onSelect={(exercise) => addExercise(exercise)}
                    onRequestCreateExercise={openCreateExerciseFlow}
                    inputRef={addExerciseInputRef}
                    placeholder="Next exercise…"
                    inputClassName="input-app flex-1 min-w-0 py-2.5 px-3 text-sm sm:text-base"
                    dropdownClassName="mt-2 rounded-xl border border-[#2a2a2e] bg-[#141416] max-h-72 overflow-y-auto"
                    libraryRevision={userLibraryRevision}
                  />
                </div>
                <button
                  type="button"
                  onClick={() => addExercise()}
                  className="shrink-0 self-center min-h-[44px] px-4 rounded-xl btn-primary text-sm font-semibold sm:min-h-0 sm:py-3"
                >
                  Add
                </button>
              </div>
            </section>
          </>
        )}

        <CreateExerciseModal
          open={createExerciseOpen}
          initialName={createExerciseSeedName}
          onClose={() => setCreateExerciseOpen(false)}
          onCreated={handleUserExerciseCreated}
        />

        {replaceExerciseTargetId !== null && (
          <div
            className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/70"
            role="dialog"
            aria-modal="true"
            aria-labelledby="replace-exercise-title"
            onClick={() => {
              setReplaceExerciseTargetId(null);
              setReplaceExerciseInput("");
            }}
          >
            <div
              className="w-full max-w-md rounded-2xl border border-[#2a2a2e] bg-[#141416] shadow-xl p-5"
              onClick={(e) => e.stopPropagation()}
            >
              <h2 id="replace-exercise-title" className="text-base font-semibold text-white mb-1">
                Replace exercise
              </h2>
              <p className="text-xs text-app-secondary mb-3">
                Pick a replacement for this slot. Position in the workout stays the same.
              </p>
              <ExercisePicker
                value={replaceExerciseInput}
                onValueChange={setReplaceExerciseInput}
                onSelect={(exercise) => requestReplaceExercise(exercise)}
                onRequestCreateExercise={openCreateExerciseFlow}
                placeholder="Search or type a movement"
                inputClassName="input-app w-full p-3 text-sm"
                dropdownClassName="mt-2 rounded-xl border border-[#2a2a2e] bg-[#141416] max-h-72 overflow-y-auto"
                libraryRevision={userLibraryRevision}
              />
              <div className="mt-3 flex gap-2 justify-end">
                <button
                  type="button"
                  className="btn-secondary"
                  onClick={() => {
                    setReplaceExerciseTargetId(null);
                    setReplaceExerciseInput("");
                  }}
                >
                  Cancel
                </button>
                <button
                  type="button"
                  className="btn-primary"
                  onClick={() => requestReplaceExercise()}
                >
                  Replace
                </button>
              </div>
            </div>
          </div>
        )}

        <div className="mt-4">
          {showDiscardConfirm && (
            <div
              className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/70"
              role="dialog"
              aria-modal="true"
              aria-labelledby="discard-title"
              onClick={() => setShowDiscardConfirm(false)}
            >
              <div
                className="w-full max-w-sm p-6 rounded-2xl border border-[#2a2a2e] bg-[#141416] shadow-xl"
                onClick={(e) => e.stopPropagation()}
              >
                <h2 id="discard-title" className="text-lg font-bold text-white mb-2">
                  Discard workout?
                </h2>
                <p className="text-sm text-app-secondary mb-6">
                  Progress will be lost. This cannot be undone.
                </p>
                <div className="flex gap-2 justify-end">
                  <button
                    type="button"
                    onClick={() => setShowDiscardConfirm(false)}
                    className="btn-secondary"
                  >
                    Cancel
                  </button>
                  <button
                    type="button"
                    onClick={discardWorkout}
                    className="px-4 py-2.5 rounded-xl text-sm font-medium bg-transparent border border-[#2a2a2e] text-[#f26d7d] hover:bg-transparent transition"
                  >
                    Discard
                  </button>
                </div>
              </div>
            </div>
          )}

          {showSummary && (
            <div
              className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/70"
              onClick={(e) => e.target === e.currentTarget && router.push("/")}
            >
              <div
                className="w-full max-w-md p-6 rounded-2xl border border-[#2a2a2e] bg-[#141416] shadow-xl"
                onClick={(e) => e.stopPropagation()}
              >
                <h2 className="text-xl font-semibold mb-4">Workout Summary</h2>
                <p className="text-white font-bold mb-2">{getWorkoutDisplayName()}</p>
                <p className="text-app-secondary mb-4">
                  {exercises.length} exercise{exercises.length !== 1 ? "s" : ""} ·{" "}
                  {exercises.reduce((total, ex) => total + ex.sets.length, 0)} total sets
                </p>
                <ul className="space-y-2 text-sm text-app-secondary mb-6">
                  {exercises.map((exercise) => (
                    <li key={exercise.id}>
                      {exercise.name} — {exercise.sets.length} set
                      {exercise.sets.length !== 1 ? "s" : ""}
                    </li>
                  ))}
                </ul>
                {templateId && routineChanges && routineChanges.length > 0 && (
                  <div className="mb-4 rounded-xl border border-[#2a2a2e] bg-[#141416] p-4">
                    <p className="text-sm font-semibold text-[#00e5b0] mb-1">
                      This workout differs from &ldquo;{templateName}&rdquo;
                    </p>
                    <ul className="text-xs text-[#a3a3a8] space-y-0.5 mb-3">
                      {routineChanges.map((change, i) => (
                        <li key={i}>· {change}</li>
                      ))}
                    </ul>
                    <p className="text-xs text-app-secondary mb-3">
                      Want to update the routine to reflect today&apos;s session?
                    </p>
                    <div className="flex gap-2">
                      <button
                        onClick={() => {
                          overwriteTemplateFromSession();
                          setRoutineChanges(null);
                        }}
                        className="flex-1 py-2 rounded-lg text-sm font-semibold bg-[#2a2a2e] text-[#6f6f76] hover:bg-[#2a2a2e] transition"
                      >
                        Update routine
                      </button>
                      <button
                        onClick={() => setRoutineChanges(null)}
                        className="flex-1 py-2 rounded-lg text-sm font-semibold border border-[#2a2a2e] text-app-secondary hover:bg-[#1d1d20] transition"
                      >
                        Keep original
                      </button>
                    </div>
                  </div>
                )}
                <div className="space-y-2">
                  <button
                    onClick={saveAsRoutineFromSession}
                    disabled={routineSaved || exercises.length === 0}
                    className="w-full py-3 rounded-xl font-semibold border border-[#a3a3a8] text-[#00e5b0] hover:bg-[#141416] transition disabled:opacity-40 disabled:cursor-not-allowed"
                  >
                    {routineSaved ? "Routine Saved" : "Save as Routine"}
                  </button>
                  <button
                    onClick={() => router.push("/")}
                    className="w-full py-3 rounded-xl btn-primary"
                  >
                    Back to Home
                  </button>
                </div>
              </div>
            </div>
          )}
        </div>
      </div>

      {restAdjustExerciseId !== null &&
        (() => {
          const exAdj = exercises.find((e) => e.id === restAdjustExerciseId);
          if (!exAdj) return null;
          const rAdj = exAdj.restSec ?? 90;
          return (
            <div
              className="fixed inset-0 z-[55] flex items-end justify-center bg-black/60 p-3 pb-[calc(5rem+env(safe-area-inset-bottom,0px))] sm:items-center sm:pb-3"
              onClick={() => setRestAdjustExerciseId(null)}
            >
              <div
                role="dialog"
                aria-labelledby="rest-adjust-title"
                aria-modal="true"
                className="w-full max-w-md rounded-2xl border border-[#2a2a2e] bg-[#141416] p-4 shadow-2xl shadow-black/55 ring-1 ring-[#2a2a2e]"
                onClick={(e) => e.stopPropagation()}
              >
                <h2 id="rest-adjust-title" className="text-sm font-semibold text-white">
                  Adjust rest · {exAdj.name}
                </h2>
                <p className="mt-1 text-[11px] leading-snug text-[#6f6f76]">
                  Default duration for this exercise when the timer runs after a set.
                </p>
                <div className="mt-3 flex items-center justify-between text-[10px] text-[#a3a3a8]">
                  <span>Duration</span>
                  <span className="tabular-nums text-[#f2f2f0]">{formatRest(rAdj)}</span>
                </div>
                <input
                  type="range"
                  min={0}
                  max={300}
                  step={15}
                  value={rAdj}
                  onChange={(e) =>
                    setExerciseRest(
                      exAdj.id,
                      Math.max(0, Math.min(300, Number(e.target.value) || 0))
                    )
                  }
                  className="mt-1.5 w-full accent-[#00e5b0] h-2"
                  aria-label={`Rest duration for ${exAdj.name}`}
                />
                <div className="mt-2 flex flex-wrap gap-1.5">
                  {[60, 90, 120, 180].map((sec) => (
                    <button
                      key={sec}
                      type="button"
                      onClick={() => setExerciseRest(exAdj.id, sec)}
                      className="text-[10px] px-2 py-1 rounded-md border border-[#2a2a2e] bg-[#1d1d20] text-[#a3a3a8] hover:text-white hover:bg-[#2a2a2e]"
                    >
                      {sec}s
                    </button>
                  ))}
                </div>
                <button
                  type="button"
                  className="mt-4 w-full rounded-xl border border-[#2a2a2e] bg-[#1d1d20] py-2.5 text-sm font-semibold text-[#f2f2f0] hover:bg-[#2a2a2e] transition"
                  onClick={() => setRestAdjustExerciseId(null)}
                >
                  Done
                </button>
              </div>
            </div>
          );
        })()}

      {/* R5 (Hevy): the running rest as a bottom bar with −15 / +15 / Skip. */}
      {(() => {
        let active: { id: number; t: RestTimerState } | null = null;
        for (const [k, t] of Object.entries(restByExercise)) {
          if (!t.timerRunning || t.remainingSec <= 0) continue;
          if (!active || (t.timerStartedAt ?? 0) > (active.t.timerStartedAt ?? 0)) active = { id: Number(k), t };
        }
        const found = active;
        if (!found) return null;
        const name = exercises.find((e) => e.id === found.id)?.name?.trim() || "Rest";
        return (
          <RestBar
            exerciseName={name}
            remainingSec={found.t.remainingSec}
            totalSec={found.t.restDurationSec}
            onAdjust={(d) => nudgeRunningRest(found.id, d)}
            onSkip={() => resetExerciseRest(found.id)}
          />
        );
      })()}
      <PlateCalculator weight={plateCalcWeight} unit={unit === "lb" ? "lb" : "kg"} onClose={() => setPlateCalcWeight(null)} />
    </main>
  );
}