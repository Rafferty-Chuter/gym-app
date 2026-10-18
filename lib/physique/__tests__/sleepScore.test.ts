import { describe, expect, it } from "vitest";
import { addDays, type LocalDate } from "@/lib/dates";
import { bannedPhrasesIn } from "@/lib/physique/copy";
import { nightAxisMin, nightNeedH, nightScore, sleepTrends, tonightPlan, usualWake, wakeConsistency } from "@/lib/physique/sleepScore";
import type { SleepNight } from "@/lib/physique/types";

const TODAY = "2026-10-18";

function mk(date: LocalDate, asleepH: number, extra: Partial<SleepNight> = {}): SleepNight {
  return { id: `n-${date}`, date, loggedAt: `${date}T07:10:00.000Z`, source: "healthkit", schemaVersion: 1, asleepMin: Math.round(asleepH * 60), ...extra };
}

/** `count` nights ending `end`, oldest first; `extra(i)` with i = 0 for the oldest. */
function run(count: number, asleepH: number, extra: (i: number) => Partial<SleepNight> = () => ({}), end: LocalDate = TODAY): SleepNight[] {
  const out: SleepNight[] = [];
  for (let i = count - 1; i >= 0; i--) out.push(mk(addDays(end, -i), asleepH, extra(count - 1 - i)));
  return out;
}

describe("usual wake time", () => {
  it("is the median wake over the last 14 nights, and silent below 3 nights", () => {
    expect(usualWake(run(2, 8, () => ({ wakeTime: "07:00" })), TODAY)).toBeNull();
    const wakes = ["06:50", "07:00", "07:10", "09:30", "07:05"];
    const u = usualWake(run(5, 8, (i) => ({ wakeTime: wakes[i] })), TODAY);
    expect(u).toMatchObject({ hhmm: "07:05", nights: 5 });
  });

  it("puts a 23:30 bedtime before a 00:30 one on the night axis", () => {
    expect(nightAxisMin("23:30")!).toBeLessThan(nightAxisMin("00:30")!);
  });
});

describe("night score", () => {
  const steady = run(10, 8, () => ({ wakeTime: "07:00", bedtime: "22:40", stages: { awakeMin: 20 } }), addDays(TODAY, -1));

  it("is silent without a valid night", () => {
    expect(nightScore(steady, TODAY, 8)).toBeNull();
    expect(nightScore([...steady, mk(TODAY, 1)], TODAY, 8)).toBeNull();
  });

  it("a full night at the usual time scores high and says so", () => {
    const s = nightScore([...steady, mk(TODAY, 8.2, { wakeTime: "07:05", bedtime: "22:35", stages: { awakeMin: 15 } })], TODAY, 8)!;
    expect(s.parts.map((p) => p.id)).toEqual(["duration", "timing", "efficiency"]);
    expect(s.score).toBeGreaterThanOrEqual(90);
    expect(s.word).toBe("Excellent");
    expect(s.reason).toMatch(/usual time/);
  });

  it("a short night names the shortfall against the need", () => {
    const s = nightScore([...steady, mk(TODAY, 6, { wakeTime: "07:00", stages: { awakeMin: 15 } })], TODAY, 8)!;
    expect(s.parts[0].score).toBe(75);
    expect(s.reason).toBe("2h 00m short of the 8h 00m you needed.");
  });

  it("a lie-in costs the timing part and is named", () => {
    const s = nightScore([...steady, mk(TODAY, 8, { wakeTime: "09:00", stages: { awakeMin: 15 } })], TODAY, 8)!;
    const timing = s.parts.find((p) => p.id === "timing")!;
    expect(timing.score).toBe(0);
    expect(s.reason).toMatch(/^Up 2h 00m later than your usual 07:00/);
    expect(s.score).toBe(85);
  });

  it("parts without data take nothing off", () => {
    const s = nightScore([mk(TODAY, 8)], TODAY, 8)!;
    expect(s.parts.map((p) => p.id)).toEqual(["duration"]);
    expect(s.score).toBe(100);
  });

  it("the score never beats the hours: a night well short of its need is not Excellent", () => {
    const s = nightScore([...steady, mk(TODAY, 6.5, { wakeTime: "07:00", stages: { awakeMin: 10 } })], TODAY, 8)!;
    expect(s.score).toBe(81);
    expect(s.word).toBe("Fair");
  });

  it("the need includes a share of the week's debt before the night", () => {
    const short = run(7, 6, () => ({}), addDays(TODAY, -1));
    expect(nightNeedH(short, TODAY, 8)).toBe(9);
    expect(nightNeedH([], TODAY, 8)).toBe(8);
  });

  it("copy stays calm", () => {
    for (const asleep of [5, 6.5, 8]) {
      for (const wake of ["05:30", "07:00", "10:00"]) {
        const s = nightScore([...steady, mk(TODAY, asleep, { wakeTime: wake, stages: { awakeMin: 70 } })], TODAY, 8)!;
        expect(bannedPhrasesIn(s.reason)).toEqual([]);
        expect(s.reason).not.toMatch(/—|!/);
      }
    }
  });
});

describe("wake consistency", () => {
  it("reads wake-time spread and each morning's offset from the usual", () => {
    const wakes = ["07:00", "07:10", "06:55", "07:05", "07:00", "07:15", "06:50"];
    const c = wakeConsistency(run(7, 8, (i) => ({ wakeTime: wakes[i] })), TODAY);
    expect(c.word).toBe("Excellent");
    expect(c.days).toHaveLength(7);
    expect(c.days[5].offsetMin).toBe(15);
  });

  it("weekend lie-ins widen the spread", () => {
    const wakes = ["07:00", "07:00", "07:00", "07:00", "07:00", "09:30", "10:00"];
    expect(wakeConsistency(run(7, 8, (i) => ({ wakeTime: wakes[i] })), TODAY).word).toBe("Poor");
  });

  it("needs 4 mornings for a word, and a missing night leaves its slot empty", () => {
    const c = wakeConsistency(run(3, 8, () => ({ wakeTime: "07:00" })), TODAY);
    expect(c.word).toBeNull();
    expect(c.days[0]).toMatchObject({ wake: null, offsetMin: null });
  });
});

describe("tonight's plan", () => {
  it("reads the wake time from the nights and works back to bedtime and wind-down", () => {
    const p = tonightPlan(run(7, 8, () => ({ wakeTime: "06:45" })), TODAY, 8);
    expect(p).toMatchObject({ wake: "06:45", wakeSource: "usual", needH: 8, bedtime: "22:25", windDown: "21:55" });
  });

  it("a one-off for tomorrow wins; a stale one is ignored", () => {
    const nights = run(7, 8, () => ({ wakeTime: "06:45" }));
    expect(tonightPlan(nights, TODAY, 8, { override: { date: addDays(TODAY, 1), hhmm: "05:30" } })).toMatchObject({ wake: "05:30", wakeSource: "override" });
    expect(tonightPlan(nights, TODAY, 8, { override: { date: TODAY, hhmm: "05:30" } }).wakeSource).toBe("usual");
  });

  it("falls back to an old setting, then 07:00, until three nights give a usual", () => {
    expect(tonightPlan([], TODAY, 8, { setting: "06:30" })).toMatchObject({ wake: "06:30", wakeSource: "setting" });
    expect(tonightPlan([], TODAY, 8)).toMatchObject({ wake: "07:00", wakeSource: "default" });
  });
});

describe("trends against the last 30 days", () => {
  it("compares the last week with the 30 nights before it and tones the change", () => {
    const base = run(30, 7, () => ({ wakeTime: "07:00", bedtime: "23:00", hrvMs: 50, restingHr: 52, stages: { awakeMin: 30 } }), addDays(TODAY, -7));
    const recent = run(7, 8, () => ({ wakeTime: "07:00", bedtime: "22:00", hrvMs: 40, restingHr: 55, stages: { awakeMin: 30 } }));
    const rows = sleepTrends([...base, ...recent], TODAY);
    const by = Object.fromEntries(rows.map((r) => [r.id, r]));
    expect(by.asleep).toMatchObject({ direction: "up", tone: "good", deltaText: "1h 00m more" });
    expect(by.bedtime).toMatchObject({ direction: "down", tone: "neutral", deltaText: "1h 00m earlier", recentText: "22:00" });
    expect(by.wake).toMatchObject({ direction: "steady", deltaText: "Steady" });
    expect(by.hrv).toMatchObject({ tone: "bad", deltaText: "10 ms down" });
    expect(by.rhr).toMatchObject({ tone: "bad", deltaText: "3 bpm up" });
  });

  it("shows nothing until both windows have enough nights", () => {
    expect(sleepTrends(run(7, 8, () => ({ wakeTime: "07:00" })), TODAY)).toEqual([]);
  });
});
