import { describe, expect, it } from "vitest";
import { addDays, type LocalDate } from "@/lib/dates";
import { CONNECTION_IDS, type Connection, type ConnectionId, type ConnectionsResult } from "@/lib/physique/connections";
import { detectablePct, GATE_POWER_Z, GATE_Z, glueNumbers, liftLinks, linkTitle, linkValue, nameList, seeTargetPct, weakerLabel, weakerPhrase } from "@/lib/physique/liftLinks";

const TODAY = "2026-10-22";
const squat = { name: "Squat", levelKg: 150 };
const bench = { name: "Bench Press", levelKg: 110 };

/** `n` sessions a week apart alternating ±`spread` around `pct`. */
function sessions(n: number, pct: number, spread: number, offset = 0): Array<{ date: LocalDate; pct: number }> {
  return Array.from({ length: n }, (_, k) => ({ date: addDays(TODAY, -(7 * k + offset)), pct: pct + (k % 2 ? spread : -spread) }));
}

/** A condition as IN5 returns it: by default read, no clear link, groups of 16 tight around the usual. */
function conn(id: ConnectionId, over: Partial<Connection> = {}, spread = 1): Connection {
  return {
    id,
    label: "Carbs the day before",
    kind: "range",
    state: "none",
    text: "",
    diffPct: 0.3,
    high: { value: "312 g", mean: 312, pct: 0.2, sessions: 16 },
    low: { value: "221 g", mean: 221, pct: -0.1, sessions: 16 },
    perLift: [],
    z: 0.5,
    q: 0.8,
    evidence: null,
    movedWith: null,
    movedWithSign: null,
    points: { high: sessions(16, 0.2, spread), low: sessions(16, -0.1, spread, 3) },
    ...over,
  };
}

function result(items: Connection[]): ConnectionsResult {
  return { from: addDays(TODAY, -364), through: TODAY, weeks: 30, sessions: 60, items, checked: items.length, recentPerWeek: 3 };
}

describe("What moves your lift (IN10)", () => {
  it("lists clear links for the chosen lift, the most kilos on it first", () => {
    const sleep = conn("sleep", { state: "linked", label: "Sleep the night before", diffPct: 3, perLift: [{ name: "Squat", pct: 3, kg: 4.5, sessions: 40, own: true }, { name: "Bench Press", pct: 2, kg: 2.2, sessions: 35, own: true }] });
    const wake = conn("wake", { state: "linked", kind: "yesno", label: "Waking early", diffPct: -2.5, perLift: [{ name: "Squat", pct: -2.5, kg: -3.8, sessions: 40, own: true }, { name: "Bench Press", pct: -3.5, kg: -3.85, sessions: 35, own: true }] });
    const onSquat = liftLinks(result([sleep, wake]), squat);
    expect(onSquat.linked.map((r) => [r.c.id, r.title, r.kg])).toEqual([
      ["sleep", "Stronger after longer nights", 4.5],
      ["wake", "Weaker after waking early", -3.8],
    ]);
    // On bench the early wakes cost more kilos than the long nights add.
    expect(liftLinks(result([sleep, wake]), bench).linked.map((r) => r.c.id)).toEqual(["wake", "sleep"]);
    expect(linkValue(wake, squat, "kg")).toBe("−4 kg");
    expect(linkValue(wake, squat, "lb")).toBe("−8 lb");
  });

  it("a lift without its own read takes the read across lifts on its level", () => {
    const sleep = conn("sleep", { state: "linked", diffPct: 2, perLift: [] });
    expect(liftLinks(result([sleep]), squat).linked[0]).toMatchObject({ pct: 2, kg: 3, own: false });
    // Nothing to put it on: percent.
    expect(linkValue(sleep, null, "kg")).toBe("+2.0%");
  });

  it("says no clear link only once the groups could have shown 3 kg on the lift", () => {
    // Tight groups: the difference they could show is well under 3 kg on a 150 kg squat (2%).
    const tight = conn("carbs");
    expect(detectablePct(tight)!).toBeLessThan(seeTargetPct(squat));
    // Noisy groups: not yet, with about how many more sessions until they could.
    const noisy = conn("protein", { label: "Protein over three days" }, 2.5);
    const see = detectablePct(noisy)!;
    expect(see).toBeCloseTo((GATE_Z + GATE_POWER_Z) * Math.sqrt((2 * 2.5 ** 2 * (16 / 15)) / 16), 6);
    const m = liftLinks(result([tight, noisy]), squat);
    expect(m.noLink.map((c) => c.id)).toEqual(["carbs"]);
    const gated = m.notYet.find((g) => g.id === "protein")!;
    // 32 sessions in the two thirds, 48 read; it takes (see / 2%)² as many to show 3 kg.
    expect(gated.more).toBe(Math.ceil(48 * ((see / 2) ** 2 - 1)));
    expect(gated.share).toBeCloseTo((2 / see) ** 2, 6);
    expect(m.soonest).toBe(gated.more);
  });

  it("the 3 kg is never under the engine's own 1.5% floor on a heavy lift", () => {
    expect(seeTargetPct({ name: "Deadlift", levelKg: 260 })).toBe(1.5);
    expect(seeTargetPct({ name: "Overhead Press", levelKg: 60 })).toBe(5);
    expect(seeTargetPct(null)).toBe(3);
  });

  it("names every condition the engine left out as not yet, after the ones on their way", () => {
    const m = liftLinks(result([conn("carbs"), conn("protein", {}, 2.5)]), squat);
    const left = CONNECTION_IDS.filter((id) => id !== "carbs" && id !== "protein");
    expect(m.notYet.map((g) => g.id)).toEqual(["protein", ...left]);
    expect(m.notYet.slice(1).every((g) => g.c == null && g.more == null)).toBe(true);
    expect(m.notYet.find((g) => g.id === "shortRun")!.noun).toBe("short nights in a row");
  });

  it("before the first read nothing is listed per condition (the card shows the sessions so far)", () => {
    expect(liftLinks(result([]), squat)).toMatchObject({ linked: [], noLink: [], notYet: [], soonest: null });
  });

  it("a condition folded into a link that moved with it is said on that row only", () => {
    const carbs = conn("carbs", { state: "linked", diffPct: 3, movedWith: "balance", movedWithSign: 1 });
    const m = liftLinks(result([carbs, conn("balance", { label: "Calories the day before" })]), squat);
    expect(m.linked.map((r) => r.c.id)).toEqual(["carbs"]);
    expect(m.noLink.concat(m.notYet.flatMap((g) => (g.c ? [g.c] : []))).some((c) => c.id === "balance")).toBe(false);
  });

  it("a condition added later reads from its label", () => {
    expect(linkTitle(conn("carbs", { id: "alcohol" as ConnectionId, kind: "yesno", label: "Drinks the night before", diffPct: -3 }))).toBe("Weaker: drinks the night before");
    expect(linkTitle(conn("carbs", { id: "salt" as ConnectionId, label: "Salt the day before", diffPct: 2 }))).toBe("Stronger with more salt the day before");
    // The weight trend's words depend on where both thirds sit.
    expect(linkTitle(conn("rate", { diffPct: 2, high: { value: "", mean: -0.2, pct: 1, sessions: 10 }, low: { value: "", mean: -0.8, pct: -1, sessions: 10 } }))).toBe("Stronger when losing more slowly");
  });

  it("lists names in a line", () => {
    expect(nameList(["sleep"])).toBe("sleep");
    expect(nameList(["sleep", "carbs", "protein"])).toBe("sleep, carbs and protein");
    expect(nameList(["sleep", "carbs", "protein", "HRV", "rest days"])).toBe("sleep, carbs, protein and 2 more");
  });

  it("keeps a number with its unit on one line", () => {
    expect(glueNumbers("Est. 1RM about 7 kg higher on squat · 7h 42m vs 6h 00m of sleep")).toBe("Est. 1RM about 7\u00a0kg higher on squat · 7h\u00a042m vs 6h\u00a000m of sleep");
    expect(glueNumbers("312 g vs 221 g of carbs · 30 sessions")).toBe("312\u00a0g vs 221\u00a0g of carbs · 30 sessions");
  });

  it("names the weaker side's sessions, for what the charts mark", () => {
    // More sleep helped: the weaker side is the shorter nights, with their average.
    expect(weakerLabel(conn("sleep", { diffPct: 3, low: { value: "6h 05m", mean: 6.1, pct: -2, sessions: 16 } }))).toBe("sessions after a shorter night (6h 05m)");
    // Early wakes hurt: the weaker side is the yes group.
    expect(weakerLabel(conn("wake", { kind: "yesno", diffPct: -3 }))).toBe("sessions after an early wake");
    expect(weakerPhrase(conn("carbs", { id: "alcohol" as ConnectionId, kind: "yesno", label: "Drinks the night before", diffPct: -3 }))).toBe("with drinks the night before");
    expect(weakerPhrase(conn("carbs", { id: "salt" as ConnectionId, label: "Salt the day before", diffPct: -2 }))).toBe("with more salt the day before");
  });
});
