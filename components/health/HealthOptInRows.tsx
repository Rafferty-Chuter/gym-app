"use client";

import { useState } from "react";
import { Caption, Row, RowGroup } from "@/components/physique/ui";
import { setHealthOptIn, useHealthOptIn, type OptInKind } from "@/lib/physique/io/healthOptIn";

type Props = {
  /** After a kind is turned on or off: the iPhone app asks Apple Health and reads; Health Auto Export pulls again. */
  onChange: (kind: OptInKind, on: boolean) => Promise<void> | void;
  /** False in an iPhone app build that can't read cycle (before IN8). */
  cycleAvailable?: boolean;
  disabled?: boolean;
};

const ROWS: ReadonlyArray<{ kind: OptInKind; label: string; sub: string }> = [
  { kind: "wristTemp", label: "Wrist temperature", sub: "Each night's reading, beside your usual." },
  { kind: "cycle", label: "Cycle", sub: "Period days, noted beside your weight." },
];

/**
 * IN8: the two Apple Health kinds read only when the person turns them on
 * (after Apple Health's Period Tracking and WHOOP's cycle overlay: one
 * switch a kind, what it is for under it, what off does).
 */
export default function HealthOptInRows({ onChange, cycleAvailable = true, disabled }: Props) {
  const optIn = useHealthOptIn();
  const [busy, setBusy] = useState(false);

  async function toggle(kind: OptInKind, on: boolean) {
    setBusy(true);
    try {
      await setHealthOptIn(kind, on, new Date().toISOString());
      await onChange(kind, on);
    } finally {
      setBusy(false);
    }
  }

  return (
    <section className="flex flex-col gap-2" aria-label="Also read, if you choose">
      <Caption>Also read, if you choose</Caption>
      <RowGroup>
        {ROWS.map(({ kind, label, sub }) => {
          const on = optIn?.[kind] === true;
          const unavailable = kind === "cycle" && !cycleAvailable;
          return (
            <Row
              key={kind}
              label={label}
              sub={unavailable ? "Needs the latest version of the app." : sub}
              value={
                <button
                  type="button"
                  role="switch"
                  aria-checked={on}
                  aria-label={`${on ? "Stop reading" : "Read"} ${label.toLowerCase()}`}
                  onClick={() => void toggle(kind, !on)}
                  disabled={disabled || busy || (unavailable && !on)}
                  className="relative h-7 w-12 shrink-0 rounded-full transition-colors disabled:opacity-50"
                  style={{ background: on ? "var(--primary)" : "var(--border-strong)" }}
                >
                  <span className="absolute top-0.5 h-6 w-6 rounded-full transition-transform" style={{ left: 2, background: on ? "var(--text-on-primary)" : "var(--surface)", transform: on ? "translateX(20px)" : "translateX(0)" }} />
                </button>
              }
            />
          );
        })}
      </RowGroup>
      <p className="text-[11px]" style={{ color: "var(--text-tertiary)" }}>
        Off unless you turn them on. Turning one off deletes what was read for it.
      </p>
    </section>
  );
}
