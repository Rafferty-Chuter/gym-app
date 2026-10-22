import { describe, expect, it } from "vitest";
import { LOCAL_REMINDER_DAYS, planLocalReminders, reminderId } from "@/lib/physique/localReminders";
import type { GapSummary } from "@/lib/physique/reminder";

// Thursday 22 Oct 2026; Monday is the 26th.
const TODAY = "2026-10-22";
const summary = (weight: string[] = [], food: string[] = []): GapSummary => ({
  logged: { weight, food, sleep: [] },
  first: { weight: weight[0] ?? null, food: food[0] ?? null, sleep: null },
});
const at = (h: number, m = 0) => h * 60 + m;

describe("planLocalReminders (TR11)", () => {
  it("holds a week of morning weigh-in reminders for someone who weighs in, with Monday's report instead", () => {
    const plan = planLocalReminders(summary(["2026-10-20", "2026-10-21"]), TODAY, at(7, 30), "09:00");
    expect(plan.map((p) => p.day)).toEqual(["2026-10-22", "2026-10-23", "2026-10-24", "2026-10-25", "2026-10-26", "2026-10-27", "2026-10-28"]);
    expect(plan).toHaveLength(LOCAL_REMINDER_DAYS);
    expect(plan[0]).toMatchObject({ id: 20261022, hhmm: "09:00", title: "Today", body: "No weigh-in yet.", url: "/body?date=2026-10-22" });
    expect(plan[4]).toMatchObject({ day: "2026-10-26", title: "Weekly report · 19 to 25 Oct", url: "/report?week=2026-10-19" });
  });

  it("drops today once today is logged, and today once its time has passed", () => {
    const logged = planLocalReminders(summary(["2026-10-21", "2026-10-22"]), TODAY, at(7), "09:00");
    expect(logged[0].day).toBe("2026-10-23");
    const late = planLocalReminders(summary(["2026-10-21"]), TODAY, at(9), "09:00");
    expect(late[0].day).toBe("2026-10-23");
  });

  it("follows a habit only: without one, only the Monday report", () => {
    const plan = planLocalReminders(summary(), TODAY, at(7), "09:00");
    expect(plan.map((p) => p.day)).toEqual(["2026-10-26"]);
  });

  it("stops asking once the habit is more than a week old", () => {
    // Last weigh-in on the 16th: days up to the 23rd still see it in the week before.
    const plan = planLocalReminders(summary(["2026-10-16"]), TODAY, at(7), "09:00");
    expect(plan.map((p) => p.day)).toEqual(["2026-10-22", "2026-10-23", "2026-10-26"]);
  });

  it("asks about food from noon, opening the food log", () => {
    const plan = planLocalReminders(summary([], ["2026-10-21"]), TODAY, at(12), "19:00");
    expect(plan[0]).toMatchObject({ day: "2026-10-22", body: "Nothing logged yet.", url: "/food", hhmm: "19:00" });
  });

  it("plans nothing for an unusable time, and ids are one per day", () => {
    expect(planLocalReminders(summary(["2026-10-21"]), TODAY, at(7), "9am")).toEqual([]);
    expect(reminderId("2026-01-05")).toBe(20260105);
    const ids = planLocalReminders(summary(["2026-10-21"]), TODAY, at(7), "09:00").map((p) => p.id);
    expect(new Set(ids).size).toBe(ids.length);
  });
});
