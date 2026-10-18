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

  it("reads a phone set to 12-hour time, with the narrow space iOS puts before AM and PM (S10)", () => {
    expect(splitLocalDate("2026-10-18 9:30:00 AM +0100")).toEqual({ day: "2026-10-18", clock: "09:30" });
    expect(splitLocalDate("2026-10-17 11:53:00\u202fPM +0100")).toEqual({ day: "2026-10-17", clock: "23:53" });
    expect(splitLocalDate("2026-10-18 12:00:00 AM +0100")).toEqual({ day: "2026-10-18", clock: "00:00" });
    expect(splitLocalDate("2026-10-18 12:30:00 pm +0100")).toEqual({ day: "2026-10-18", clock: "12:30" });
    expect(splitLocalDate("2026-10-18 1:05:00 AM +0100")).toEqual({ day: "2026-10-18", clock: "01:05" });
    expect(splitLocalDate("2026-10-18T07:05:00+01:00")).toEqual({ day: "2026-10-18", clock: "07:05" });
    expect(splitLocalDate("2026-10-18 13:05:00 PM +0100")).toBeNull();
    expect(splitLocalDate("2026-10-18 25:05:00 +0100")).toBeNull();
  });

  it("takes bedtime and wake from a 12-hour aggregated night, and never the row's midnight as the wake time", () => {
    const night = (row: Record<string, unknown>) => parseHaePayload({ data: { metrics: [{ name: "sleep_analysis", units: "hr", data: [row] }] } })[0];
    const s = night({ date: "2026-10-18 12:00:00 AM +0100", totalSleep: 7.6, core: 4.7, deep: 1.1, rem: 1.8, awake: 0.3, sleepStart: "2026-10-18 1:42:00 AM +0100", sleepEnd: "2026-10-18 9:34:00 AM +0100", source: "Apple Watch" });
    expect(s).toMatchObject({ kind: "sleep", day: "2026-10-18", bedtime: "01:42", wakeTime: "09:34" });
    const late = night({ date: "2026-10-17 12:00:00 AM +0100", totalSleep: 7.4, sleepStart: "2026-10-16 11:53:00 PM +0100", sleepEnd: "2026-10-17 7:30:00 AM +0100" });
    expect(late).toMatchObject({ day: "2026-10-17", bedtime: "23:53", wakeTime: "07:30" });
    const noEnd = night({ date: "2026-10-16 12:00:00 AM +0100", totalSleep: 7 });
    expect(noEnd).toMatchObject({ day: "2026-10-16", wakeTime: null });
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

describe("unaggregated sleep (S8)", () => {
  const seg = (start: string, end: string, value: string) => ({ startDate: `2026-10-${start} +0100`, endDate: `2026-10-${end} +0100`, qty: 0, value, source: "Apple Watch" });
  const unagg = {
    data: {
      metrics: [
        {
          name: "sleep_analysis",
          units: "hr",
          data: [
            seg("17 22:50:00", "18 07:20:00", "In Bed"),
            seg("17 23:00:00", "18 00:30:00", "Core"),
            seg("18 00:30:00", "18 01:30:00", "Deep"),
            seg("18 01:30:00", "18 01:40:00", "Awake"),
            seg("18 01:40:00", "18 03:00:00", "Core"),
            seg("18 03:00:00", "18 04:00:00", "REM"),
            seg("18 04:05:00", "18 07:00:00", "Core"),
            // A nap in the afternoon is not the night.
            seg("18 14:30:00", "18 15:00:00", "Core"),
          ],
        },
      ],
    },
  };

  it("folds stage segments into one night with totals, times and the segments", () => {
    const nights = parseHaePayload(unagg).filter((s) => s.kind === "sleep");
    expect(nights).toHaveLength(1);
    const n = nights[0];
    if (n.kind !== "sleep") throw new Error("not sleep");
    expect(n.day).toBe("2026-10-18");
    expect(n.bedtime).toBe("23:00");
    expect(n.wakeTime).toBe("07:00");
    expect(n.stages).toEqual({ coreMin: 345, deepMin: 60, remMin: 60, awakeMin: 10 });
    expect(n.asleepMin).toBe(465);
    expect(n.inBedMin).toBe(510);
    expect(n.segments?.[0]).toEqual({ s: "core", o: 0, d: 90 });
    expect(n.segments?.find((x) => x.s === "awake")).toEqual({ s: "awake", o: 150, d: 10 });
    expect(n.segments?.at(-1)).toEqual({ s: "core", o: 305, d: 175 });
  });

  it("aggregated nights carry no segments", () => {
    const n = parseHaePayload(payload).find((s) => s.kind === "sleep");
    expect(n && n.kind === "sleep" ? n.segments : "x").toBeUndefined();
  });
});
