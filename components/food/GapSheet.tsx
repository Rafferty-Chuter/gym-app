"use client";

import { useState } from "react";
import Sheet from "@/components/ui/Sheet";
import { ErrorLine, PrimaryButton, SecondaryButton } from "@/components/physique/ui";
import { longLocalDate } from "@/components/charts/TimeSeriesChart";
import { gapDayWord } from "@/lib/physique/gaps";
import type { LocalDate } from "@/lib/dates";
import type { SaveResult } from "@/lib/physique/io/bodyData";

export type CopySource = { date: LocalDate; entries: number };

type Props = {
  /** The unlogged day, or null when closed. */
  date: LocalDate | null;
  today: LocalDate;
  onClose: () => void;
  /** Days with entries, nearest to the gap first. Empty hides the copy option. */
  sources: readonly CopySource[];
  onLog: () => void;
  onCopy: (from: LocalDate) => Promise<SaveResult>;
  onEditDay: () => void;
};

/**
 * The three ways to close a food gap (Sprint 0, W2): log it now, copy a
 * logged day onto it, or mark it fasting / set a total through Edit day.
 */
export default function GapSheet(props: Props) {
  const { date, onClose } = props;
  return (
    <Sheet open={date != null} onClose={onClose} title={date ? longLocalDate(date) : ""}>
      {date && <Inner key={date} {...props} date={date} />}
    </Sheet>
  );
}

function Inner({ date, today, sources, onLog, onCopy, onEditDay }: Omit<Props, "date" | "onClose"> & { date: LocalDate }) {
  const [idx, setIdx] = useState(0);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const src = sources[Math.min(idx, Math.max(0, sources.length - 1))] ?? null;

  async function copy() {
    if (!src) return;
    setBusy(true);
    setError(null);
    const r = await onCopy(src.date);
    setBusy(false);
    if (!r.ok) setError(r.error);
  }

  const arrow = (dir: "left" | "right", onClick: () => void, disabled: boolean, label: string) => (
    <button type="button" onClick={onClick} disabled={disabled} className="flex h-9 w-9 items-center justify-center rounded-full disabled:opacity-30" style={{ color: "#a3a3a8" }} aria-label={label}>
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" className="h-4 w-4" aria-hidden>
        <path d={dir === "left" ? "M15 6l-6 6 6 6" : "M9 6l6 6-6 6"} />
      </svg>
    </button>
  );

  return (
    <div className="flex flex-col gap-3">
      <p className="text-[13px]" style={{ color: "#a3a3a8" }}>
        {gapDayWord(date, today)} has no food logged. The engine skips it until it does.
      </p>
      <PrimaryButton onClick={onLog}>Log food</PrimaryButton>
      {src && (
        <div className="flex flex-col gap-2 rounded-[12px] p-3" style={{ background: "#1d1d20" }}>
          <div className="flex items-center justify-between">
            {arrow("left", () => setIdx((i) => Math.min(sources.length - 1, i + 1)), idx >= sources.length - 1, "Earlier day")}
            <span className="flex flex-col items-center">
              <span className="text-[15px] font-semibold" style={{ color: "#f2f2f0" }}>
                {src.date === today ? "Today" : longLocalDate(src.date)}
              </span>
              <span className="text-[11px]" style={{ color: "#6f6f76" }}>
                {src.entries} {src.entries === 1 ? "entry" : "entries"}
              </span>
            </span>
            {arrow("right", () => setIdx((i) => Math.max(0, i - 1)), idx <= 0, "Later day")}
          </div>
          <SecondaryButton onClick={copy} disabled={busy}>
            {busy ? "Copying…" : "Copy that day onto it"}
          </SecondaryButton>
        </div>
      )}
      <SecondaryButton onClick={onEditDay}>Fasting day or set a total</SecondaryButton>
      <ErrorLine text={error} />
    </div>
  );
}
