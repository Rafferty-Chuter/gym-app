"use client";

import { BASELINE_MIN_VALID, RECENT_DAYS, RECENT_MIN_VALID, type RecoveryRead } from "@/lib/physique/recovery";
import { STATUS_HEX } from "@/lib/ui/status";

function Tile({ label, value, unit, usual }: { label: string; value: number | null; unit: string; usual: number | null }) {
  return (
    <div className="flex flex-col rounded-[12px] px-3 py-2.5" style={{ background: "#1d1d20" }}>
      <span className="text-[11px] font-medium uppercase tracking-[0.04em]" style={{ color: "#6f6f76" }}>
        {label}
      </span>
      <span className="text-[20px] font-semibold leading-tight" style={{ color: value == null ? "#6f6f76" : "#f2f2f0", fontVariantNumeric: "tabular-nums" }}>
        {value == null ? "–" : value}
        {value != null && (
          <span className="ml-1 text-[13px] font-medium" style={{ color: "#a3a3a8" }}>
            {unit}
          </span>
        )}
      </span>
      <span className="text-[11px]" style={{ color: "#6f6f76", fontVariantNumeric: "tabular-nums" }}>
        {usual == null ? "No baseline yet" : `usually ${usual}`}
      </span>
    </div>
  );
}

/**
 * Recovery (02 §7.4, after Bevel's recovery card without the ring): a
 * word in the status colour, then HRV and resting HR over the last week
 * against their usual. Absent without watch data. Never a score.
 */
export default function RecoveryCard({ read }: { read: RecoveryRead }) {
  if (read.status === "none") return null;
  const calibrating = read.status === "calibrating";
  return (
    <section aria-label="Recovery" className="flex flex-col gap-3 rounded-[16px] p-4" style={{ background: "#141416" }}>
      <div className="flex items-baseline justify-between gap-3">
        <span className="text-[17px] font-semibold" style={{ color: "#f2f2f0" }}>
          Recovery
        </span>
        <span className="text-[15px] font-semibold" style={{ color: calibrating ? "#6f6f76" : STATUS_HEX[read.state] }}>
          {read.word}
        </span>
      </div>
      {calibrating ? (
        <p className="text-[13px] leading-snug" style={{ color: "#a3a3a8" }}>
          {read.validNights} of {BASELINE_MIN_VALID + RECENT_MIN_VALID} nights with watch data. It reads HRV and resting heart rate against your own usual once there are enough.
        </p>
      ) : (
        <>
          <div className="grid grid-cols-2 gap-2">
            <Tile label="HRV" value={read.hrv?.recent ?? null} unit="ms" usual={read.hrv?.baseline ?? null} />
            <Tile label="Resting HR" value={read.rhr?.recent ?? null} unit="bpm" usual={read.rhr?.baseline ?? null} />
          </div>
          <p className="text-[11px]" style={{ color: "#6f6f76" }}>
            Average of the last {RECENT_DAYS} days against the 60 before{read.flags.includes("sleep") ? ". Short sleep counts against it too." : "."}
          </p>
        </>
      )}
    </section>
  );
}
