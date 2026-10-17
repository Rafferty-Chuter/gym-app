"use client";

import { Row, RowGroup } from "@/components/physique/ui";
import type { RecoveryRead } from "@/lib/physique/recovery";
import { STATUS_HEX } from "@/lib/ui/status";

/**
 * Recovery (02 §7.4): one row, a word in the status colour and the HRV
 * and resting HR against their baselines. Nothing without watch data;
 * "Calibrating" in grey until the windows fill. Never a score.
 */
export default function RecoveryRow({ read }: { read: RecoveryRead }) {
  if (read.status === "none") return null;
  const color = read.status === "calibrating" ? "#6f6f76" : STATUS_HEX[read.state];
  return (
    <section aria-label="Recovery">
      <RowGroup>
        <Row label="Recovery" sub={read.detail} value={<span style={{ color }}>{read.word}</span>} />
      </RowGroup>
    </section>
  );
}
