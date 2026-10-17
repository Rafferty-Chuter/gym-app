"use client";

import { useMemo, useState } from "react";
import { useUnit } from "@/lib/unit-preference";
import { useIsHydrated } from "@/lib/ui/useIsHydrated";
import { useNow } from "@/lib/ui/useToday";
import { addDays, type Now } from "@/lib/dates";
import { saveSleepNight, useBodyData, type SleepInput } from "@/lib/physique/io/bodyData";
import { usePhysiqueAnalysis } from "@/lib/physique/io/analysis";
import { formatHoursMin, sleepPrefill } from "@/lib/physique/dayTotals";
import PageHeader from "@/components/ui/PageHeader";
import SleepSheet from "@/components/physique/SleepSheet";
import { Caption } from "@/components/physique/ui";
import { longLocalDate } from "@/components/charts/TimeSeriesChart";
import { STATUS_HEX } from "@/lib/ui/status";

const WORD = { severe: "Very short", short: "Short", ok: "OK", unknown: "Not enough nights" } as const;

/** R1 placeholder for the Sleep tab: last night, the 14-night read and the nights list. R3 brings contributors and the planner. */
export default function SleepPage() {
  const hydrated = useIsHydrated();
  const now = useNow();
  const { unit } = useUnit();
  if (!hydrated || !now) return <main className="min-h-screen" style={{ background: "#0a0a0b" }} />;
  return <SleepContent now={now} unit={unit === "lb" ? "lb" : "kg"} />;
}

function SleepContent({ now, unit }: { now: Now; unit: "kg" | "lb" }) {
  const today = now.today;
  const data = useBodyData();
  const analysis = usePhysiqueAnalysis(now, unit);
  const [open, setOpen] = useState(false);
  const nights = useMemo(() => [...data.sleepNights].filter((n) => n.date <= today).sort((a, b) => (a.date < b.date ? 1 : -1)).slice(0, 14), [data.sleepNights, today]);
  const lastNight = nights.find((n) => n.date === today) ?? null;
  const s = analysis?.sleep ?? null;
  const color = s ? (s.status === "severe" ? STATUS_HEX.attention : s.status === "short" ? STATUS_HEX.watch : s.status === "ok" ? STATUS_HEX.good : "#6f6f76") : "#6f6f76";
  const nowIso = () => new Date().toISOString();

  return (
    <main className="min-h-screen pb-28" style={{ background: "#0a0a0b", color: "#f2f2f0" }}>
      <div className="mx-auto flex max-w-2xl flex-col gap-5 px-5 sm:px-6">
        <PageHeader caption={`Last night · ${longLocalDate(addDays(today, -1))} → ${longLocalDate(today)}`} title="Sleep" action={{ label: "Log sleep", onClick: () => setOpen(true) }} />

        <section className="rounded-[12px] p-4" style={{ background: "#141416" }} aria-label="Last night">
          <div className="flex items-end justify-between gap-3">
            <div className="flex flex-col">
              <span className="text-[34px] font-semibold leading-none tracking-[-0.02em]" style={{ color: lastNight ? "#f2f2f0" : "#6f6f76", fontVariantNumeric: "tabular-nums" }}>
                {lastNight ? formatHoursMin(lastNight.asleepMin) : "–"}
              </span>
              <span className="mt-1 text-[12px]" style={{ color: "#a3a3a8" }}>
                {lastNight ? `asleep${lastNight.bedtime && lastNight.wakeTime ? ` · ${lastNight.bedtime} → ${lastNight.wakeTime}` : ""}` : "Not logged yet"}
              </span>
            </div>
            {s && (
              <span className="text-[13px] font-semibold" style={{ color }}>
                {s.mean14h != null ? `${WORD[s.status]} · ${formatHoursMin(s.mean14h * 60)} avg` : WORD[s.status]}
              </span>
            )}
          </div>
          {s && s.mean14h != null && (
            <p className="mt-3 text-[13px]" style={{ color: "#a3a3a8", fontVariantNumeric: "tabular-nums" }}>
              {s.nightsLogged14} of 14 nights logged{s.debt7h != null && s.debt7h > 0.5 ? ` · ${s.debt7h.toFixed(1)} h behind this week` : ""}
            </p>
          )}
        </section>

        {nights.length > 0 ? (
          <section aria-label="Nights">
            <div className="mb-2">
              <Caption>Last 14 nights</Caption>
            </div>
            <ul className="divide-y divide-[#2a2a2e] overflow-hidden rounded-[12px]" style={{ background: "#141416" }}>
              {nights.map((n) => (
                <li key={n.id} className="flex items-center justify-between px-4 py-3">
                  <span className="flex flex-col">
                    <span className="text-[15px]" style={{ color: "#f2f2f0" }}>{longLocalDate(n.date)}</span>
                    <span className="text-[11px]" style={{ color: "#6f6f76" }}>{n.bedtime && n.wakeTime ? `${n.bedtime} → ${n.wakeTime}` : n.source}</span>
                  </span>
                  <span className="text-[17px] font-semibold" style={{ color: "#f2f2f0", fontVariantNumeric: "tabular-nums" }}>{formatHoursMin(n.asleepMin)}</span>
                </li>
              ))}
            </ul>
          </section>
        ) : (
          <p className="text-[13px]" style={{ color: "#a3a3a8" }}>
            Log last night with +. Ten of fourteen nights give a sleep read.
          </p>
        )}
      </div>
      <SleepSheet open={open} onClose={() => setOpen(false)} prefill={sleepPrefill(data.sleepNights)} existing={lastNight} dateLabel="today" onSave={(input: SleepInput) => saveSleepNight(today, input, nowIso())} />
    </main>
  );
}
