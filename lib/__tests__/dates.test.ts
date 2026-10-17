import { describe, expect, it } from "vitest";
import { addDays, dateRange, dayDiff, isWeekday, localDateKey, weekday } from "@/lib/dates";

describe("dates", () => {
  it("localDateKey respects the timezone (BST midnight is still 'today')", () => {
    const d = new Date("2026-06-15T23:30:00Z"); // 00:30 on the 16th in London
    expect(localDateKey(d, "Europe/London")).toBe("2026-06-16");
    expect(localDateKey(d, "UTC")).toBe("2026-06-15");
  });

  it("addDays / dayDiff cross month and DST boundaries", () => {
    expect(addDays("2026-02-28", 1)).toBe("2026-03-01");
    expect(addDays("2026-03-29", 1)).toBe("2026-03-30");
    expect(dayDiff("2026-03-01", "2026-03-29")).toBe(28);
    expect(dayDiff("2026-10-16", "2026-10-02")).toBe(-14);
  });

  it("dateRange is inclusive and empty when reversed", () => {
    expect(dateRange("2026-10-14", "2026-10-16")).toEqual(["2026-10-14", "2026-10-15", "2026-10-16"]);
    expect(dateRange("2026-10-16", "2026-10-14")).toEqual([]);
  });

  it("weekday", () => {
    expect(weekday("2026-10-16")).toBe(5); // Friday
    expect(isWeekday("2026-10-17")).toBe(false); // Saturday
    expect(isWeekday("2026-10-19")).toBe(true); // Monday
  });
});
