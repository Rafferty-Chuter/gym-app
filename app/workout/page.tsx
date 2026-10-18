"use client";
import { targetLabel, targetsForExercise } from "@/lib/training/targets";
import { equipmentFor, suggestNext, suggestionLabel, type ExerciseSession, type Phase } from "@/lib/training/progression";
import { DELOAD_DAYS, deloadSets, deloadSuggestion, type DeloadRecord } from "@/lib/training/deload";
import { deloadStore } from "@/lib/physique/io/deload";
import { addDays, localDateKey, type LocalDate } from "@/lib/dates";
import { goalStore } from "@/lib/physique/io/repos";
import { useSingleton } from "@/lib/storage/useStored";
import {
  useState,
  useEffect,
  useLayoutEffect,
  useRef,
} from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useWorkoutStore } from "@/lib/workout-store";
import {
  getActiveWorkout,
  saveActiveWorkout,
  clearActiveWorkout,
  draftHasMeaningfulContent,
  type DraftWorkout,
} from "@/lib/activeWorkout";
import { useUnit } from "@/lib/unit-preference";
import { kgToDisplay } from "@/lib/units";
import {
  getExerciseByName,
  normalizeExerciseName,
} from "@/lib/exerciseLibrary";
import ExercisePickerSheet, { type PickedExercise } from "@/components/training/ExercisePickerSheet";
import { sameExercise } from "@/lib/exerciseLibrary";
import { SortableList, DragHandle } from "@/components/SortableList";
import { getCompletedLoggedSets, nextSetType, SET_TYPE_LABEL, SET_TYPE_MARK, setTypeOf, type SetType } from "@/lib/completedSets";
import { getTemplateById } from "@/lib/templateStorage";
import RestBar from "@/components/workout/RestBar";
import PlateCalculator from "@/components/workout/PlateCalculator";
import WorkoutComplete from "@/components/training/WorkoutComplete";
import { exerciseHref } from "@/components/training/WorkoutViews";
import { getWorkoutHistory, type StoredWorkout as HistoryWorkout } from "@/lib/trainingAnalysis";
import { workoutRecords, type WorkoutRecord } from "@/lib/training/workoutSummary";
import { uniqueRoutineName } from "@/lib/training/routine";

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
    const sorted = [...workouts].sort(
      (a, b) => new Date(b.completedAt).getTime() - new Date(a.completedAt).getTime()
    );
    for (const workout of sorted) {
      const match = workout.exercises?.find(
        (ex) =>
          sameExercise(ex, exercise)
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
  type?: SetType;
}[] {
  if (typeof window === "undefined") return [];
  try {
    const raw = localStorage.getItem(WORKOUT_HISTORY_KEY);
    if (!raw) return [];
    const workouts: StoredWorkout[] = JSON.parse(raw);
    if (!Array.isArray(workouts)) return [];
    const sorted = [...workouts].sort(
      (a, b) => new Date(b.completedAt).getTime() - new Date(a.completedAt).getTime()
    );
    for (const workout of sorted) {
      const match = workout.exercises?.find(
        (ex) =>
          sameExercise(ex, exercise)
      );
      if (match?.sets?.length) {
        return match.sets.map((s) => ({
          weight: String(s?.weight ?? ""),
          reps: String(s?.reps ?? ""),
          notes: typeof s?.notes === "string" ? s.notes : undefined,
          ...(s?.type ? { type: s.type } : {}),
        }));
      }
    }
    return [];
  } catch {
    return [];
  }
}

/**
 * TR3: each row's last-session set, warm-ups against warm-ups and the rest
 * against the rest in order (Hevy's alignment), so a routine's warm-up row
 * never shows last time's top set.
 */
function previousByKind<T extends { type?: SetType }>(rows: ReadonlyArray<{ type?: SetType }>, last: readonly T[]): Array<T | undefined> {
  const lastWarm = last.filter((s) => setTypeOf(s) === "warmup");
  const lastWork = last.filter((s) => setTypeOf(s) !== "warmup");
  let w = 0;
  let k = 0;
  return rows.map((r) => (setTypeOf(r) === "warmup" ? lastWarm[w++] : lastWork[k++]));
}

/** TR3: the number each row shows: warm-ups carry "W", the rest count 1, 2, 3 among themselves. */
function rowNumbers(rows: ReadonlyArray<{ type?: SetType }>): number[] {
  let n = 0;
  return rows.map((r) => (setTypeOf(r) === "warmup" ? 0 : (n += 1)));
}

/** Every logged session of an exercise, by id or name, as the progression rule reads it. */
function getSessionsForExercise(exercise: ExerciseRef): ExerciseSession[] {
  if (typeof window === "undefined") return [];
  try {
    const raw = localStorage.getItem(WORKOUT_HISTORY_KEY);
    if (!raw) return [];
    const workouts: StoredWorkout[] = JSON.parse(raw);
    if (!Array.isArray(workouts)) return [];
    const out: ExerciseSession[] = [];
    for (const workout of workouts) {
      const match = workout.exercises?.find(
        (ex) =>
          sameExercise(ex, exercise)
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
  const [exercises, setExercises] = useState<
    {
      id: number;
      exerciseId?: string;
      name: string;
      sets: { weight: string; reps: string; done?: boolean; notes?: string; rir?: number; type?: SetType }[];
      targetSets?: number;
      restSec: number;
      /** The routine's note for this exercise (TR2), shown under the name. */
      notes?: string;
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
  // TR4: the saved session and its records, for the "Workout complete" screen.
  const [finished, setFinished] = useState<{ workout: HistoryWorkout; records: WorkoutRecord[] } | null>(null);
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
  const setInputRefs = useRef<Record<string, HTMLInputElement | null>>({});
  const setDoneButtonRefs = useRef<Record<string, HTMLButtonElement | null>>({});
  const [pendingFocus, setPendingFocus] = useState<{ exerciseId: number; setIndex: number } | null>(null);
  const [elapsedSec, setElapsedSec] = useState(0);
  const [restByExercise, setRestByExercise] = useState<Record<number, RestTimerState>>({});
  const [startTime, setStartTime] = useState<number | null>(null);
  const [replaceExerciseTargetId, setReplaceExerciseTargetId] = useState<number | null>(null);
  /** TR3: the full-screen picker for adding exercises mid-session. */
  const [addPickerOpen, setAddPickerOpen] = useState(false);
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

  /** TR2: today's rows as the routine's plan: warm-ups kept, weights in kg, reps as logged. */
  function routineExerciseFromSession(ex: (typeof exercises)[number]) {
    const displayUnit = unit === "lb" ? "lb" : "kg";
    const rows = ex.sets.map((st) => {
      const w = Number(String(st.weight ?? "").replace(",", "."));
      const r = Number(st.reps);
      return {
        ...(st.type === "warmup" ? { type: "warmup" as const } : {}),
        ...(Number.isFinite(w) && w > 0 ? { kg: Math.round((displayUnit === "lb" ? w * 0.45359237 : w) * 100) / 100 } : {}),
        ...(Number.isFinite(r) && r > 0 ? { reps: Math.round(r) } : {}),
      };
    });
    const working = rows.filter((r) => r.type !== "warmup").length;
    return {
      ...(ex.exerciseId ? { exerciseId: ex.exerciseId } : {}),
      name: ex.name,
      targetSets: Math.max(1, Math.min(20, working || ex.targetSets || 3)),
      restSec: ex.restSec ?? 90,
      ...(rows.length > 0 && working > 0 ? { sets: rows.slice(0, 20) } : {}),
      ...(ex.notes ? { notes: ex.notes } : {}),
      ...(ex.repMin != null && ex.repMax != null && ex.rir != null ? { repMin: ex.repMin, repMax: ex.repMax, rir: ex.rir } : {}),
    };
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
        name: uniqueRoutineName(name, templates.map((t: { name?: unknown }) => (typeof t?.name === "string" ? t.name : ""))),
        exercises: exercises.map(routineExerciseFromSession),
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
              exercises: exercises.map(routineExerciseFromSession),
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
            // TR2: a routine with planned rows starts with them, warm-ups typed, planned weight and reps filled in.
            const tplRows = typeof ex === "object" && ex !== null && Array.isArray((ex as { sets?: unknown }).sets)
              ? ((ex as { sets: unknown[] }).sets as Array<{ type?: string; kg?: number; reps?: number } | null>)
              : null;
            const tplNotes = typeof ex === "object" && ex !== null && typeof (ex as { notes?: unknown }).notes === "string" ? ((ex as { notes: string }).notes.trim() || undefined) : undefined;
            const displayUnit = unit === "lb" ? "lb" : "kg";
            const plannedRow = (r: { type?: string; kg?: number; reps?: number } | null, type?: SetType) => ({
              weight: r && typeof r.kg === "number" && r.kg > 0 ? String(Math.round(kgToDisplay(r.kg, displayUnit) * 10) / 10) : "",
              reps: r && typeof r.reps === "number" && r.reps > 0 ? String(Math.round(r.reps)) : "",
              done: false,
              notes: "",
              ...(type ? { type } : {}),
            });
            const rowSets = tplRows && tplRows.length > 0
              ? (() => {
                  const warm = tplRows.filter((r) => r?.type === "warmup");
                  const work = tplRows.filter((r) => r?.type !== "warmup");
                  const kept = deloadActiveNow() ? work.slice(0, deloadSets(work.length)) : work;
                  return [...warm.map((r) => plannedRow(r, "warmup")), ...kept.map((r) => plannedRow(r))];
                })()
              : null;
            const plannedSets = targetSets != null && deloadActiveNow() ? deloadSets(targetSets) : (targetSets ?? 0);
            const sets = rowSets ?? Array.from(
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
              // With planned rows, the row count (warm-ups included) is what "last planned set" means.
              targetSets: rowSets ? rowSets.length : targetSets,
              restSec,
              ...(tplNotes ? { notes: tplNotes } : {}),
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
    // Runs once on mount: a started routine's planned weights convert with the unit in effect then.
    // eslint-disable-next-line react-hooks/exhaustive-deps
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
        ...(ex.notes ? { notes: ex.notes } : {}),
        ...(ex.repMin != null ? { repMin: ex.repMin } : {}),
        ...(ex.repMax != null ? { repMax: ex.repMax } : {}),
        ...(ex.rir != null ? { rir: ex.rir } : {}),
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
    templateExercises: { name: string; exerciseId?: string; targetSets: number; sets?: unknown[] }[],
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
        changes.push(`Removed ${tex.name}`);
      } else if ((cex.sets as unknown[]).length !== (tex.sets?.length || tex.targetSets)) {
        const planned = tex.sets?.length || tex.targetSets;
        changes.push(`${tex.name}: ${(cex.sets as unknown[]).length} set${(cex.sets as unknown[]).length !== 1 ? "s" : ""}, planned ${planned}`);
      }
    }
    for (const [key, cex] of completedMap) {
      if (!templateMap.has(key)) {
        changes.push(`Added ${cex.name}`);
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
    // Records are judged against the history before this session is added.
    const records = workoutRecords(completed, getWorkoutHistory());
    // A session with nothing ticked is not history; the summary says so (A1).
    if (totalSets > 0) addWorkout(completed);
    setFinished({ workout: completed, records });
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
    // Back to Train, where Done also lands (A1).
    router.push("/train");
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
              exerciseId: nextExercise.id || undefined,
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

  /** TR3: the picker's choice replaces the exercise in this slot; logged sets in the slot need a confirm. */
  function pickReplacement(p: PickedExercise) {
    if (replaceExerciseTargetId === null) return;
    const matched = p.exerciseId ? { id: p.exerciseId, name: p.name } : getExerciseByName(p.name);
    const hasData = exerciseHasMeaningfulLoggedData(replaceExerciseTargetId);
    if (hasData && !window.confirm("This exercise has logged sets. Replacing it clears them. Continue?")) return;
    replaceExerciseAtSlot(replaceExerciseTargetId, { id: matched?.id ?? "", name: matched?.name ?? p.name });
    setReplaceExerciseTargetId(null);
    setExerciseMenuOpenId(null);
  }

  /** TR3: add everything picked, each with as many rows as last time (at least one) and its rep target. */
  function appendPicked(list: PickedExercise[]) {
    const base = Date.now();
    const added = list.map((p, i) => {
      const matched = p.exerciseId ? { id: p.exerciseId, name: p.name } : getExerciseByName(p.name);
      const name = matched?.name ?? p.name;
      const last = getLastSetsForExercise({ exerciseId: matched?.id, name });
      const rows = Math.max(1, Math.min(10, last.length));
      return {
        id: base + i,
        ...(matched?.id ? { exerciseId: matched.id } : {}),
        name,
        sets: Array.from({ length: rows }, () => ({ weight: "", reps: "", done: false, notes: "" })),
        restSec: 90,
        ...targetsForExercise(name),
      };
    });
    if (added.length) setExercises((prev) => [...prev, ...added]);
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
    // Same guard as Replace: logged sets need a confirm before they go (A1).
    if (exerciseHasMeaningfulLoggedData(exerciseId) && !window.confirm("This exercise has logged sets. Deleting it removes them. Continue?")) return;
    setExerciseMenuOpenId(null);
    setRestAdjustExerciseId((id) => (id === exerciseId ? null : id));
    setExercises((prev) => prev.filter((exercise) => exercise.id !== exerciseId));
  }

  return (
    <main className="min-h-screen bg-[var(--background)] text-[var(--text)] pb-32">
      {/* subtle depth on large screens */}
      

      <div className="relative max-w-[560px] mx-auto px-4 pt-4 sm:px-6 sm:pt-6">
        <header className="mb-5">
          <div className="flex items-center gap-3 mb-3">
            <Link
              href="/train"
              className="shrink-0 flex touch-manipulation items-center justify-center h-10 w-10 rounded-xl border border-[var(--border)] bg-[var(--surface-raised)] text-[var(--text-secondary)] hover:bg-[var(--surface-raised)] hover:text-[var(--text)] transition active:opacity-90"
              aria-label="Back to Train"
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
              className={`input-app flex-1 min-w-0 p-3 text-base truncate touch-manipulation border-[var(--border)] bg-[var(--surface-raised)] shadow-sm shadow-black/20 placeholder:text-[var(--text-tertiary)] ${
                workoutName.trim() ? "font-medium text-[var(--text)]" : "font-normal text-[var(--text-secondary)]"
              }`}
            />
            {exercises.length > 0 ? (
              <div className="shrink-0 flex items-center gap-1.5 sm:gap-2">
                <button
                  type="button"
                  onClick={() => setShowDiscardConfirm(true)}
                  className="touch-manipulation px-2.5 py-2 sm:px-3 sm:py-2.5 rounded-xl text-xs font-medium text-[var(--text-tertiary)] border border-transparent hover:text-[var(--text-secondary)] hover:border-[var(--border)] hover:bg-[var(--surface-raised)] active:opacity-80 transition"
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
            <div className="flex flex-wrap items-center gap-2 text-sm text-[var(--text-secondary)]">
              <span className="tabular-nums px-2 py-1 rounded-full bg-[var(--surface-raised)] border border-[var(--border)] shadow-sm shadow-black/20">
                {formatElapsed(elapsedSec)}
              </span>
              <span className="px-2 py-1 rounded-full bg-[var(--surface-raised)] border border-[var(--border)] shadow-sm shadow-black/20">
                <span className="text-[var(--text-secondary)] mr-1">Exercises</span>
                <span className="tabular-nums text-[var(--text)]">{exercises.length}</span>
              </span>
              <span className="px-2 py-1 rounded-full bg-[var(--surface-raised)] border border-[var(--border)] shadow-sm shadow-black/20">
                <span className="text-[var(--text-secondary)] mr-1">Sets</span>
                <span className="tabular-nums text-[var(--text)]">{totalSetsLogged}</span>
              </span>
            </div>
          )}
        </header>

        {exercises.length === 0 ? (
          <div className="flex min-h-[min(52vh,400px)] items-start justify-center px-1 pt-2 sm:pt-6">
            <div className="flex w-full max-w-lg flex-col items-center gap-3 rounded-[12px] px-5 py-8 text-center" style={{ background: "var(--surface)" }}>
              <p className="text-[17px] font-semibold" style={{ color: "var(--text)" }}>Add your first exercise</p>
              <p className="text-[13px] leading-snug" style={{ color: "var(--text-secondary)" }}>
                Search, filter by muscle or equipment, and pick as many as you like. The clock starts with the first one.
              </p>
              <button type="button" onClick={() => setAddPickerOpen(true)} className="mt-1 h-[48px] w-full rounded-[12px] text-[17px] font-semibold" style={{ background: "var(--primary)", color: "var(--text-on-primary)" }}>
                Add exercises
              </button>
            </div>
          </div>
        ) : reorderMode ? (
          <>
            <div className="mb-3 flex items-center justify-between gap-3 rounded-xl border border-[var(--border)] bg-[var(--surface)] px-3 py-2">
              <p className="text-[12px] font-semibold text-[var(--text)]">
                Reorder exercises — drag to rearrange.
              </p>
              <button
                type="button"
                onClick={() => setReorderMode(false)}
                className="shrink-0 rounded-lg border border-[var(--text-secondary)] bg-[var(--border)] px-3 py-1.5 text-[12px] font-bold text-[var(--text)] hover:bg-[var(--border)] transition-colors"
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
                  <div className="flex items-center gap-3 rounded-xl border border-[var(--border)] bg-[var(--surface)] px-3 py-3">
                    <DragHandle
                      attributes={handle.attributes}
                      listeners={handle.listeners}
                      isDragging={handle.isDragging}
                      ariaLabel={`Drag ${exercise.name} to reorder`}
                    />
                    <p className="flex-1 min-w-0 truncate text-[14px] font-semibold text-[var(--text)]">
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
                    className="rounded-xl border border-[var(--border)] bg-[var(--surface)] px-3 py-2.5 sm:px-3.5 sm:py-3"
                  >
                    <div className="flex items-start gap-2 min-w-0">
                      <div className="min-w-0 flex-1">
                        <h3 className="text-[15px] font-semibold tracking-tight text-[var(--text)] truncate leading-snug">
                          {exercise.name}
                        </h3>
                        <p className="text-[11px] text-[var(--text-secondary)] mt-0.5 leading-snug line-clamp-2">
                          {contextLine}
                        </p>
                        {exercise.notes && (
                          <p className="text-[11px] mt-0.5 leading-snug line-clamp-2" style={{ color: "var(--text-tertiary)" }}>
                            {exercise.notes}
                          </p>
                        )}
                      </div>
                      <div className="relative shrink-0" data-exercise-menu-root>
                        <button
                          type="button"
                          onClick={() =>
                            setExerciseMenuOpenId((id) => (id === exercise.id ? null : exercise.id))
                          }
                          className="h-8 w-8 rounded-lg border border-[var(--border)] bg-[var(--surface-raised)] text-[var(--text-secondary)] hover:text-[var(--text)] hover:bg-[var(--border)] transition flex items-center justify-center"
                          aria-label="Exercise options"
                          aria-expanded={exerciseMenuOpenId === exercise.id}
                        >
                          <svg className="h-4 w-4" fill="currentColor" viewBox="0 0 24 24" aria-hidden>
                            <path d="M12 8c1.1 0 2-.9 2-2s-.9-2-2-2-2 .9-2 2 .9 2 2 2zm0 2c-1.1 0-2 .9-2 2s.9 2 2 2 2-.9 2-2-.9-2-2-2zm0 6c-1.1 0-2 .9-2 2s.9 2 2 2 2-.9 2-2-.9-2-2-2z" />
                          </svg>
                        </button>
                        {exerciseMenuOpenId === exercise.id && (
                          <div
                            className="absolute right-0 top-full z-20 mt-1 min-w-[11rem] rounded-lg border border-[var(--border)] bg-[var(--surface-raised)] py-0.5"
                            onClick={(e) => e.stopPropagation()}
                          >
                            <button
                              type="button"
                              className="w-full px-3 py-2 text-left text-[11px] text-[var(--text)] hover:bg-[var(--border)] transition"
                              onClick={() => {
                                setReplaceExerciseTargetId(exercise.id);
                                setExerciseMenuOpenId(null);
                              }}
                            >
                              Replace exercise
                            </button>
                            <Link
                              href={exerciseHref(exercise)}
                              className="block w-full px-3 py-2 text-left text-[11px] text-[var(--text)] hover:bg-[var(--border)] transition"
                              onClick={() => setExerciseMenuOpenId(null)}
                            >
                              History and records
                            </Link>
                            <button
                              type="button"
                              className="w-full px-3 py-2 text-left text-[11px] text-[var(--text)] hover:bg-[var(--border)] transition"
                              onClick={() => {
                                setReorderMode(true);
                                setExerciseMenuOpenId(null);
                              }}
                            >
                              Reorder exercises
                            </button>
                            <button
                              type="button"
                              className="w-full px-3 py-2 text-left text-[11px] text-[var(--text)] hover:bg-[var(--border)] transition"
                              onClick={() => {
                                setRestAdjustExerciseId(exercise.id);
                                setExerciseMenuOpenId(null);
                              }}
                            >
                              Adjust rest
                            </button>
                            <button
                              type="button"
                              className="w-full px-3 py-2 text-left text-[11px] text-[var(--status-attention)] hover:bg-transparent transition"
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

                    <div className="mt-2 pt-2 border-t border-[var(--border)]">
                      {(() => {
                        const lastSets = previousByKind(exercise.sets, getLastSetsForExercise({
                          exerciseId: exercise.exerciseId,
                          name: exercise.name,
                        }));
                        const numbers = rowNumbers(exercise.sets);
                        const nextIdx = exercise.sets.findIndex((s) => !s?.done);
                        const effectiveNextIdx = nextIdx === -1 ? exercise.sets.length : nextIdx;
                        const logInputShell =
                          "relative min-w-0 h-9 rounded-xl bg-[var(--surface-raised)] border border-[var(--border)] flex items-center transition-colors duration-150 focus-within:ring-2 focus-within:ring-[var(--border)] focus-within:border-[var(--text-secondary)] shadow-[inset_0_1px_0_0_color-mix(in srgb, var(--text) 4%, transparent)]";
                        const rowIconBtn =
                          "min-h-[44px] min-w-[44px] sm:min-h-8 sm:min-w-8 shrink-0 rounded-lg border border-[var(--border)] bg-[var(--surface-raised)] flex items-center justify-center touch-manipulation select-none transition active:scale-[0.96] active:opacity-90";
                        const logInputInner =
                          "min-w-0 flex-1 h-full bg-transparent border-0 rounded-xl px-2 text-xs tabular-nums text-[var(--text)] focus:outline-none focus:ring-0 disabled:opacity-55 disabled:cursor-not-allowed placeholder:text-[var(--text-tertiary)]";

                        return (
                          <div className="overflow-x-auto -mx-0.5 px-0.5">
                            <div className="min-w-[min(100%,20rem)]">
                            <div className="mb-1 grid grid-cols-[1.125rem_minmax(3.25rem,0.8fr)_minmax(4.25rem,1.3fr)_minmax(2.75rem,0.9fr)_2rem_2.75rem] gap-x-2 items-center px-0.5">
                              <span className="text-[9px] font-medium uppercase tracking-wide text-[var(--text-tertiary)] text-center">
                                #
                              </span>
                              <span className="text-[9px] font-medium uppercase tracking-wide text-[var(--text-tertiary)] pl-0.5">
                                Previous
                              </span>
                              <span className="text-[9px] font-medium uppercase tracking-wide text-[var(--text-tertiary)] pl-0.5">
                                Weight
                              </span>
                              <span className="text-[9px] font-medium uppercase tracking-wide text-[var(--text-tertiary)] pl-0.5">
                                Reps
                              </span>
                              <span className="text-[9px] font-medium uppercase tracking-wide text-[var(--text-tertiary)] text-center">
                                RIR
                              </span>
                              <span className="sr-only">Done</span>
                            </div>

                            <ul className="space-y-1 text-[var(--text)]">
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
                                            <div className="mb-0.5 text-[10px] tabular-nums text-[var(--text-secondary)]">
                                              <span className="text-[var(--text-tertiary)]">Rest </span>
                                              <span className="text-[color:var(--color-accent)] font-semibold">
                                                {formatRest(timer.remainingSec)}
                                              </span>
                                            </div>
                                          )}
                                          <div
                                            className={`grid grid-cols-[1.125rem_minmax(3.25rem,0.8fr)_minmax(4.25rem,1.3fr)_minmax(2.75rem,0.9fr)_2rem_2.75rem] gap-x-2 items-center rounded-lg py-0.5 ${
                                              isNext
                                                ? "ring-1 ring-[color:var(--color-accent)]/55 bg-[var(--surface-raised)] shadow-[inset_3px_0_0_0_color-mix(in srgb, var(--green) 55%, transparent),inset_0_0_0_1px_color-mix(in srgb, var(--green) 14%, transparent)]"
                                                : isDraft
                                                  ? "border border-dashed border-[var(--border)] bg-[var(--surface-raised)]"
                                                  : ""
                                            } ${isDraft && !isDone ? "[&_input]:text-[var(--text-secondary)]" : ""} ${isDone ? "bg-[color-mix(in srgb, var(--status-good) 8%, transparent)]" : ""}`}
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
                                                  style={{ color: t === "working" ? undefined : t === "warmup" ? "var(--text-tertiary)" : t === "drop" ? "var(--text-secondary)" : "var(--text)" }}
                                                  aria-label={`Set ${mark || numbers[index]}, ${SET_TYPE_LABEL[t].toLowerCase()}. Change set type`}
                                                  title={SET_TYPE_LABEL[t]}
                                                >
                                                  <span className={t === "working" ? "text-[var(--text-secondary)]" : ""}>{mark || numbers[index]}</span>
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
                                              className="h-9 min-w-0 truncate rounded-lg px-1 text-left text-[11px] tabular-nums text-[var(--text-tertiary)] disabled:cursor-default"
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
                                                className="shrink-0 ml-1 pr-2 text-[9px] font-semibold uppercase tracking-wide text-[var(--text-tertiary)] tabular-nums select-none"
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
                                              className="h-8 sm:h-9 min-h-0 w-full rounded-lg border border-[var(--border)] bg-[var(--surface-raised)] px-1 text-center text-[11px] tabular-nums text-[var(--text)] placeholder:text-[var(--text-tertiary)] shadow-[inset_0_1px_0_0_color-mix(in srgb, var(--text) 4%, transparent)] focus:outline-none focus:ring-1 focus:ring-[var(--border)] focus:border-[var(--text-secondary)] disabled:opacity-55 disabled:cursor-not-allowed [appearance:textfield] [&::-webkit-outer-spin-button]:appearance-none [&::-webkit-inner-spin-button]:appearance-none"
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
                                                    : "border-[var(--border)] text-[var(--text-secondary)] hover:bg-[var(--surface-raised)] hover:border-[var(--border)] hover:text-[var(--text)]"
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
                                              className="mt-1 flex items-center gap-2 rounded-lg border border-[var(--border)] bg-[var(--surface)] px-2 py-1.5 shadow-md shadow-black/30"
                                              onClick={(e) => e.stopPropagation()}
                                            >
                                              <button
                                                type="button"
                                                onClick={() => {
                                                  setSetActionMenuKey(null);
                                                  setExpandedNoteKey(noteKey);
                                                }}
                                                className="flex-1 rounded-md border border-[var(--border)] bg-[var(--surface-raised)] px-2 py-2 text-[12px] font-semibold text-[var(--text)] transition hover:bg-[var(--surface-raised)] active:scale-[0.98]"
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
                                                className="flex-1 rounded-md border border-[var(--border)] bg-[var(--surface-raised)] px-2 py-2 text-[12px] font-semibold text-[var(--text)] transition hover:bg-[var(--surface-raised)] active:scale-[0.98]"
                                              >
                                                Plates
                                              </button>
                                              <button
                                                type="button"
                                                onClick={() => {
                                                  setSetActionMenuKey(null);
                                                  deleteSet(exercise.id, index);
                                                }}
                                                className="flex-1 rounded-md border border-[var(--border)] bg-transparent px-2 py-2 text-[12px] font-semibold text-[var(--status-attention)] transition hover:bg-transparent active:scale-[0.98]"
                                              >
                                                Delete set
                                              </button>
                                              <button
                                                type="button"
                                                onClick={() => setSetActionMenuKey(null)}
                                                className="rounded-md border border-[var(--border)] bg-[var(--surface)] px-2 py-2 text-[12px] font-semibold text-[var(--text-secondary)] transition hover:bg-[var(--surface-raised)]"
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
                                                  className="mt-1 rounded-md border border-[var(--border)] bg-[var(--surface-raised)] px-2 py-1.5 shadow-sm shadow-black/20"
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
                                                      className="text-[10px] px-2 py-1 rounded-md text-[var(--text-secondary)] hover:text-[var(--text)] hover:bg-[var(--border)] transition"
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
                                        ? "border-[color:var(--color-accent)]/30 bg-[color:var(--color-accent)]/8 text-[var(--text)]"
                                        : "border-[var(--border)] bg-[var(--surface-raised)] text-[var(--text)]"
                                    }`}
                                  >
                                    {isActive ? (
                                      <span className="tabular-nums font-semibold text-[color:var(--color-accent)]">
                                        {formatRest(timer.remainingSec)}
                                      </span>
                                    ) : (
                                      <>
                                        <span className="text-[var(--text-tertiary)]">Rest</span>
                                        <span className="tabular-nums font-medium text-[var(--text)]">
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
                                      className="rounded-md border border-[var(--border)] bg-[var(--surface-raised)] px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-[var(--text)] hover:bg-[var(--border)] hover:border-[var(--text-secondary)] transition touch-manipulation"
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

            <div className="mt-4 mb-3">
              <button type="button" onClick={() => setAddPickerOpen(true)} className="h-[48px] w-full rounded-[12px] text-[15px] font-semibold" style={{ background: "var(--surface-raised)", color: "var(--text)" }}>
                + Add exercises
              </button>
            </div>
          </>
        )}

        <ExercisePickerSheet
          open={addPickerOpen}
          onClose={() => setAddPickerOpen(false)}
          mode="multi"
          onPick={appendPicked}
          inRoutine={exercises.map((e) => e.name)}
        />
        <ExercisePickerSheet
          open={replaceExerciseTargetId !== null}
          onClose={() => setReplaceExerciseTargetId(null)}
          mode="single"
          onPick={(list) => list[0] && pickReplacement(list[0])}
        />

        <div className="mt-4">
          {showDiscardConfirm && (
            <div
              className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-[var(--scrim)]"
              role="dialog"
              aria-modal="true"
              aria-labelledby="discard-title"
              onClick={() => setShowDiscardConfirm(false)}
            >
              <div
                className="w-full max-w-sm p-6 rounded-2xl border border-[var(--border)] bg-[var(--surface)] shadow-xl"
                onClick={(e) => e.stopPropagation()}
              >
                <h2 id="discard-title" className="text-lg font-bold text-[var(--text)] mb-2">
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
                    className="px-4 py-2.5 rounded-xl text-sm font-medium bg-transparent border border-[var(--border)] text-[var(--status-attention)] hover:bg-transparent transition"
                  >
                    Discard
                  </button>
                </div>
              </div>
            </div>
          )}

          {showSummary && finished && (
            <WorkoutComplete
              workout={finished.workout}
              records={finished.records}
              unit={unit === "lb" ? "lb" : "kg"}
              routineName={templateId ? templateName : null}
              routineChanges={templateId ? routineChanges : null}
              onUpdateRoutine={() => {
                overwriteTemplateFromSession();
                setRoutineChanges(null);
              }}
              onKeepRoutine={() => setRoutineChanges(null)}
              canSaveRoutine={!templateId}
              routineSaved={routineSaved}
              onSaveRoutine={saveAsRoutineFromSession}
              onDone={() => router.push("/train")}
            />
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
              className="fixed inset-0 z-[55] flex items-end justify-center bg-[var(--scrim)] p-3 pb-[calc(5rem+env(safe-area-inset-bottom,0px))] sm:items-center sm:pb-3"
              onClick={() => setRestAdjustExerciseId(null)}
            >
              <div
                role="dialog"
                aria-labelledby="rest-adjust-title"
                aria-modal="true"
                className="w-full max-w-md rounded-2xl border border-[var(--border)] bg-[var(--surface)] p-4 shadow-2xl shadow-black/55 ring-1 ring-[var(--border)]"
                onClick={(e) => e.stopPropagation()}
              >
                <h2 id="rest-adjust-title" className="text-sm font-semibold text-[var(--text)]">
                  Adjust rest · {exAdj.name}
                </h2>
                <p className="mt-1 text-[11px] leading-snug text-[var(--text-tertiary)]">
                  Default duration for this exercise when the timer runs after a set.
                </p>
                <div className="mt-3 flex items-center justify-between text-[10px] text-[var(--text-secondary)]">
                  <span>Duration</span>
                  <span className="tabular-nums text-[var(--text)]">{formatRest(rAdj)}</span>
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
                  className="mt-1.5 w-full accent-[var(--status-good)] h-2"
                  aria-label={`Rest duration for ${exAdj.name}`}
                />
                <div className="mt-2 flex flex-wrap gap-1.5">
                  {[60, 90, 120, 180].map((sec) => (
                    <button
                      key={sec}
                      type="button"
                      onClick={() => setExerciseRest(exAdj.id, sec)}
                      className="text-[10px] px-2 py-1 rounded-md border border-[var(--border)] bg-[var(--surface-raised)] text-[var(--text-secondary)] hover:text-[var(--text)] hover:bg-[var(--border)]"
                    >
                      {sec}s
                    </button>
                  ))}
                </div>
                <button
                  type="button"
                  className="mt-4 w-full rounded-xl border border-[var(--border)] bg-[var(--surface-raised)] py-2.5 text-sm font-semibold text-[var(--text)] hover:bg-[var(--border)] transition"
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