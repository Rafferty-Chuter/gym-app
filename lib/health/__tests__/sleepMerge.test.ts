import { describe, expect, it } from "vitest";
import { SPLIT_MAX_GAP_MIN, mergeNight, nightSpan, type StoredNight } from "@/lib/health/sleepMerge";

const night = (bedtime: string | null, wakeTime: string | null, asleepMin: number, stages: Partial<StoredNight["stages"]> = {}, extra: Partial<StoredNight> = {}): StoredNight => ({
  asleepMin,
  inBedMin: null,
  bedtime,
  wakeTime,
  stages: { coreMin: null, deepMin: null, remMin: null, awakeMin: null, ...stages },
  ...extra,
});

// One made-up night, cut by an upload at 03:50.
const firstHalf = night("01:30", "03:50", 125, { coreMin: 70, deepMin: 45, remMin: 10, awakeMin: 5 });
const secondHalf = night("03:50", "09:30", 330, { coreMin: 220, deepMin: 20, remMin: 90, awakeMin: 12 });
const whole = night("01:30", "09:30", 455, { coreMin: 290, deepMin: 65, remMin: 100, awakeMin: 17 });

describe("one night from several uploads (S11)", () => {
  it("adds up two halves of a night cut by an upload, in either order", () => {
    const merged = mergeNight(firstHalf, secondHalf);
    expect(merged).toMatchObject({ asleepMin: 455, bedtime: "01:30", wakeTime: "09:30", stages: { coreMin: 290, deepMin: 65, remMin: 100, awakeMin: 17 } });
    expect(mergeNight(secondHalf, firstHalf)).toEqual(merged);
  });

  it("never lets a half sent again replace the whole night", () => {
    const merged = mergeNight(firstHalf, secondHalf);
    expect(mergeNight(merged, secondHalf)).toEqual(merged);
    expect(mergeNight(merged, firstHalf)).toEqual(merged);
    expect(mergeNight(whole, secondHalf)).toEqual(whole);
  });

  it("lets a fuller or corrected night replace a partial one", () => {
    expect(mergeNight(secondHalf, whole)).toEqual(whole);
    // A night first stored with misread times (S10) is replaced by the same night read right.
    const misread = night("12:11", "12:00", 455);
    expect(mergeNight(misread, whole)).toEqual(whole);
  });

  it("keeps the night, not a nap or a separate sleep hours away", () => {
    const nap = night("15:00", "15:40", 35);
    expect(mergeNight(whole, nap)).toEqual(whole);
    expect(mergeNight(nap, whole)).toEqual(whole);
    const afterGap = night("09:30", "10:00", 25);
    const later = night(`${String(9 + Math.ceil((SPLIT_MAX_GAP_MIN + 30) / 60)).padStart(2, "0")}:30`, "13:30", 60);
    expect(mergeNight(whole, afterGap).asleepMin).toBe(480); // adjacent: one night that went on
    expect(mergeNight(whole, later)).toEqual(whole);
  });

  it("takes the longer night when either has no times", () => {
    expect(mergeNight(night(null, null, 300), night(null, null, 420)).asleepMin).toBe(420);
    expect(mergeNight(night(null, null, 420), night("01:00", "06:00", 290)).asleepMin).toBe(420);
    expect(mergeNight(null, secondHalf)).toEqual(secondHalf);
  });

  it("lays stage segments end to end, and drops them when only one half has them", () => {
    const a = { ...firstHalf, segments: [{ s: "deep" as const, o: 0, d: 45 }, { s: "core" as const, o: 45, d: 95 }] };
    const b = { ...secondHalf, segments: [{ s: "core" as const, o: 0, d: 200 }, { s: "rem" as const, o: 200, d: 140 }] };
    const merged = mergeNight(a, b);
    expect(merged.segments).toEqual([{ s: "deep", o: 0, d: 45 }, { s: "core", o: 45, d: 95 }, { s: "core", o: 140, d: 200 }, { s: "rem", o: 340, d: 140 }]);
    expect(mergeNight(a, secondHalf).segments).toBeUndefined();
  });

  it("reads a bedtime after the wake time as the evening before", () => {
    expect(nightSpan(night("23:30", "07:00", 400))).toEqual({ start: -30, end: 420 });
    expect(nightSpan(night(null, "07:00", 400))).toBeNull();
  });
});
