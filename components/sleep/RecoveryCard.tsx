"use client";

import { SCard, SRow } from "@/components/sleep/parts";
import { BASELINE_MIN_VALID, RECENT_DAYS, RECENT_MIN_VALID, type RecoveryRead } from "@/lib/physique/recovery";
import { STATUS_HEX } from "@/lib/ui/status";

/**
 * Recovery (02 §7.4, S8 colours): the word in its status colour beside the
 * caption, then HRV and resting heart rate over the last week against
 * their usual. Absent without watch data; "Calibrating" until the windows
 * fill.
 */
export default function RecoveryCard({ read }: { read: RecoveryRead }) {
  if (read.status === "none") return null;
  const calibrating = read.status === "calibrating";
  const needed = BASELINE_MIN_VALID + RECENT_MIN_VALID;
  return (
    <SCard
      title={`Recovery · last ${RECENT_DAYS} days`}
      aside={
        <span className="text-[13px] font-semibold" style={{ color: calibrating ? "var(--sl-text-tertiary)" : STATUS_HEX[read.state] }}>
          {read.word}
        </span>
      }
      label="Recovery"
      className="divide-y divide-[var(--sl-border)]"
    >
      {calibrating ? (
        <SRow label="Watch nights" sub="HRV and resting heart rate read against your own usual from here" value={`${read.validNights} of ${needed}`} />
      ) : (
        <>
          <SRow label="HRV" sub={read.hrv ? `Usually ${read.hrv.baseline} ms` : "No baseline yet"} value={read.hrv ? `${read.hrv.recent} ms` : "–"} />
          <SRow label="Resting heart rate" sub={read.rhr ? `Usually ${read.rhr.baseline} bpm` : "No baseline yet"} value={read.rhr ? `${read.rhr.recent} bpm` : "–"} />
        </>
      )}
    </SCard>
  );
}
