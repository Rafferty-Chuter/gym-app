import { describe, expect, it } from "vitest";
import { addDays } from "@/lib/dates";
import { SLEEP_ADULT_MIN_H, SLEEP_USUAL_MIN_NIGHTS, nightsByDate, usualSleepH } from "@/lib/physique/sleep";
import { sleepAgainstUsual } from "@/lib/physique/weekScorecard";
import type { SleepNight } from "@/lib/physique/types";

const TODAY = "2026-10-21";
const night = (date: string, h: number) => ({ id: `n-${date}`, date, asleepMin: Math.round(h * 60), source: "manual", loggedAt: `${date}T08:00:00.000Z`, schemaVersion: 1 }) as SleepNight;

describe("Sleep against your own usual (C7)", () => {
  it("takes the usual as the median of the four weeks before, and none from under a week of nights", () => {
    const nights = Array.from({ length: 28 }, (_, k) => night(addDays(TODAY, -(k + 1)), k % 2 ? 6.5 : 7.5));
    // Tonight's short night is not part of the usual it is read against.
    const byDate = nightsByDate([...nights, night(TODAY, 4)]);
    expect(usualSleepH(byDate, TODAY)).toBe(7);
    const few = nightsByDate(nights.slice(0, SLEEP_USUAL_MIN_NIGHTS - 1));
    expect(usualSleepH(few, TODAY)).toBeNull();
  });

  it("words a week against the usual, never against a fixed 8 hours", () => {
    expect(sleepAgainstUsual(6.1, 6.2)).toEqual({ text: "About your usual", tone: "good" });
    expect(sleepAgainstUsual(6.0, 6.75)).toEqual({ text: "45 min under your usual", tone: "watch" });
    expect(sleepAgainstUsual(7.5, 7.0)).toEqual({ text: "30 min over your usual", tone: "good" });
    expect(sleepAgainstUsual(6.5, null).text).toBe(`30 min under ${SLEEP_ADULT_MIN_H} hours`);
    for (const [m, u] of [[6, 6.5], [7.9, 7.2], [5.5, null]] as const) expect(sleepAgainstUsual(m, u).text).not.toMatch(/8 hours/);
  });
});
