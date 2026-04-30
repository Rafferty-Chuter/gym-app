"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useCallback, useEffect, useState } from "react";
import {
  ACTIVE_WORKOUT_CHANGED_EVENT,
  draftHasMeaningfulContent,
  getActiveWorkout,
  type DraftWorkout,
} from "@/lib/activeWorkout";

function formatElapsed(sec: number): string {
  const h = Math.floor(sec / 3600);
  const m = Math.floor((sec % 3600) / 60);
  const s = sec % 60;
  if (h > 0) return `${h}:${String(m).padStart(2, "0")}:${String(s).padStart(2, "0")}`;
  return `${m}:${String(s).padStart(2, "0")}`;
}

function draftDisplayName(d: DraftWorkout): string {
  const w = d.workoutName?.trim();
  if (w) return w;
  const t = d.templateName?.trim();
  if (t) return t;
  const first = d.exercises?.[0]?.name?.trim();
  if (first) return `${first} Workout`;
  return "Active workout";
}

/** Strip: Templates / Coach / Profile only — Home & live workout use dedicated resume UI. */
function shouldShowResumeStrip(pathname: string | null): boolean {
  if (!pathname) return false;
  if (pathname === "/workout") return false;
  if (pathname === "/") return false;
  if (pathname.startsWith("/templates")) return true;
  if (pathname === "/coach" || pathname.startsWith("/coach/")) return true;
  if (pathname === "/profile" || pathname.startsWith("/profile/")) return true;
  return false;
}

export default function ActiveWorkoutResumeBar() {
  const pathname = usePathname();
  const [draft, setDraft] = useState<DraftWorkout | null>(null);
  const [elapsedSec, setElapsedSec] = useState(0);

  const refresh = useCallback(() => {
    if (typeof window === "undefined") return;
    const d = getActiveWorkout();
    if (d && draftHasMeaningfulContent(d)) {
      setDraft(d);
      setElapsedSec(Math.max(0, Math.floor((Date.now() - d.startedAt) / 1000)));
    } else {
      setDraft(null);
    }
  }, []);

  useEffect(() => { refresh(); }, [refresh]);

  useEffect(() => {
    function onChanged() { refresh(); }
    function onStorage(e: StorageEvent) { if (e.key === "activeWorkout") refresh(); }
    window.addEventListener(ACTIVE_WORKOUT_CHANGED_EVENT, onChanged);
    window.addEventListener("storage", onStorage);
    window.addEventListener("focus", refresh);
    return () => {
      window.removeEventListener(ACTIVE_WORKOUT_CHANGED_EVENT, onChanged);
      window.removeEventListener("storage", onStorage);
      window.removeEventListener("focus", refresh);
    };
  }, [refresh]);

  useEffect(() => {
    if (!draft) return;
    const id = window.setInterval(() => {
      setElapsedSec(Math.max(0, Math.floor((Date.now() - draft.startedAt) / 1000)));
    }, 1000);
    return () => window.clearInterval(id);
  }, [draft]);

  if (!shouldShowResumeStrip(pathname)) return null;
  if (!draft) return null;

  const title = draftDisplayName(draft);

  return (
    <div
      className="pointer-events-none fixed inset-x-0 z-30 flex justify-center px-3"
      style={{ bottom: "calc(4.75rem + env(safe-area-inset-bottom, 0px))" }}
    >
      <Link
        href="/workout"
        aria-label={`Resume workout: ${title}, ${formatElapsed(elapsedSec)} elapsed`}
        className="pointer-events-auto flex w-full max-w-3xl items-center gap-3 rounded-xl px-3 py-2.5 backdrop-blur-sm transition"
        style={{
          background: "rgba(14,20,32,0.95)",
          border: "1px solid rgba(0,229,176,0.28)",
          boxShadow: "0 4px 20px rgba(0,0,0,0.50)",
        }}
      >
        <div
          className="flex h-7 w-7 shrink-0 items-center justify-center rounded-lg"
          style={{ background: "rgba(0,229,176,0.12)", color: "#00e5b0" }}
        >
          <svg className="h-3.5 w-3.5" fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24" aria-hidden>
            <path strokeLinecap="round" strokeLinejoin="round" d="M14.752 11.168l-3.197-2.132A1 1 0 0010 9.87v4.263a1 1 0 001.555.832l3.197-2.132a1 1 0 000-1.664z"/>
            <path strokeLinecap="round" strokeLinejoin="round" d="M21 12a9 9 0 11-18 0 9 9 0 0118 0z"/>
          </svg>
        </div>
        <div className="min-w-0 flex-1 flex items-center gap-2">
          <span className="truncate text-[13px] font-semibold text-white">{title}</span>
          <span className="shrink-0 text-[12px] font-medium tabular-nums" style={{ color: "rgba(0,229,176,0.65)" }}>
            {formatElapsed(elapsedSec)}
          </span>
        </div>
        <span className="shrink-0 text-xs font-semibold" style={{ color: "#00e5b0" }}>Resume →</span>
      </Link>
    </div>
  );
}
