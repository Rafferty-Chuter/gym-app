import { describe, expect, it } from "vitest";
import { parseHaePayload, splitLocalDate } from "@/lib/health/hae";

const payload = {
  data: {
    metrics: [
      { name: "weight_body_mass", units: "kg", data: [{ date: "2026-10-15 07:02:00 +0100", qty: 82.4, source: "Withings" }] },
      { name: "weight_&_body_mass", units: "lb", data: [{ date: "2026-10-16 07:05:00 +0100", qty: 180 }] },
      { name: "body_fat_percentage", units: "%", data: [{ date: "2026-10-15 07:02:00 +0100", qty: 0.152 }] },
      { name: "heart_rate_variability", units: "ms", data: [{ date: "2026-10-15 03:10:00 +0100", qty: 48.26 }] },
      { name: "resting_heart_rate", units: "count/min", data: [{ date: "2026-10-15 00:00:00 +0100", qty: 52 }] },
      {
        name: "sleep_analysis",
        units: "hr",
        data: [
          { date: "2026-10-15 00:00:00 +0100", totalSleep: 7.1, asleep: 0, core: 4.2, deep: 1.1, rem: 1.8, awake: 0.3, inBed: 7.6, sleepStart: "2026-10-14 23:10:00 +0100", sleepEnd: "2026-10-15 07:05:00 +0100", source: "Apple Watch" },
          { date: "2026-10-16 00:00:00 +0100", asleep: 6.5, inBed: 7.0, sleepStart: "2026-10-15 23:40:00 +0100", sleepEnd: "2026-10-16 06:50:00 +0100" },
          { date: "2026-10-17 00:00:00 +0100", core: 3.0, deep: 1.0, rem: 1.5, sleepEnd: "2026-10-17 06:30:00 +0100" },
          { date: "bad" },
        ],
      },
      { name: "step_count", units: "count", data: [{ date: "2026-10-15 00:00:00 +0100", qty: 8421.0 }] },
      { name: "something_else", units: "x", data: [{ date: "2026-10-15 00:00:00 +0100", qty: 1 }] },
    ],
  },
};

describe("parseHaePayload", () => {
  it("reads local days and clocks straight off the export dates", () => {
    expect(splitLocalDate("2026-10-15 07:02:00 +0100")).toEqual({ day: "2026-10-15", clock: "07:02" });
    expect(splitLocalDate("nope")).toBeNull();
  });

  it("maps both body-mass names, converts lb, and reads fractions as percent", () => {
    const s = parseHaePayload(payload);
    const weights = s.filter((x) => x.kind === "weight");
    expect(weights.map((w) => (w.kind === "weight" ? w.value : 0))).toEqual([82.4, 81.65]);
    const bf = s.find((x) => x.kind === "bodyFat");
    expect(bf && bf.kind === "bodyFat" ? bf.value : null).toBe(15.2);
    const hrv = s.find((x) => x.kind === "hrv");
    expect(hrv && hrv.kind === "hrv" ? hrv.value : null).toBe(48.3);
    const rhr = s.find((x) => x.kind === "rhr");
    expect(rhr && rhr.kind === "rhr" ? [rhr.value, rhr.day, rhr.at] : null).toEqual([52, "2026-10-15", "2026-10-15T00:00:00"]);
  });

  it("builds nights from totalSleep, asleep, or the stages, keyed on the wake date", () => {
    const nights = parseHaePayload(payload).filter((x) => x.kind === "sleep");
    expect(nights).toHaveLength(3);
    expect(nights[0]).toMatchObject({ day: "2026-10-15", asleepMin: 426, inBedMin: 456, bedtime: "23:10", wakeTime: "07:05", source: "Apple Watch" });
    expect(nights[0].kind === "sleep" ? nights[0].stages : null).toEqual({ coreMin: 252, deepMin: 66, remMin: 108, awakeMin: 18 });
    expect(nights[1]).toMatchObject({ day: "2026-10-16", asleepMin: 390, bedtime: "23:40", wakeTime: "06:50" });
    expect(nights[2]).toMatchObject({ day: "2026-10-17", asleepMin: 330, bedtime: null, wakeTime: "06:30" });
  });

  it("skips unknown metrics and empty payloads", () => {
    expect(parseHaePayload(payload).some((x) => x.kind === "steps")).toBe(true);
    expect(parseHaePayload({})).toEqual([]);
    expect(parseHaePayload(null)).toEqual([]);
    expect(parseHaePayload({ data: { metrics: [{ name: "resting_heart_rate", data: [{ date: "2026-10-15 00:00:00 +0100", qty: 400 }] }] } })).toEqual([]);
  });
});
