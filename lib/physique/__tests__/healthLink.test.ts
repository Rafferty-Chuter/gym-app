// @vitest-environment happy-dom
import { beforeEach, describe, expect, it } from "vitest";
import { mergeSamples } from "@/lib/physique/io/healthLink";
import { sleepNightsRepo, weighInsRepo } from "@/lib/physique/io/repos";
import { nightsByDate } from "@/lib/physique/sleep";

const at = "2026-10-15T08:00:00.000Z";

describe("mergeSamples", () => {
  beforeEach(async () => {
    await sleepNightsRepo.clear();
    await weighInsRepo.clear();
  });

  it("makes one healthkit night per wake date with HRV and RHR attached, and one weigh-in per day", async () => {
    const r = await mergeSamples([
      { metric: "sleep", day: "2026-10-15", value: { asleepMin: 426, inBedMin: 456, bedtime: "23:10", wakeTime: "07:05", stages: { coreMin: 240, deepMin: 70, remMin: 95, awakeMin: 21 } }, source: "Apple Watch", received_at: at },
      { metric: "hrv", day: "2026-10-15", value: { value: 48.3, at: "2026-10-15T03:10:00" }, source: null, received_at: at },
      { metric: "rhr", day: "2026-10-15", value: { value: 52, at: "2026-10-15T00:00:00" }, source: null, received_at: at },
      { metric: "hrv", day: "2026-10-14", value: { value: 50, at: "2026-10-14T03:10:00" }, source: null, received_at: at },
      { metric: "weight", day: "2026-10-15", value: { value: 82.4, at: "2026-10-15T07:02:00" }, source: "Withings", received_at: at },
      { metric: "bodyFat", day: "2026-10-15", value: { value: 15.2, at: "2026-10-15T07:02:00" }, source: "Withings", received_at: at },
    ]);
    expect(r).toEqual({ nights: 1, weighIns: 1 });
    const nights = sleepNightsRepo.snapshot();
    expect(nights).toHaveLength(1);
    expect(nights[0]).toMatchObject({ id: "hk-2026-10-15", date: "2026-10-15", source: "healthkit", asleepMin: 426, inBedMin: 456, bedtime: "23:10", wakeTime: "07:05", hrvMs: 48.3, hrvMethod: "sdnn", restingHr: 52, stages: { coreMin: 240, deepMin: 70, remMin: 95, awakeMin: 21 } });
    const w = weighInsRepo.snapshot();
    expect(w).toHaveLength(1);
    expect(w[0]).toMatchObject({ id: "hk-w-2026-10-15", kg: 82.4, bodyFatPct: 15.2, source: "healthkit", loggedAt: "2026-10-15T07:02:00Z" });
  });

  it("replays are idempotent and HealthKit outranks a manual night on the same date", async () => {
    await sleepNightsRepo.upsert({ id: "m1", date: "2026-10-15", loggedAt: "2026-10-15T07:30:00Z", source: "manual", schemaVersion: 1, asleepMin: 400 });
    const row = { metric: "sleep", day: "2026-10-15", value: { asleepMin: 426, stages: {} }, source: null, received_at: at };
    await mergeSamples([row]);
    await mergeSamples([{ ...row, value: { asleepMin: 430, stages: {} } }]);
    const all = sleepNightsRepo.snapshot();
    expect(all).toHaveLength(2);
    expect(nightsByDate(all).get("2026-10-15")?.night.asleepMin).toBe(430);
  });
});
