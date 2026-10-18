"use client";

import { Caption, Row, RowGroup } from "@/components/physique/ui";
import { BASELINE_MIN_VALID, RECENT_DAYS, RECENT_MIN_VALID, type RecoveryRead } from "@/lib/physique/recovery";
import { STATUS_HEX } from "@/lib/ui/status";

/**
 * Recovery (02 §7.4): the word in the status colour beside the caption,
 * then HRV and resting HR over the last week against their usual, as rows.
 * Absent without watch data; "Calibrating" until the windows fill. Never a
 * score.
 */
export default function RecoveryCard({ read }: { read: RecoveryRead }) {
  if (read.status === "none") return null;
  const calibrating = read.status === "calibrating";
  const needed = BASELINE_MIN_VALID + RECENT_MIN_VALID;
  return (
    <section aria-label="Recovery">
      <div className="mb-2 flex items-baseline justify-between">
        <Caption>Recovery · last {RECENT_DAYS} days</Caption>
        <span className="text-[13px] font-semibold" style={{ color: calibrating ? "#6f6f76" : STATUS_HEX[read.state] }}>
          {read.word}
        </span>
      </div>
      <RowGroup>
        {calibrating ? (
          <Row label="Watch nights" value={`${read.validNights} of ${needed}`} sub="HRV and resting heart rate read against your own usual from here" />
        ) : (
          <>
            <Row label="HRV" value={read.hrv ? `${read.hrv.recent} ms` : "–"} sub={read.hrv ? `Usually ${read.hrv.baseline} ms` : "No baseline yet"} />
            <Row label="Resting heart rate" value={read.rhr ? `${read.rhr.recent} bpm` : "–"} sub={read.rhr ? `Usually ${read.rhr.baseline} bpm` : "No baseline yet"} />
          </>
        )}
      </RowGroup>
    </section>
  );
}
