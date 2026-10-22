import { describe, expect, it } from "vitest";
import { addDays, type LocalDate } from "@/lib/dates";
import { bannedPhrasesIn } from "@/lib/physique/copy";
import type { Connection, ConnectionId, ConnectionsResult } from "@/lib/physique/connections";
import type { Finding } from "@/lib/physique/findings";
import type { StuckLift } from "@/lib/physique/liftPlateau";
import type { ScaleJump } from "@/lib/physique/scaleJump";
import { SPOTTED_HALF_LIFE_DAYS, SPOTTED_LINK_DAYS, SPOTTED_MAX, spotted, type SpottedInputs } from "@/lib/physique/spotted";

const TODAY = "2026-10-22";
const squat = { name: "Squat", levelKg: 150 };

/** A jump as IN2 returns it: up 1.1 kg, 0.9 kg over the line with a 0.3 kg spread (1.8 × its 0.5 kg floor). */
function jump(over: Partial<ScaleJump> = {}): ScaleJump {
  return {
    date: TODAY,
    scaleKg: 81.4,
    expectedKg: 80.5,
    deltaKg: 0.9,
    changeKg: 1.1,
    previousDate: addDays(TODAY, -1),
    direction: "up",
    spreadKg: 0.3,
    causes: [{ kind: "food", daysAgo: 1, carbsDeltaG: 220, kcalDelta: 1072, shareKg: 0.7 }],
    foodLog: "logged",
    settle: { jumps: 4, minDays: 1, maxDays: 2 },
    personal: false,
    ...over,
  };
}

/** A lift IN4 calls stuck: flat for 7 sessions (7/6 of its floor) with chest sets down. */
function stuck(over: Partial<StuckLift> = {}): StuckLift {
  return {
    name: "Bench Press",
    key: "bench",
    state: "flat",
    since: "2026-09-01",
    sessions: 7,
    levelKg: 114,
    changeKg: 0.4,
    changePct: 0.3,
    changes: [{ kind: "sets", muscle: "Chest", before: 14, during: 8 }],
    ...over,
  };
}

/** Sessions on `dates`, each at `pct` against usual. */
const pts = (dates: LocalDate[], pct: number) => dates.map((date) => ({ date, pct }));

/** A clear link as IN5 returns it. */
function link(id: ConnectionId, over: Partial<Connection> = {}): Connection {
  return {
    id,
    label: "Two short nights in a row",
    kind: "yesno",
    state: "linked",
    text: "",
    diffPct: -4,
    high: { value: "Two short nights", mean: 1, pct: -3, sessions: 10 },
    low: { value: "The rest", mean: 0, pct: 1, sessions: 30 },
    perLift: [{ name: "Squat", pct: -4, kg: -6, sessions: 40, own: true }],
    z: 4,
    q: 0.01,
    evidence: null,
    movedWith: null,
    movedWithSign: null,
    points: { high: pts([addDays(TODAY, -40), addDays(TODAY, -9), addDays(TODAY, -2)], -3), low: pts([addDays(TODAY, -30), addDays(TODAY, -1)], 1) },
    ...over,
  };
}

function result(items: Connection[]): ConnectionsResult {
  return { from: addDays(TODAY, -364), through: TODAY, weeks: 30, sessions: 80, items, checked: items.length, recentPerWeek: 3 };
}

const finding = (id: Finding["id"], title = "Food log looks incomplete"): Finding => ({ id, title, fact: "1,650 kcal logged a day · weight steady", data: "", evidence: "Resting energy plus digestion is about 1.1 times resting energy.", sources: [] });

const base: SpottedInputs = { today: TODAY, unit: "kg", jump: null, stuck: [], connections: null, findings: [], lift: squat };

describe("Spotted: what the engines found, biggest and newest first (IN10)", () => {
  it("is empty when nothing was found", () => {
    expect(spotted(base)).toEqual([]);
  });

  it("keeps at most three, the largest past its own floor first", () => {
    const out = spotted({
      ...base,
      jump: jump(),
      stuck: [stuck(), stuck({ key: "squat", name: "Squat", sessions: 15 })],
      connections: result([link("shortRun")]),
      findings: [finding("underlog")],
    });
    expect(out).toHaveLength(SPOTTED_MAX);
    // Squat flat for 15 sessions (2.5 × its floor, now), the short-night link (−4% against a 1.5% floor, last met 2 days ago: 2.2), today's jump (1.8 ×); bench's 7 sessions and the finding (1) drop off.
    expect(out.map((s) => s.key)).toEqual(["stuck:squat", "link:shortRun", "jump"]);
  });

  it("halves a fact's weight every week it gets older", () => {
    // Met two days ago: 4% against a 1.5% floor, capped at 3, halved for each week of age.
    const [l] = spotted({ ...base, connections: result([link("shortRun")]) });
    expect(l.date).toBe(addDays(TODAY, -2));
    expect(l.score).toBeCloseTo(Math.min(3, 4 / 1.5) * 0.5 ** (2 / SPOTTED_HALF_LIFE_DAYS), 6);
    // Yesterday's jump: 0.9 kg against its 0.5 kg floor, a day old.
    expect(spotted({ ...base, jump: jump({ date: addDays(TODAY, -1) }) })[0].score).toBeCloseTo(1.8 * 0.5 ** (1 / SPOTTED_HALF_LIFE_DAYS), 6);
  });

  it("a link is news only for a week after a session on its weaker side; the lift card holds the rest", () => {
    const old = link("shortRun", { points: { high: pts([addDays(TODAY, -60), addDays(TODAY, -SPOTTED_LINK_DAYS)], -3), low: pts([addDays(TODAY, -1)], 1) } });
    expect(spotted({ ...base, connections: result([old]) })).toEqual([]);
    const fresh = link("shortRun", { points: { high: pts([addDays(TODAY, -60), addDays(TODAY, -(SPOTTED_LINK_DAYS - 1))], -3), low: pts([addDays(TODAY, -1)], 1) } });
    expect(spotted({ ...base, connections: result([fresh]) }).map((s) => s.key)).toEqual(["link:shortRun"]);
  });

  it("shows one link at most (the lift card lists them) and one fact per topic", () => {
    const out = spotted({
      ...base,
      connections: result([link("shortRun"), link("wake", { label: "Waking early", diffPct: -3.5 }), link("carbs", { kind: "range", label: "Carbs the day before", diffPct: 3, high: { value: "310 g", mean: 310, pct: 1.5, sessions: 20 }, low: { value: "210 g", mean: 210, pct: -1.5, sessions: 20 } })]),
      findings: [finding("sleep-lifts", "Short sleep, lifts not moving")],
    });
    expect(out.filter((s) => s.kind === "link")).toHaveLength(1);
    // The sleep finding and the short-night link are one topic: the stronger stays.
    expect(out.map((s) => s.key)).toEqual(["link:shortRun"]);
  });

  it("no more than two of a kind, so stalls don't hide the rest", () => {
    const out = spotted({ ...base, stuck: [stuck({ key: "a", sessions: 18 }), stuck({ key: "b", sessions: 17 }), stuck({ key: "c", sessions: 16 })], findings: [finding("underlog")] });
    expect(out.map((s) => s.key)).toEqual(["stuck:a", "stuck:b", "finding:underlog"]);
  });

  it("a jump is news that morning and the next, not after", () => {
    expect(spotted({ ...base, jump: jump({ date: addDays(TODAY, -1) }) })).toHaveLength(1);
    expect(spotted({ ...base, jump: jump({ date: addDays(TODAY, -2) }) })).toEqual([]);
  });

  it("each fact in its engine's words, with its working and the days the charts mark", () => {
    const [j] = spotted({ ...base, jump: jump() });
    expect(j).toMatchObject({ title: "Up 1.1 kg on yesterday", detail: "Yesterday: 220 g more carbs and 1,072 more kcal than usual", days: [addDays(TODAY, -1), TODAY], daysLabel: "the weigh-in and the day before", charts: ["weight", "calories"] });
    expect(j.working).toEqual([
      { label: "Scale today", value: "81.40 kg" },
      { label: "Expected from the last 3 weeks", value: "80.50 kg" },
      { label: "Your usual day-to-day", value: "± 0.3 kg" },
      { label: "Your last 4 jumps like this were gone in 1 to 2 days" },
    ]);

    const [s] = spotted({ ...base, stuck: [stuck()] });
    expect(s).toMatchObject({ title: "Bench Press: flat for 7 sessions", detail: "Since 1\u00a0Sep: chest sets 14 → 8 a week", from: "2026-09-01", charts: ["strength", "training"] });
    expect(s.working[0]).toEqual({ label: "Est. 1RM", value: "114 kg since 1\u00a0Sep" });

    const [f] = spotted({ ...base, findings: [finding("underlog")] });
    expect(f).toMatchObject({ title: "Food log looks incomplete", from: addDays(TODAY, -27), charts: ["calories", "weight"] });
  });

  it("a link leads with the plain finding, its kilos as estimated 1RM, and what is new this week", () => {
    const [l] = spotted({ ...base, connections: result([link("shortRun")]) });
    expect(l.title).toBe("Weaker after two short nights");
    // The squat's own read: −6 kg; one of the weaker sessions falls in the last 7 days.
    expect(l.detail).toBe("Squat est. 1RM about 6 kg lower · 1 session after two short nights in the last 7 days");
    expect(l.days).toEqual([addDays(TODAY, -40), addDays(TODAY, -9), addDays(TODAY, -2)]);
    expect(l.charts).toEqual(["sleep", "strength"]);
    expect(l.daysLabel).toBe("sessions after two short nights");
    // The working is the sessions as dots on the lift, drawn by the card.
    expect(l.working).toEqual([]);

    // A range condition gives both groups' values; with no lift, percent.
    const carbs = link("carbs", { kind: "range", label: "Carbs the day before", diffPct: 3.2, perLift: [], high: { value: "312 g", mean: 312, pct: 1.6, sessions: 23 }, low: { value: "221 g", mean: 221, pct: -1.6, sessions: 23 } });
    const [c] = spotted({ ...base, lift: null, connections: result([carbs]) });
    expect(c.title).toBe("Stronger after higher-carb days");
    expect(c.detail).toBe("Est. 1RM about 3.2% higher · 1 session after a lower-carb day in the last 7 days");
    // Its weaker side is the lower third: those days are marked.
    expect(c.days).toEqual([addDays(TODAY, -30), addDays(TODAY, -1)]);
    expect(c.daysLabel).toBe("sessions after a lower-carb day (221 g)");
  });

  it("reads a condition it has no words for from its label (alcohol, salt, added later)", () => {
    const later = link("rest", { id: "alcohol" as ConnectionId, label: "Drinks the night before", diffPct: -2.5, perLift: [] });
    const [l] = spotted({ ...base, connections: result([later]) });
    expect(l.title).toBe("Weaker: drinks the night before");
    expect(l.detail).toBe("Squat est. 1RM about 4 kg lower · 1 session with drinks the night before in the last 7 days");
    expect(l.charts).toEqual(["strength"]);
    expect(l.topic).toBe("link:alcohol");
  });

  it("never uses a banned phrase", () => {
    const out = spotted({ ...base, jump: jump(), stuck: [stuck({ state: "dropping", changeKg: -6, changePct: -4, sessions: 8 })], connections: result([link("shortRun")]) });
    for (const s of out) expect(bannedPhrasesIn([s.title, s.detail, ...s.working.map((w) => `${w.label} ${w.value ?? ""}`)].join(" "))).toEqual([]);
  });
});
