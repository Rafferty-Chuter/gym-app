"use client";

import { Caption, Row, RowGroup } from "@/components/physique/ui";
import type { Contributor, RatingWord } from "@/lib/physique/sleepView";
import { STATUS_HEX } from "@/lib/ui/status";

const WORD_COLOR: Record<RatingWord, string> = {
  Poor: STATUS_HEX.attention,
  Fair: STATUS_HEX.watch,
  Good: STATUS_HEX.good,
  Excellent: STATUS_HEX.good,
};

/** The contributors shown: the ones a watch or a manual log can both fill. Wake-ups is a manual count, shown per night instead. */
const SHOWN: ReadonlyArray<Contributor["id"]> = ["duration", "efficiency", "consistency", "debt"];

/** Contributors (DESIGN.md, from Bevel): label and detail, the word in the status colour, a thin bar. Never a score. */
export default function SleepContributors({ items }: { items: Contributor[] }) {
  const shown = SHOWN.map((id) => items.find((c) => c.id === id)).filter((c): c is Contributor => c != null);
  return (
    <section aria-label="Contributors">
      <div className="mb-2">
        <Caption>Contributors · last 7 nights</Caption>
      </div>
      <RowGroup>
        {shown.map((c) => (
          <Row
            key={c.id}
            label={c.label}
            sub={c.detail}
            value={<span style={{ color: c.word ? WORD_COLOR[c.word] : "#6f6f76", fontSize: 15 }}>{c.word ?? "Early read"}</span>}
            below={
              <div className="h-1 w-full overflow-hidden rounded-full" style={{ background: "#1d1d20" }} aria-hidden>
                <div className="h-full rounded-full" style={{ width: `${Math.round(c.fill * 100)}%`, background: "#a3a3a8" }} />
              </div>
            }
          />
        ))}
      </RowGroup>
    </section>
  );
}
