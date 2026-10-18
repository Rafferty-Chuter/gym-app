"use client";

import { useState } from "react";
import {
  countConfirmedSets,
  formatIdleDuration,
  stripDraftSets,
  saveActiveWorkout,
  clearActiveWorkout,
  type DraftWorkout,
} from "@/lib/activeWorkout";

export type StaleSessionModalProps = {
  draft: DraftWorkout;
  /** Persist the draft as a finished workout in workoutHistory. */
  onFinishSession: (draft: DraftWorkout) => void;
  /** Navigate into the workout page in resume state. */
  onResumeLogging: () => void;
  /** Called after the modal handles dismissal (either action complete or close). */
  onClose: () => void;
};

function draftDisplayName(d: DraftWorkout): string {
  const w = d.workoutName?.trim();
  if (w) return w;
  const t = d.templateName?.trim();
  if (t) return t;
  const first = d.exercises?.[0]?.name?.trim();
  if (first) return `${first} Workout`;
  return "Unfinished workout";
}

/**
 * Prompt shown on home when an active workout has been idle long enough to
 * be "stale" (18h+ with ≥2 confirmed sets per P1.9). Three actions:
 *   - Finish session  → commits confirmed sets to History
 *   - Resume logging  → clears drafts, opens the workout page
 *   - Discard         → asks for confirmation, then deletes the session
 */
export default function StaleSessionModal({
  draft,
  onFinishSession,
  onResumeLogging,
  onClose,
}: StaleSessionModalProps) {
  const [showDiscardConfirm, setShowDiscardConfirm] = useState(false);
  const confirmedCount = countConfirmedSets(draft);
  const idleText = formatIdleDuration(draft);
  const title = draftDisplayName(draft);

  function handleFinish() {
    onFinishSession(draft);
    onClose();
  }

  function handleResume() {
    // Strip drafts BEFORE navigating — stale drafts shouldn't carry forward.
    saveActiveWorkout(stripDraftSets(draft));
    onResumeLogging();
    onClose();
  }

  function handleDiscard() {
    clearActiveWorkout();
    onClose();
  }

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-[var(--scrim)]"
      role="dialog"
      aria-modal="true"
      aria-labelledby="stale-session-title"
    >
      <div
        className="w-full max-w-sm rounded-2xl border border-[var(--border)] bg-zinc-900 p-5 shadow-[0_24px_60px_-12px_rgba(0,0,0,0.9)]"
        onClick={(e) => e.stopPropagation()}
      >
        <h2 id="stale-session-title" className="text-lg font-bold text-[var(--text)] mb-1">
          Unfinished workout
        </h2>
        <p className="text-sm text-app-secondary leading-snug">
          <span className="text-[var(--text)] font-semibold">{title}</span> · {confirmedCount}{" "}
          confirmed set{confirmedCount === 1 ? "" : "s"} · last updated {idleText}.
        </p>
        <p className="text-[12px] text-app-tertiary mt-2 leading-snug">
          Pick up where you left off, finalise what&rsquo;s logged so far, or discard the session.
        </p>

        {!showDiscardConfirm ? (
          <div className="mt-5 space-y-2">
            <button
              type="button"
              onClick={handleResume}
              className="w-full py-3 rounded-xl bg-[var(--primary)] text-[var(--text-on-primary)] font-semibold transition hover:bg-teal-400 active:scale-[0.98]"
            >
              Resume logging
            </button>
            <button
              type="button"
              onClick={handleFinish}
              className="w-full py-3 rounded-xl border border-[var(--border)] bg-teal-950/40 text-[var(--green-strong)] font-semibold transition hover:bg-teal-900/55 active:scale-[0.98]"
            >
              Finish session
            </button>
            <button
              type="button"
              onClick={() => setShowDiscardConfirm(true)}
              className="w-full py-3 rounded-xl border border-zinc-700/60 bg-zinc-900/60 text-app-secondary font-semibold transition hover:bg-zinc-800/70 hover:text-[var(--text)] active:scale-[0.98]"
            >
              Discard
            </button>
          </div>
        ) : (
          <div className="mt-5 space-y-2">
            <p className="text-sm text-[var(--status-attention)] leading-snug">
              This will delete {confirmedCount} confirmed set{confirmedCount === 1 ? "" : "s"}. Are you sure?
            </p>
            <button
              type="button"
              onClick={handleDiscard}
              className="w-full py-3 rounded-xl border border-red-700/50 bg-red-950/40 text-[var(--status-attention)] font-semibold transition hover:bg-red-900/50 active:scale-[0.98]"
            >
              Yes, discard
            </button>
            <button
              type="button"
              onClick={() => setShowDiscardConfirm(false)}
              className="w-full py-3 rounded-xl border border-zinc-700/60 bg-zinc-900/60 text-app-secondary font-semibold transition hover:bg-zinc-800/70 hover:text-[var(--text)] active:scale-[0.98]"
            >
              Cancel
            </button>
          </div>
        )}
      </div>
    </div>
  );
}
