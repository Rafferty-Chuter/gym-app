import { describe, expect, it } from "vitest";
import { addDays } from "@/lib/dates";
import { findGaps, gapWindow } from "@/lib/physique/gaps";
import { REMINDER_WINDOW_MIN, buildGapSummary, dueNow, gapsFromSummary, isReportDay, localClock, reminderMessage, shortRange, summaryKey, withLoggedDays } from "@/lib/physique/reminder";
import type { DayFlags, FoodEntry, SleepNight, WeighIn } from "@/lib/physique/types";

const today = "2026-10-16"; // Friday
const base = (date: string) => ({ date, loggedAt: `${date}T08:00:00.000Z`, source: "manual" as const, schemaVersion: 1 as const });
const food = (date: string): FoodEntry => ({ ...base(date), id: `f-${date}`, label: "Oats", kcal: 400, proteinG: 15, carbsG: 60, fatG: 8, method: "quick" });
const weigh = (date: string): WeighIn => ({ ...base(date), id: `w-${date}`, kg: 82 });
const night = (date: string): SleepNight => ({ ...base(date), id: `n-${date}`, asleepMin: 420 });

describe("reminder", () => {
  it("round-trips the summary into the same gaps as the records", () => {
    const foodEntries = [food("2026-09-01"), ...gapWindow(today).filter((d) => d !== "2026-10-15" && d !== "2026-10-13").map(food), food(today)];
    const dayFlags: Record<string, DayFlags> = { "2026-10-13": { date: "2026-10-13", status: "fasting" } };
    const weighIns = [weigh("2026-10-14"), weigh("2026-10-16")];
    const sleepNights = [night("2026-09-20")];
    const inputs = { foodEntries, dayFlags, weighIns, sleepNights };
    const summary = buildGapSummary(inputs, today);
    expect(summary.first).toEqual({ food: "2026-09-01", weight: "2026-10-14", sleep: "2026-09-20" });
    expect(summary.logged.food).toContain("2026-10-13"); // fasting counts as logged
    expect(summary.logged.food).not.toContain("2026-10-15");
    expect(gapsFromSummary(summary, today)).toEqual(findGaps(inputs, today));
    expect(summaryKey(summary)).toBe(summaryKey(buildGapSummary(inputs, today)));
  });

  it("merges days the server knows from Apple Health", () => {
    const s = buildGapSummary({ foodEntries: [], dayFlags: {}, weighIns: [], sleepNights: [] }, today);
    expect(gapsFromSummary(s, today)).toEqual([]);
    const merged = withLoggedDays(s, { sleep: ["2026-10-15", "2026-10-14"] });
    expect(merged.first.sleep).toBe("2026-10-14");
    expect(gapsFromSummary(merged, today)).toEqual([]);
    const gappy = withLoggedDays(s, { sleep: ["2026-10-15", "2026-10-13"] });
    expect(gapsFromSummary(gappy, today)).toEqual([{ kind: "sleep", date: "2026-10-14" }]);
  });

  it("reads the local clock in the device's time zone", () => {
    expect(localClock("2026-10-16T08:30:00.000Z", "Europe/London")).toEqual({ day: "2026-10-16", minutes: 9 * 60 + 30 });
    expect(localClock("2026-10-16T23:30:00.000Z", "Asia/Tokyo")).toEqual({ day: "2026-10-17", minutes: 8 * 60 + 30 });
    expect(localClock("2026-10-16T00:10:00.000Z", "UTC")).toEqual({ day: "2026-10-16", minutes: 10 });
    expect(localClock("nope", "UTC")).toBeNull();
    expect(localClock("2026-10-16T00:10:00.000Z", "Mars/Olympus")).toBeNull();
  });

  it("is due once a day inside the window after the chosen time", () => {
    const d = { tz: "Europe/London", reminderHHMM: "09:00", lastRunDay: null };
    expect(dueNow(d, "2026-10-16T07:30:00.000Z")).toEqual({ due: false, day: "2026-10-16" }); // 08:30 local
    expect(dueNow(d, "2026-10-16T08:05:00.000Z")).toEqual({ due: true, day: "2026-10-16" }); // 09:05
    expect(dueNow(d, `2026-10-16T${String(8 + Math.floor(REMINDER_WINDOW_MIN / 60)).padStart(2, "0")}:00:00.000Z`)).toEqual({ due: false, day: "2026-10-16" }); // window over
    expect(dueNow({ ...d, lastRunDay: "2026-10-16" }, "2026-10-16T08:05:00.000Z")).toEqual({ due: false, day: "2026-10-16" });
    expect(dueNow({ ...d, reminderHHMM: "25:00" }, "2026-10-16T08:05:00.000Z")).toEqual({ due: false, day: null });
  });

  it("writes the notification from the gap sentences, or nothing", () => {
    expect(reminderMessage([], today)).toBeNull();
    const gaps = findGaps({ foodEntries: [food("2026-10-01"), food("2026-10-14"), food(today)], dayFlags: {}, weighIns: [weigh("2026-10-14"), weigh(today)], sleepNights: [] }, today);
    const m = reminderMessage(gaps, today);
    expect(m?.title).toBe("Not logged");
    expect(m?.body).toBe("Yesterday has no food logged\nYesterday has no weigh-in\nTuesday has no food logged\n4 more");
    expect(m?.url).toBe(`/food?date=${addDays(today, -1)}`);
  });

  it("on Monday sends the week report whatever the gaps", () => {
    const monday = "2026-10-19";
    expect(isReportDay(monday)).toBe(true);
    expect(isReportDay(today)).toBe(false);
    expect(shortRange("2026-10-12", "2026-10-18")).toBe("12 to 18 Oct");
    expect(shortRange("2026-09-28", "2026-10-04")).toBe("28 Sep to 4 Oct");
    const quiet = reminderMessage([], monday, { weekly: true });
    expect(quiet).toEqual({ title: "Week report · 12 to 18 Oct", body: "Nothing missing", url: "/report?week=2026-10-12" });
    const gaps = findGaps({ foodEntries: [food("2026-10-01"), food("2026-10-17"), food(monday)], dayFlags: {}, weighIns: [], sleepNights: [] }, monday);
    const m = reminderMessage(gaps, monday, { weekly: true });
    expect(m?.body).toBe("6 gaps\nYesterday has no food logged\nFriday has no food logged\nThursday has no food logged\n3 more");
    expect(m?.url).toBe("/report?week=2026-10-12");
  });
});
