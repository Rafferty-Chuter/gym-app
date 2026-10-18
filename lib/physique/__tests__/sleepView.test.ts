import { describe, expect, it } from "vitest";
import { addDays, type LocalDate } from "@/lib/dates";
import { trendBars, bedTime, efficiencyOf } from "@/lib/physique/sleepView";
import type { SleepNight } from "@/lib/physique/types";

const TODAY = "2026-10-17";
const NOW = { today: TODAY, tz: "UTC" };

function mk(date: LocalDate, asleepH: number, extra: Partial<SleepNight> = {}): SleepNight {
  return { id: `n-${date}`, date, loggedAt: `${date}T07:10:00.000Z`, source: "manual", schemaVersion: 1, asleepMin: Math.round(asleepH * 60), ...extra };
}

/** `count` nights ending today, each `asleepH` long, with per-night extras. */
function run(count: number, asleepH: number, extra: (i: number) => Partial<SleepNight> = () => ({})): SleepNight[] {
  const out: SleepNight[] = [];
  for (let i = count - 1; i >= 0; i--) out.push(mk(addDays(TODAY, -i), asleepH, extra(count - 1 - i)));
  return out;
}

describe("trend bars", () => {
  it("gives 14 slots ending today with null for unlogged nights", () => {
    const bars = trendBars(run(3, 7.5), NOW);
    expect(bars).toHaveLength(14);
    expect(bars[13].date).toBe(TODAY);
    expect(bars[0].date).toBe(addDays(TODAY, -13));
    expect(bars.filter((b) => b.asleepH !== null)).toHaveLength(3);
    expect(bars[13].asleepH).toBeCloseTo(7.5, 6);
    expect(bars[10].asleepH).toBeNull();
  });
});

describe("bedTime and efficiencyOf (watch nights without an in-bed time)", () => {
  const base = { id: "n", date: "2026-10-17", loggedAt: "2026-10-17T07:00:00Z", source: "healthkit" as const, schemaVersion: 1 as const, asleepMin: 420 };
  it("a logged time in bed wins", () => {
    expect(bedTime({ ...base, inBedMin: 450, stages: { awakeMin: 20 } })).toEqual({ min: 450, kind: "in_bed" });
    expect(efficiencyOf({ ...base, inBedMin: 450 })).toBeCloseTo(420 / 450, 5);
  });
  it("without one, the sleep period is asleep plus the watch's awake minutes", () => {
    expect(bedTime({ ...base, inBedMin: 0, stages: { awakeMin: 21, deepMin: 60 } })).toEqual({ min: 441, kind: "period" });
    expect(efficiencyOf({ ...base, stages: { awakeMin: 21 } })).toBeCloseTo(420 / 441, 5);
  });
  it("then the span from bedtime to wake, across midnight", () => {
    expect(bedTime({ ...base, bedtime: "23:10", wakeTime: "07:00" })).toEqual({ min: 470, kind: "period" });
  });
  it("nothing to go on gives no efficiency", () => {
    expect(bedTime(base)).toBeNull();
    expect(efficiencyOf(base)).toBeNull();
  });
});
