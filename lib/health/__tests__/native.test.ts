import { describe, expect, it } from "vitest";
import { localStamp, nativeSamples, nativeSleep, readChunks, toMergeRows, uniqueSamples, type NativeSample } from "@/lib/health/native";

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

  it("takes the morning weight and body fat, the night's mean HRV and the latest resting HR", () => {
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

  it("HRV is the night's readings, on the wake day, not the whole calendar day (IN1)", () => {
    const hrv = (iso: string, value: number): NativeSample => ({ value, startDate: iso, endDate: iso, sourceName: "Watch" });
    const of = (read: NativeSample[]) => nativeSamples({ sleep: watchNight, weight: [], bodyFat: [], hrv: read, rhr: [], steps: [] }, TZ).filter((s) => s.kind === "hrv");
    // Asleep 23:30 to 06:40 local (BST): 23:45 the evening before, 03:00, and 07:00 just after waking count; 15:00 does not.
    expect(of([hrv("2026-10-18T22:45:00Z", 40), hrv("2026-10-19T02:00:00Z", 50), hrv("2026-10-19T06:00:00Z", 60), hrv("2026-10-19T14:00:00Z", 90)])).toEqual([
      { kind: "hrv", day: "2026-10-19", value: 50, at: "2026-10-18T23:45:00", source: "Watch" },
    ]);
    // No night recorded for the 21st: from 21:00 the evening before to 09:00 stands in for it.
    expect(of([hrv("2026-10-20T21:30:00Z", 30), hrv("2026-10-21T03:00:00Z", 40), hrv("2026-10-21T10:00:00Z", 99)])).toEqual([
      { kind: "hrv", day: "2026-10-21", value: 35, at: "2026-10-20T22:30:00", source: "Watch" },
    ]);
    // Daytime readings alone are not an overnight HRV.
    expect(of([hrv("2026-10-22T12:00:00Z", 70), hrv("2026-10-22T16:00:00Z", 75)])).toEqual([]);
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

  it("reads a long window in chunks, oldest first, that meet end to end (IN1)", () => {
    const chunks = readChunks("2026-10-22T12:00:00.000Z", 366);
    expect(chunks).toHaveLength(7);
    expect(chunks[0].startDate).toBe("2025-10-21T12:00:00.000Z");
    expect(chunks.at(-1)?.endDate).toBe("2026-10-22T12:00:00.000Z");
    for (let i = 1; i < chunks.length; i++) expect(chunks[i].startDate).toBe(chunks[i - 1].endDate);
    expect(readChunks("2026-10-22T12:00:00.000Z", 15)).toEqual([{ startDate: "2026-10-07T12:00:00.000Z", endDate: "2026-10-22T12:00:00.000Z" }]);
  });

  it("keeps one copy of a sample read by two chunks, so a night across their edge is not counted twice", () => {
    const [a, b] = watchNight;
    expect(uniqueSamples([a, b, { ...a }, b])).toEqual([a, b]);
    // The same times from two sources are two samples.
    expect(uniqueSamples([a, { ...a, sourceId: "com.example.sleep" }])).toHaveLength(2);
  });
});
