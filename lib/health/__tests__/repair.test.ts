import { describe, expect, it } from "vitest";
import { repairTwelveHourNight } from "@/lib/health/repair";
import type { SleepNight } from "@/lib/physique/types";

const night = (over: Partial<SleepNight>): SleepNight => ({ id: "hk-2026-10-18", date: "2026-10-18", loggedAt: "2026-10-18T09:00:00Z", source: "healthkit", schemaVersion: 1, asleepMin: 539, stages: { coreMin: 335, deepMin: 55, remMin: 149, awakeMin: 10 }, ...over });

describe("repair of nights read before 12-hour times were understood (S10)", () => {
  it("moves an evening bedtime read as morning to the evening, and rebuilds the wake from Apple's own minutes", () => {
    expect(repairTwelveHourNight(night({ bedtime: "11:53", wakeTime: "12:00" }))).toMatchObject({ bedtime: "23:53", wakeTime: "09:02" });
    expect(repairTwelveHourNight(night({ bedtime: "12:53", wakeTime: "12:00", asleepMin: 461, stages: { awakeMin: 24 } }))).toMatchObject({ bedtime: "00:53", wakeTime: "08:58" });
  });

  it("keeps a wake time that was read right and works the bedtime back from it", () => {
    expect(repairTwelveHourNight(night({ wakeTime: "10:08", asleepMin: 501, stages: { awakeMin: 15 } }))).toBeNull();
    const r = repairTwelveHourNight(night({ bedtime: "11:31", wakeTime: "10:08", asleepMin: 501, stages: { awakeMin: 15 } }));
    expect(r).toMatchObject({ bedtime: "23:31", wakeTime: "10:08" });
  });

  it("drops a midnight wake it cannot rebuild rather than keep a wrong one", () => {
    const r = repairTwelveHourNight(night({ wakeTime: "12:00" }))!;
    expect(r.wakeTime).toBeUndefined();
    expect(r.bedtime).toBeUndefined();
  });

  it("leaves correct nights, manual nights and nights with stage segments alone", () => {
    expect(repairTwelveHourNight(night({ bedtime: "23:40", wakeTime: "07:10" }))).toBeNull();
    expect(repairTwelveHourNight(night({ source: "manual", bedtime: "11:00", wakeTime: "12:00" }))).toBeNull();
    expect(repairTwelveHourNight(night({ bedtime: "11:53", wakeTime: "12:00", segments: [{ s: "core", o: 0, d: 60 }] }))).toBeNull();
  });
});
