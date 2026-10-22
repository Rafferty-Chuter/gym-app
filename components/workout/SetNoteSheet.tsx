"use client";

import Sheet from "@/components/ui/Sheet";
import { PrimaryButton } from "@/components/physique/ui";

/** Longest set note, characters. OURS: two lines under the set row, and room for a cue or how it felt. */
export const SET_NOTE_MAX = 200;

/**
 * A set's note in a sheet (Strong's and Hevy's notes sit on their own
 * line, not in a cramped inline field). Saves as you type; last
 * session's note for the same set sits above, so a cue carries over.
 */
export default function SetNoteSheet({ open, context, value, lastNote, onChange, onClose }: { open: boolean; /** Which set, e.g. "Barbell Squat · Set 2". */ context: string; value: string; lastNote?: string; onChange: (value: string) => void; onClose: () => void }) {
  return (
    <Sheet open={open} onClose={onClose} title="Note" footer={<PrimaryButton onClick={onClose}>Done</PrimaryButton>}>
      <p className="-mt-1 mb-3 truncate text-[13px]" style={{ color: "var(--text-secondary)" }}>
        {context}
      </p>
      {lastNote && (
        <p className="mb-3 text-[13px] leading-snug" style={{ color: "var(--text-secondary)" }}>
          <span style={{ color: "var(--text-tertiary)" }}>Last time: </span>
          {lastNote}
        </p>
      )}
      <textarea
        data-sheet-autofocus
        rows={3}
        maxLength={SET_NOTE_MAX}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder="How it felt, a cue, the setup"
        aria-label="Note for this set"
        className="block w-full resize-none rounded-[12px] px-3.5 py-3 text-[16px] leading-snug outline-none placeholder:text-[var(--text-tertiary)] focus:ring-1 focus:ring-[var(--border-strong)]"
        style={{ background: "var(--surface-raised)", color: "var(--text)" }}
      />
    </Sheet>
  );
}
