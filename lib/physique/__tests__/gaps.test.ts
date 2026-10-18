import { describe, expect, it } from "vitest";
import { addDays } from "@/lib/dates";
import { GAP_LOOKBACK_DAYS, findGaps, gapDayWord, gapLines, gapWindow } from "@/lib/physique/gaps";
import type { DayFlags, FoodEntry, SleepNight, WeighIn } from "@/lib/physique/types";

const today = "2026-10-16"; // a Friday
const base = (date: string) => ({ date, loggedAt: `${date}T08:00:00.000Z`, source: "manual" as const, schemaVersion: 1 as const });
const food = (date: string): FoodEntry => ({ ...base(date), id: `f-${date}`, label: "Oats", kcal: 400, proteinG: 15, carbsG: 60, fatG: 8, method: "quick" });
const weigh = (date: string): WeighIn => ({ ...base(date), id: `w-${date}`, kg: 82 });
const night = (date: string): SleepNight => ({ ...base(date), id: `n-${date}`, asleepMin: 420 });
const empty = { foodEntries: [], dayFlags: {}, weighIns: [], sleepNights: [] };

describe("gaps", () => {
  it("looks at the seven days before today and never at today", () => {
    const w = gapWindow(today);
    expect(w).toHaveLength(GAP_LOOKBACK_DAYS);
    expect(w[0]).toBe("2026-10-09");
    expect(w.at(-1)).toBe("2026-10-15");
  });

  it("is silent before the first record of a kind", () => {
    expect(findGaps(empty, today)).toEqual([]);
    // Weigh-ins started three days ago: gaps only from then on.
    const weighIns = [weigh(addDays(today, -3)), weigh(addDays(today, -1))];
    expect(findGaps({ ...empty, weighIns }, today)).toEqual([{ kind: "weight", date: addDays(today, -2) }]);
  });

  it("treats fasting days and edited totals as logged, and skips the day with entries", () => {
    const foodEntries = gapWindow(today)
      .filter((d) => d !== "2026-10-15" && d !== "2026-10-13" && d !== "2026-10-12")
      .map(food);
    const dayFlags: Record<string, DayFlags> = {
      "2026-10-13": { date: "2026-10-13", status: "fasting" },
      "2026-10-12": { date: "2026-10-12", kcalOverride: 2200 },
    };
    const gaps = findGaps({ ...empty, foodEntries, dayFlags }, today, ["food"]);
    expect(gaps).toEqual([{ kind: "food", date: "2026-10-15" }]);
    expect(gapLines(gaps, today)).toEqual([{ kind: "food", date: "2026-10-15", text: "Yesterday has no food logged", count: 1 }]);
  });

  it("orders newest first with food before weight before sleep, and names the days", () => {
    const foodEntries = [food("2026-10-01"), food("2026-10-15")];
    const weighIns = [weigh("2026-10-01"), weigh("2026-10-14"), weigh("2026-10-15")];
    const sleepNights = gapWindow(today).map(night);
    const gaps = findGaps({ ...empty, foodEntries, weighIns, sleepNights }, today);
    expect(gaps.slice(0, 3)).toEqual([
      { kind: "food", date: "2026-10-14" },
      { kind: "food", date: "2026-10-13" },
      { kind: "weight", date: "2026-10-13" },
    ]);
    expect(gaps.filter((g) => g.kind === "sleep")).toEqual([]);
    const lines = gapLines(gaps, today);
    expect(lines[0].text).toBe("Wednesday has no food logged");
    expect(lines[2].text).toBe("Tuesday has no weigh-in");
    expect(lines.at(-1)).toMatchObject({ kind: "weight", date: "2026-10-09", text: "Last Friday has no weigh-in" });
  });

  it("collapses a kind with nothing in the window into one line", () => {
    const sleepNights = [night("2026-09-20")];
    const gaps = findGaps({ ...empty, sleepNights }, today);
    expect(gaps).toHaveLength(GAP_LOOKBACK_DAYS);
    const lines = gapLines(gaps, today);
    expect(lines).toEqual([{ kind: "sleep", date: "2026-10-15", text: "No sleep logged in the last 7 days", count: 7 }]);
  });

  it("names days relative to today", () => {
    expect(gapDayWord("2026-10-15", today)).toBe("Yesterday");
    expect(gapDayWord("2026-10-11", today)).toBe("Sunday");
    expect(gapDayWord("2026-10-09", today)).toBe("Last Friday");
  });
});
