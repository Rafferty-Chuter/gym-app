"use client";

import { usePathname } from "next/navigation";
import { useCallback, useEffect, useRef, useState } from "react";
import {
  ACTIVE_WORKOUT_CHANGED_EVENT,
  getActiveWorkout,
  saveActiveWorkout,
  type DraftWorkout,
} from "@/lib/activeWorkout";
import { getRestTimerSettings } from "@/lib/restTimerSettings";

type RunningTimer = {
  exerciseId: number;
  exerciseName: string;
  remainingSec: number;
  totalSec: number;
  /** epoch ms when the timer is scheduled to end. */
  endsAt: number;
};

function formatMMSS(sec: number): string {
  const safe = Math.max(0, sec);
  const m = Math.floor(safe / 60);
  const s = safe % 60;
  return `${m}:${String(s).padStart(2, "0")}`;
}

function pickRunningTimer(draft: DraftWorkout | null): RunningTimer | null {
  if (!draft || !draft.restTimerByExercise) return null;
  const now = Date.now();
  let best: RunningTimer | null = null;
  let bestStartedAt = -Infinity;
  for (const [k, t] of Object.entries(draft.restTimerByExercise)) {
    if (!t?.timerRunning) continue;
    const endsAt = typeof t.timerTargetEndAt === "number" ? t.timerTargetEndAt : 0;
    if (!endsAt || endsAt <= now) continue;
    const startedAt = typeof t.timerStartedAt === "number" ? t.timerStartedAt : 0;
    if (startedAt > bestStartedAt) {
      bestStartedAt = startedAt;
      const exerciseId = Number(k);
      const exerciseName =
        draft.exercises.find((e) => e.id === exerciseId)?.name?.trim() || "Rest";
      best = {
        exerciseId,
        exerciseName,
        remainingSec: Math.max(0, Math.ceil((endsAt - now) / 1000)),
        totalSec: Math.max(0, Math.round(t.restDurationSec ?? 0)),
        endsAt,
      };
    }
  }
  return best;
}

/** Inline UI on the workout page already exposes rest state — don't double up there. */
function shouldShowBanner(pathname: string | null): boolean {
  if (!pathname) return false;
  if (pathname === "/workout") return false;
  return true;
}

let audioCtxSingleton: AudioContext | null = null;
function playCompletionTone(): void {
  if (typeof window === "undefined") return;
  try {
    const ctor =
      (window as unknown as { AudioContext?: typeof AudioContext; webkitAudioContext?: typeof AudioContext })
        .AudioContext ??
      (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
    if (!ctor) return;
    if (!audioCtxSingleton) audioCtxSingleton = new ctor();
    const ctx = audioCtxSingleton;
    if (ctx.state === "suspended") ctx.resume().catch(() => {});
    const now = ctx.currentTime;
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    osc.type = "sine";
    osc.frequency.setValueAtTime(880, now);
    osc.frequency.exponentialRampToValueAtTime(660, now + 0.35);
    gain.gain.setValueAtTime(0.0001, now);
    gain.gain.exponentialRampToValueAtTime(0.18, now + 0.04);
    gain.gain.exponentialRampToValueAtTime(0.0001, now + 0.5);
    osc.connect(gain).connect(ctx.destination);
    osc.start(now);
    osc.stop(now + 0.55);
  } catch {
    /* audio failure shouldn't crash the UI */
  }
}

function vibrateCompletion(): void {
  if (typeof navigator === "undefined") return;
  try {
    navigator.vibrate?.([120, 60, 120]);
  } catch {
    /* ignore */
  }
}

/** Snapshot of activeWorkout. Used so the banner can update its skip optimistically. */
function loadDraft(): DraftWorkout | null {
  return getActiveWorkout();
}

export default function RestTimerBanner() {
  const pathname = usePathname();
  // Initialize lazily during render so SSR sees null and hydration matches.
  const [timer, setTimer] = useState<RunningTimer | null>(() =>
    typeof window === "undefined" ? null : pickRunningTimer(loadDraft())
  );
  const lastNotifiedExerciseRef = useRef<number | null>(null);

  const refresh = useCallback(() => {
    setTimer(pickRunningTimer(loadDraft()));
  }, []);

  useEffect(() => {
    function onChanged() {
      refresh();
    }
    function onStorage(e: StorageEvent) {
      if (e.key === "activeWorkout") refresh();
    }
    window.addEventListener(ACTIVE_WORKOUT_CHANGED_EVENT, onChanged);
    window.addEventListener("storage", onStorage);
    window.addEventListener("focus", refresh);
    return () => {
      window.removeEventListener(ACTIVE_WORKOUT_CHANGED_EVENT, onChanged);
      window.removeEventListener("storage", onStorage);
      window.removeEventListener("focus", refresh);
    };
  }, [refresh]);

  // 1-Hz tick. When the timer transitions to 0, fire notifications once.
  useEffect(() => {
    if (!timer) return;
    const id = window.setInterval(() => {
      const draft = loadDraft();
      const next = pickRunningTimer(draft);
      setTimer((prev) => {
        const remaining = next ? next.remainingSec : 0;
        if (prev && remaining <= 0 && lastNotifiedExerciseRef.current !== prev.exerciseId) {
          lastNotifiedExerciseRef.current = prev.exerciseId;
          const settings = getRestTimerSettings();
          if (settings.vibrate) vibrateCompletion();
          if (settings.sound) playCompletionTone();
        }
        if (next) return next;
        return null;
      });
    }, 1000);
    return () => window.clearInterval(id);
    // We only want to (re-)create the 1s loop when a different exercise's
    // timer takes over — including the full `timer` object would re-create
    // the interval every tick, which defeats the purpose.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [timer?.exerciseId]);

  function skip(): void {
    if (!timer) return;
    const draft = loadDraft();
    if (!draft || !draft.restTimerByExercise) return;
    const entry = draft.restTimerByExercise[timer.exerciseId];
    if (!entry) return;
    const next: DraftWorkout = {
      ...draft,
      restTimerByExercise: {
        ...draft.restTimerByExercise,
        [timer.exerciseId]: {
          ...entry,
          timerRunning: false,
          timerTargetEndAt: Date.now(),
        },
      },
    };
    saveActiveWorkout(next);
    setTimer(null);
  }

  if (!shouldShowBanner(pathname)) return null;
  if (!timer) return null;

  const pct = timer.totalSec > 0
    ? Math.max(0, Math.min(100, (timer.remainingSec / timer.totalSec) * 100))
    : 0;

  return (
    <div
      className="pointer-events-none fixed inset-x-0 z-30 flex justify-center px-3"
      style={{ bottom: "calc(8rem + env(safe-area-inset-bottom, 0px))" }}
    >
      <div
        className="pointer-events-auto flex w-full max-w-3xl items-center gap-3 rounded-xl px-3 py-2.5 backdrop-blur-sm"
        style={{
          background: "rgba(14,20,32,0.95)",
          border: "1px solid rgba(0,229,176,0.28)",
          boxShadow: "0 4px 20px rgba(0,0,0,0.50)",
        }}
        role="status"
        aria-live="polite"
        aria-label={`Rest timer for ${timer.exerciseName}: ${formatMMSS(timer.remainingSec)} remaining`}
      >
        <div
          className="flex h-7 w-7 shrink-0 items-center justify-center rounded-lg"
          style={{ background: "rgba(0,229,176,0.12)", color: "#00e5b0" }}
          aria-hidden
        >
          <svg className="h-3.5 w-3.5" fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24">
            <circle cx="12" cy="12" r="9" />
            <path strokeLinecap="round" strokeLinejoin="round" d="M12 7v5l3 2" />
          </svg>
        </div>
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-2">
            <span className="truncate text-[13px] font-semibold text-white">{timer.exerciseName}</span>
            <span
              className="shrink-0 text-[12px] font-bold tabular-nums"
              style={{ color: "rgba(0,229,176,0.85)" }}
            >
              {formatMMSS(timer.remainingSec)}
            </span>
          </div>
          <div
            className="mt-1 h-1 w-full overflow-hidden rounded-full"
            style={{ background: "rgba(255,255,255,0.06)" }}
            aria-hidden
          >
            <div
              className="h-full"
              style={{ width: `${pct}%`, background: "rgba(0,229,176,0.55)" }}
            />
          </div>
        </div>
        <button
          type="button"
          onClick={skip}
          className="shrink-0 rounded-lg border border-teal-500/35 bg-teal-950/30 px-3 py-1.5 text-[11px] font-bold uppercase tracking-wide text-teal-100 transition active:scale-[0.97] hover:bg-teal-900/40"
          aria-label="Skip rest"
        >
          Skip
        </button>
      </div>
    </div>
  );
}
