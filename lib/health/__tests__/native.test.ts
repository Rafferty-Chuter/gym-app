import { describe, expect, it } from "vitest";
import { localStamp, nativeSamples, nativeSleep, toMergeRows, type NativeSample } from "@/lib/health/native";

const TZ = "Europe/London";
const seg = (start: string, end: string, sleepState: string, source = "Watch", sourceId = "com.apple.health.watch"): NativeSample => ({ value: 0, startDate: start, endDate: end, sleepState, sourceName: source, sourceId });

// One made-up night in British Summer Time (UTC+1): asleep 23:30 to 06:40 local.
const watchNight: NativeSample[] = [
  seg("2026-10-18T22:30:00Z", "2026-10-19T00:10:00Z", "light"),
  seg("2026-10-19T00:10:00Z", "2026-10-19T01:20:00Z", "deep"),
  seg("2026-10-19T01:20:00Z", "2026-10-19T01:30:00Z", "awake"),
  seg("2026-10-19T01:30:00Z", "2026-10-19T03:30:00Z", "light"),
  seg("2026-10-19T03:30:00Z", "2026-10-19T05:40:00Z", "rem"),
];

describe("Apple Health read on the iPhone (B11)", () => {
  it("reads instants on the phone's local clock", () => {
    expect(localStamp("2026-10-18T23:30:00.000Z", TZ)).toEqual({ day: "2026-10-19", clock: "00:30" });
    expect(localStamp("2026-12-01T07:05:00Z", TZ)).toEqual({ day: "2026-12-01", clock: "07:05" });
    expect(localStamp("not a date", TZ)).toBeNull();
  });

  it("folds a watch's stage segments into one night on its wake day", () => {
    const [night] = nativeSleep(watchNight, TZ);
    expect(night).toMatchObject({ day: "2026-10-19", bedtime: "23:30", wakeTime: "06:40", asleepMin: 420, stages: { coreMin: 220, deepMin: 70, remMin: 130, awakeMin: 10 } });
    expect(night.segments?.[0]).toEqual({ s: "core", o: 0, d: 100 });
  });

  it("keeps one source a night: the watch's staged night over an app's longer unstaged one", () => {
    const app = [seg("2026-10-18T22:00:00Z", "2026-10-19T06:00:00Z", "asleep", "Some sleep app", "com.example.sleep")];
    const phone = [seg("2026-10-18T21:45:00Z", "2026-10-19T06:15:00Z", "inBed", "iPhone", "com.apple.health.phone")];
    const nights = nativeSleep([...app, ...phone, ...watchNight], TZ);
    expect(nights).toHaveLength(1);
    expect(nights[0]).toMatchObject({ asleepMin: 420, source: "Watch" });
    // Without a watch, the longest night stands.
    expect(nativeSleep([...app, ...phone], TZ)).toMatchObject([{ asleepMin: 480, source: "Some sleep app" }]);
  });

  it("takes the morning weight and body fat, the day's mean HRV and the latest resting HR", () => {
    const at = (iso: string, value: number, sourceName = "Scale"): NativeSample => ({ value, startDate: iso, endDate: iso, sourceName });
    const samples = nativeSamples(
      {
        sleep: watchNight,
        weight: [at("2026-10-19T06:05:00Z", 84.62), at("2026-10-19T18:00:00Z", 85.9)],
        bodyFat: [at("2026-10-19T06:05:00Z", 0.182)],
        hrv: [at("2026-10-19T01:00:00Z", 40, "Watch"), at("2026-10-19T03:00:00Z", 50, "Watch")],
        rhr: [at("2026-10-19T08:00:00Z", 55, "Watch"), at("2026-10-19T20:00:00Z", 52, "Watch")],
        steps: [{ startDate: "2026-10-18T23:00:00Z", value: 9876.4 }],
      },
      TZ
    );
    const of = (kind: string) => samples.filter((s) => s.kind === kind);
    expect(of("weight")).toEqual([{ kind: "weight", day: "2026-10-19", value: 84.62, at: "2026-10-19T07:05:00", source: "Scale" }]);
    expect(of("bodyFat")[0]).toMatchObject({ value: 18.2 });
    expect(of("hrv")[0]).toMatchObject({ day: "2026-10-19", value: 45 });
    expect(of("rhr")[0]).toMatchObject({ value: 52 });
    expect(of("steps")[0]).toMatchObject({ day: "2026-10-19", value: 9876 });
    expect(of("sleep")).toHaveLength(1);
  });

  it("drops days before the window, whose night was cut short", () => {
    const read = { sleep: watchNight, weight: [], bodyFat: [], hrv: [], rhr: [], steps: [] };
    expect(nativeSamples(read, TZ, "2026-10-19")).toHaveLength(1);
    expect(nativeSamples(read, TZ, "2026-10-20")).toEqual([]);
  });

  it("drops readings that can't be real", () => {
    const at = (value: number): NativeSample => ({ value, startDate: "2026-10-19T06:00:00Z", endDate: "2026-10-19T06:00:00Z" });
    const s = nativeSamples({ sleep: [], weight: [at(0)], bodyFat: [at(95)], hrv: [at(-3)], rhr: [at(12)], steps: [{ startDate: "x", value: 100 }] }, TZ);
    expect(s).toEqual([]);
  });

  it("produces the rows the existing merge reads, as the server stores them", () => {
    const rows = toMergeRows(nativeSleep(watchNight, TZ), "2026-10-19T09:00:00.000Z");
    expect(rows[0]).toMatchObject({ metric: "sleep", day: "2026-10-19", received_at: "2026-10-19T09:00:00.000Z", value: { asleepMin: 420, bedtime: "23:30", wakeTime: "06:40" } });
    expect((rows[0].value as { segments?: unknown[] }).segments?.length).toBeGreaterThan(0);
  });
});
