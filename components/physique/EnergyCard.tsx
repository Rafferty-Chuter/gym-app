"use client";

import { Caption, Row, RowGroup } from "@/components/physique/ui";
import type { PhysiqueAnalysis } from "@/lib/physique/types";

/** Expenditure with its maturity state and ±, today's targets, and 14-day adherence (02 §4.3). */
export default function EnergyCard({ analysis }: { analysis: PhysiqueAnalysis }) {
  const e = analysis.expenditure;
  const t = analysis.targets;
  const a = analysis.adherence;
  const stateWord =
    e.state === "stable"
      ? "stable"
      : e.state === "settling"
        ? "settling"
        : e.state === "holding"
          ? "holding"
          : analysis.data.updatingDays === 0 && e.kcal == null
            ? "needs food and weigh-ins"
            : `calibrating · day ${Math.min(21, analysis.data.updatingDays)} of about 21`;
  const maintenance = e.kcal == null ? "Not enough data yet" : `≈ ${Math.round(e.kcal).toLocaleString("en-GB")}${e.plusMinus ? ` ± ${e.plusMinus}` : ""}`;
  const adherenceLine =
    a.deltaKcal == null
      ? a.daysLogged > 0
        ? `${a.daysLogged} of 14 days logged · too few for a read`
        : "No food logged in the last 14 days"
      : `${a.onTarget ? "On target" : a.deltaKcal < 0 ? "Under target" : "Over target"} (${a.deltaKcal > 0 ? "+" : "−"}${Math.abs(Math.round(a.deltaKcal))} kcal/day over ${a.daysLogged} days)`;
  return (
    <section aria-label="Energy">
      <div className="mb-2 flex items-baseline justify-between">
        <span className="text-[17px] font-semibold" style={{ color: "#f2f2f0" }}>
          Energy
        </span>
        <Caption>{e.state === "calibrating" || e.state === "holding" ? stateWord : `Maintenance ${stateWord}`}</Caption>
      </div>
      <RowGroup>
        <Row label="Maintenance" value={e.kcal == null ? <span style={{ color: "#6f6f76" }}>–</span> : `${maintenance} kcal`} sub={e.kcal == null ? "Log food and weigh-ins on the same days to estimate it" : e.state === "holding" ? "Holding until 3 complete days in a row" : undefined} />
        <Row
          label="Target"
          value={t ? `${t.kcal.toLocaleString("en-GB")} kcal` : <span style={{ color: "#6f6f76" }}>–</span>}
          sub={t ? `P ${t.proteinG} · F ${t.fatG} · C ${t.carbsG} g` : "Set a goal to get targets"}
        />
        <Row label="Last 14 days" value={a.onTarget == null ? <span style={{ color: "#6f6f76" }}>–</span> : a.onTarget ? "On target" : "Off target"} sub={adherenceLine} />
      </RowGroup>
    </section>
  );
}
