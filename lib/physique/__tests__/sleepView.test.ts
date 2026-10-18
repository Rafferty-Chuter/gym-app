import { describe, expect, it } from "vitest";
import { addDays, type LocalDate } from "@/lib/dates";
import { bannedPhrasesIn } from "@/lib/physique/copy";
import { debt7, nightsByDate } from "@/lib/physique/sleep";
import { CONTRIBUTOR_MIN_NIGHTS, bedtimePlan, bedtimeSpreadMin, lightsOutFor, nightWord, sleepContributors, sleepInsight, tonightNeedH, trendBars, type Contributor, type SleepReadLike, bedTime, efficiencyOf } from "@/lib/physique/sleepView";
import type { SleepNight } from "@/lib/physique/types";

const TODAY = "2026-10-17";
const NOW = { today: TODAY, tz: "UTC" };
const WORDS = new Set(["Poor", "Fair", "Good", "Excellent"]);

function mk(date: LocalDate, asleepH: number, extra: Partial<SleepNight> = {}): SleepNight {
  return { id: `n-${date}`, date, loggedAt: `${date}T07:10:00.000Z`, source: "manual", schemaVersion: 1, asleepMin: Math.round(asleepH * 60), ...extra };
}

/** `count` nights ending today, each `asleepH` long, with per-night extras. */
function run(count: number, asleepH: number, extra: (i: number) => Partial<SleepNight> = () => ({})): SleepNight[] {
  const out: SleepNight[] = [];
  for (let i = count - 1; i >= 0; i--) out.push(mk(addDays(TODAY, -i), asleepH, extra(count - 1 - i)));
  return out;
}

function byId(items: Contributor[], id: Contributor["id"]): Contributor {
  const c = items.find((x) => x.id === id);
  if (!c) throw new Error(`no contributor ${id}`);
  return c;
}

describe("contributors: duration vs the goal", () => {
  it("maps the 7-night mean as a share of the goal to the four words", () => {
    expect(byId(sleepContributors(run(7, 8.0), NOW, 8), "duration").word).toBe("Excellent");
    expect(byId(sleepContributors(run(7, 7.3), NOW, 8), "duration").word).toBe("Good");
    expect(byId(sleepContributors(run(7, 6.6), NOW, 8), "duration").word).toBe("Fair");
    expect(byId(sleepContributors(run(7, 6.0), NOW, 8), "duration").word).toBe("Poor");
  });

  it("states the average, the goal and the night count", () => {
    const d = byId(sleepContributors(run(6, 7.3), NOW, 8), "duration");
    expect(d.detail).toBe("Avg 7h 18m of 8h 00m · 6 nights");
    expect(d.fill).toBeCloseTo(7.3 / 8, 6);
  });
});

describe("contributors: efficiency (asleep ÷ in bed)", () => {
  function eff(ratio: number) {
    const nights = run(7, 7, () => ({ inBedMin: Math.round(420 / ratio) }));
    return byId(sleepContributors(nights, NOW, 8), "efficiency");
  }

  it("85% is Good (the clinical cut-off), 90% Excellent, 75% Fair, below Poor", () => {
    expect(eff(0.92).word).toBe("Excellent");
    expect(eff(0.86).word).toBe("Good");
    expect(eff(0.8).word).toBe("Fair");
    expect(eff(0.7).word).toBe("Poor");
    expect(eff(0.86).detail).toMatch(/^86% of time in bed asleep · 7 nights$/);
  });

  it("reads only nights with time in bed and needs three of them", () => {
    const nights = run(7, 7, (i) => (i < 2 ? { inBedMin: 460 } : {}));
    const e = byId(sleepContributors(nights, NOW, 8), "efficiency");
    expect(e.word).toBeNull();
    expect(e.fill).toBe(0);
    expect(e.detail).toBe(`2 of 7 nights · ${CONTRIBUTOR_MIN_NIGHTS} give a read`);
  });
});

describe("contributors: wake-ups", () => {
  function wk(f: (i: number) => SleepNight["wakeups"]) {
    return byId(sleepContributors(run(6, 7.5, (i) => ({ wakeups: f(i) })), NOW, 8), "wakeups");
  }

  it("all 0 → Excellent, all 1–2 → Good, mixed 1–2 and 3+ → Fair, all 3+ → Poor", () => {
    expect(wk(() => "0").word).toBe("Excellent");
    expect(wk(() => "1-2").word).toBe("Good");
    expect(wk((i) => (i % 2 ? "3+" : "1-2")).word).toBe("Fair");
    expect(wk(() => "3+").word).toBe("Poor");
  });

  it("has no word when wake-ups were not logged", () => {
    const w = byId(sleepContributors(run(7, 7.5), NOW, 8), "wakeups");
    expect(w.word).toBeNull();
    expect(w.detail).toContain("0 of 7 nights");
  });
});

describe("contributors: consistency (bedtime spread)", () => {
  function cons(beds: string[]) {
    return byId(sleepContributors(run(beds.length, 7.5, (i) => ({ bedtime: beds[i] })), NOW, 8), "consistency");
  }

  it("measures bedtimes from 18:00 so a night past midnight sits next to one before it", () => {
    const nights = nightsByDate(run(3, 7.5, (i) => ({ bedtime: ["23:30", "00:30", "23:30"][i] })));
    expect(bedtimeSpreadMin([...nights.values()])).toBeCloseTo(34.64, 1);
    expect(cons(["23:30", "00:30", "23:30"]).word).toBe("Good");
  });

  it("±30 min is Excellent, ±60 Good, ±90 Fair, wider Poor", () => {
    expect(cons(["23:00", "23:00", "23:00"]).word).toBe("Excellent");
    expect(cons(["22:00", "23:00", "00:00"]).word).toBe("Good");
    expect(cons(["22:00", "23:30", "01:00"]).word).toBe("Fair");
    expect(cons(["21:00", "23:00", "01:00"]).word).toBe("Poor");
    expect(cons(["22:00", "23:00", "00:00"]).detail).toBe("Bedtime spread ±60 min · 3 nights");
  });
});

describe("contributors: debt", () => {
  it("reuses debt7 and maps 0.5 / 2 / 5 h to the words", () => {
    const at = (h: number) => byId(sleepContributors(run(7, h), NOW, 8), "debt");
    expect(at(8).word).toBe("Excellent");
    expect(at(8).detail).toBe("On the goal · 7 nights");
    expect(at(7.75).word).toBe("Good");
    expect(at(7.4).word).toBe("Fair");
    expect(at(7).word).toBe("Poor");
    const nights = run(7, 7.4);
    const engine = debt7(nightsByDate(nights), TODAY, 8) as number;
    expect(at(7.4).detail).toBe(`${Math.floor(engine)}h ${String(Math.round((engine % 1) * 60)).padStart(2, "0")}m short of the goal · 7 nights`);
  });
});

describe("contributors: gates and words", () => {
  it("below three nights every contributor has no word and says what gives a read", () => {
    const items = sleepContributors(run(2, 7.5, () => ({ bedtime: "23:00", inBedMin: 480, wakeups: "0" })), NOW, 8);
    expect(items).toHaveLength(5);
    for (const c of items) {
      expect(c.word).toBeNull();
      expect(c.fill).toBe(0);
      expect(c.detail).toContain(`${CONTRIBUTOR_MIN_NIGHTS} give a read`);
    }
  });

  it("never shows a number as the word", () => {
    const items = sleepContributors(run(7, 7.2, (i) => ({ bedtime: ["23:00", "23:15", "22:45", "23:30", "23:00", "00:15", "23:05"][i], inBedMin: 470, wakeups: "1-2" })), NOW, 8);
    for (const c of items) {
      expect(c.word === null || WORDS.has(c.word)).toBe(true);
      expect(c.word ?? "").not.toMatch(/\d/);
      expect(c.fill).toBeGreaterThanOrEqual(0);
      expect(c.fill).toBeLessThanOrEqual(1);
    }
  });
});

describe("last-night word", () => {
  it("rates one night on the duration bands", () => {
    expect(nightWord(8, 8)).toBe("Good");
    expect(nightWord(7.3, 8)).toBe("OK");
    expect(nightWord(6.6, 8)).toBe("Short");
    expect(nightWord(6, 8)).toBe("Very short");
  });
});

describe("bedtime planner", () => {
  it("lights-out is wake − goal − 20 min and wraps midnight", () => {
    expect(lightsOutFor("07:00", 8)).toBe("22:40");
    expect(lightsOutFor("06:00", 9)).toBe("20:40");
    expect(lightsOutFor("05:30", 7)).toBe("22:10");
    expect(lightsOutFor("08:00", 7)).toBe("00:40");
  });

  it("the lights-out time follows the wake time and the goal", () => {
    expect(bedtimePlan("07:00", 8, null).lightsOut).toBe("22:40");
    expect(bedtimePlan("07:30", 8, null).lightsOut).toBe("23:10");
    expect(bedtimePlan("07:00", 7.5, null).lightsOut).toBe("23:10");
    expect(bedtimePlan("07:00", 12, null).goalH).toBe(9);
  });

  it("tonight's need adds a third of the debt, capped at an hour and clamped 7–9.5 h", () => {
    expect(tonightNeedH(8, null)).toBe(8);
    expect(tonightNeedH(8, 1.5)).toBeCloseTo(8.5, 6);
    expect(tonightNeedH(8, 6)).toBe(9);
    expect(tonightNeedH(9, 6)).toBe(9.5);
    expect(tonightNeedH(7, 0)).toBe(7);
    const p = bedtimePlan("07:00", 8, 1.5);
    expect(p.needH).toBeCloseTo(8.5, 6);
    expect(p.lightsOutForNeed).toBe("22:10");
    expect(p.debtH).toBe(1.5);
  });

  it("falls back to 07:00 for a malformed wake time", () => {
    expect(bedtimePlan("7am", 8, null).wake).toBe("07:00");
  });
});

describe("insight", () => {
  const reads: Array<[string, SleepReadLike]> = [
    ["empty", { status: "unknown", mean14h: null, nightsLogged14: 0, debt7h: null, acute: false }],
    ["early", { status: "unknown", mean14h: null, nightsLogged14: 4, debt7h: 2, acute: false }],
    ["severe", { status: "severe", mean14h: 6.2, nightsLogged14: 13, debt7h: 10, acute: true }],
    ["short", { status: "short", mean14h: 6.8, nightsLogged14: 12, debt7h: 4.5, acute: false }],
    ["short, no debt", { status: "short", mean14h: 6.9, nightsLogged14: 12, debt7h: 0.2, acute: false }],
    ["ok with debt", { status: "ok", mean14h: 7.6, nightsLogged14: 14, debt7h: 2.5, acute: false }],
    ["ok", { status: "ok", mean14h: 8.1, nightsLogged14: 14, debt7h: 0, acute: false }],
    ["acute", { status: "ok", mean14h: 7.5, nightsLogged14: 14, debt7h: 3, acute: true }],
  ];

  it("is one calm sentence with no banned phrases for every read", () => {
    for (const [, r] of reads) {
      const text = sleepInsight(r, 8);
      expect(bannedPhrasesIn(text), text).toEqual([]);
      expect(text.endsWith("."), text).toBe(true);
      expect(text.length).toBeLessThan(160);
    }
  });

  it("uses the engine's numbers and names what is missing", () => {
    expect(sleepInsight(reads[0][1], 8)).toBe("10 of 14 nights give a first read.");
    expect(sleepInsight(reads[1][1], 8)).toBe("4 of 14 nights logged. 6 more give a read.");
    expect(sleepInsight(reads[2][1], 8)).toContain("6h 12m");
    expect(sleepInsight(reads[3][1], 8)).toContain("4h 30m to make up");
    expect(sleepInsight(reads[4][1], 8)).not.toContain("make up");
    expect(sleepInsight(reads[5][1], 8)).toContain("2h 30m behind");
    expect(sleepInsight(reads[6][1], 8)).toBe("Averaging 8h 06m over 14 nights, on the 8h 00m goal. Nothing to change.");
    expect(sleepInsight(reads[7][1], 8)).toMatch(/^Two short nights in a row/);
  });
});

describe("trend bars", () => {
  it("gives 14 slots ending today with null for unlogged nights", () => {
    const bars = trendBars(run(3, 7.5), NOW);
    expect(bars).toHaveLength(14);
    expect(bars[13].date).toBe(TODAY);
    expect(bars[0].date).toBe(addDays(TODAY, -13));
    expect(bars.filter((b) => b.asleepH !== null)).toHaveLength(3);
    expect(bars[13].asleepH).toBeCloseTo(7.5, 6);
    expect(bars[10].asleepH).toBeNull();
  });
});

describe("bedTime and efficiencyOf (watch nights without an in-bed time)", () => {
  const base = { id: "n", date: "2026-10-17", loggedAt: "2026-10-17T07:00:00Z", source: "healthkit" as const, schemaVersion: 1 as const, asleepMin: 420 };
  it("a logged time in bed wins", () => {
    expect(bedTime({ ...base, inBedMin: 450, stages: { awakeMin: 20 } })).toEqual({ min: 450, kind: "in_bed" });
    expect(efficiencyOf({ ...base, inBedMin: 450 })).toBeCloseTo(420 / 450, 5);
  });
  it("without one, the sleep period is asleep plus the watch's awake minutes", () => {
    expect(bedTime({ ...base, inBedMin: 0, stages: { awakeMin: 21, deepMin: 60 } })).toEqual({ min: 441, kind: "period" });
    expect(efficiencyOf({ ...base, stages: { awakeMin: 21 } })).toBeCloseTo(420 / 441, 5);
  });
  it("then the span from bedtime to wake, across midnight", () => {
    expect(bedTime({ ...base, bedtime: "23:10", wakeTime: "07:00" })).toEqual({ min: 470, kind: "period" });
  });
  it("nothing to go on gives no efficiency", () => {
    expect(bedTime(base)).toBeNull();
    expect(efficiencyOf(base)).toBeNull();
  });
});
