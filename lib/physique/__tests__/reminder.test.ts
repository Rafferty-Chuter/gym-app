import { describe, expect, it } from "vitest";
import { addDays } from "@/lib/dates";
import { gapWindow } from "@/lib/physique/gaps";
import { REMINDER_HABIT_DAYS, REMINDER_WINDOW_MIN, buildGapSummary, dueNow, isReportDay, localClock, reminderMessage, shortRange, summaryKey, todayMissing, withLoggedDays } from "@/lib/physique/reminder";
import type { DayFlags, FoodEntry, SleepNight, WeighIn } from "@/lib/physique/types";

const today = "2026-10-16"; // Friday
const base = (date: string) => ({ date, loggedAt: `${date}T08:00:00.000Z`, source: "manual" as const, schemaVersion: 1 as const });
const food = (date: string): FoodEntry => ({ ...base(date), id: `f-${date}`, label: "Oats", kcal: 400, proteinG: 15, carbsG: 60, fatG: 8, method: "quick" });
const weigh = (date: string): WeighIn => ({ ...base(date), id: `w-${date}`, kg: 82 });
const night = (date: string): SleepNight => ({ ...base(date), id: `n-${date}`, asleepMin: 420 });

describe("reminder", () => {
  it("summarises logged days and the first record of each kind", () => {
    const foodEntries = [food("2026-09-01"), ...gapWindow(today).filter((d) => d !== "2026-10-15" && d !== "2026-10-13").map(food), food(today)];
    const dayFlags: Record<string, DayFlags> = { "2026-10-13": { date: "2026-10-13", status: "fasting" } };
    const weighIns = [weigh("2026-10-14"), weigh("2026-10-16")];
    const sleepNights = [night("2026-09-20")];
    const inputs = { foodEntries, dayFlags, weighIns, sleepNights };
    const summary = buildGapSummary(inputs, today);
    expect(summary.first).toEqual({ food: "2026-09-01", weight: "2026-10-14", sleep: "2026-09-20" });
    expect(summary.logged.food).toContain("2026-10-13"); // fasting counts as logged
    expect(summary.logged.food).not.toContain("2026-10-15");
    expect(summary.logged.weight).toEqual(["2026-10-14", today]);
    expect(summaryKey(summary)).toBe(summaryKey(buildGapSummary(inputs, today)));
  });

  it("merges days the server knows from Apple Health", () => {
    const s = buildGapSummary({ foodEntries: [], dayFlags: {}, weighIns: [weigh("2026-10-14")], sleepNights: [] }, today);
    expect(todayMissing(s, today, "08:00")).toBe("weight");
    const merged = withLoggedDays(s, { weight: [today], sleep: ["2026-10-15"] });
    expect(merged.first.sleep).toBe("2026-10-15");
    expect(todayMissing(merged, today, "08:00")).toBeNull();
  });

  it("asks about today only: the weigh-in in the morning, food from noon, for habits the user has", () => {
    const s = buildGapSummary({ foodEntries: [food("2026-10-15")], dayFlags: {}, weighIns: [weigh("2026-10-14")], sleepNights: [] }, today);
    expect(todayMissing(s, today, "09:00")).toBe("weight");
    expect(todayMissing(s, today, "11:45")).toBe("weight");
    expect(todayMissing(s, today, "12:00")).toBe("food");
    expect(todayMissing(s, today, "20:30")).toBe("food");
    expect(todayMissing(s, today, "nope")).toBeNull();
    // Logged today: quiet.
    const done = buildGapSummary({ foodEntries: [food(today)], dayFlags: {}, weighIns: [weigh(today)], sleepNights: [] }, today);
    expect(todayMissing(done, today, "09:00")).toBeNull();
    expect(todayMissing(done, today, "20:00")).toBeNull();
    // A habit that lapsed before the window, or never started, is not asked about.
    const lapsed = buildGapSummary({ foodEntries: [food(addDays(today, -(REMINDER_HABIT_DAYS + 1)))], dayFlags: {}, weighIns: [], sleepNights: [] }, today);
    expect(todayMissing(lapsed, today, "09:00")).toBeNull();
    expect(todayMissing(lapsed, today, "20:00")).toBeNull();
    const edge = buildGapSummary({ foodEntries: [food(addDays(today, -REMINDER_HABIT_DAYS))], dayFlags: {}, weighIns: [], sleepNights: [] }, today);
    expect(todayMissing(edge, today, "20:00")).toBe("food");
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

  it("writes one plain line about today, or nothing", () => {
    expect(reminderMessage(null, today)).toBeNull();
    expect(reminderMessage("weight", today)).toEqual({ title: "Today", body: "No weigh-in yet.", url: `/body?date=${today}` });
    expect(reminderMessage("food", today)).toEqual({ title: "Today", body: "Nothing logged yet.", url: "/food" });
  });

  it("on Monday sends the week report whatever today holds", () => {
    const monday = "2026-10-19";
    expect(isReportDay(monday)).toBe(true);
    expect(isReportDay(today)).toBe(false);
    expect(shortRange("2026-10-12", "2026-10-18")).toBe("12 to 18 Oct");
    expect(shortRange("2026-09-28", "2026-10-04")).toBe("28 Sep to 4 Oct");
    const report = { title: "Weekly report · 12 to 18 Oct", body: "Where you're heading, what to fix and next week's targets.", url: "/report?week=2026-10-12" };
    expect(reminderMessage(null, monday, { weekly: true })).toEqual(report);
    expect(reminderMessage("weight", monday, { weekly: true })).toEqual(report);
  });
});
