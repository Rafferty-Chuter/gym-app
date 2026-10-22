import { describe, expect, it } from "vitest";
import { connectionWords } from "@/lib/physique/connectionWords";
import type { Connection, ConnectionId } from "@/lib/physique/connections";
import { bannedPhrasesIn } from "@/lib/physique/copy";

/** A clear link as the engine returns it, with the founder's numbers from 22 Oct by default. */
function conn(id: ConnectionId, over: Partial<Connection> = {}, high = 312, low = 221): Connection {
  return {
    id,
    label: "Carbs the day before",
    state: "linked",
    text: "",
    diffPct: 3.3,
    high: { value: "", mean: high, pct: 1.6, sessions: 23 },
    low: { value: "", mean: low, pct: -1.7, sessions: 23 },
    evidence: null,
    movedWith: null,
    movedWithSign: null,
    points: { high: [], low: [] },
    ...over,
  };
}

const squat = { name: "Squat", levelKg: 150 };

describe("Connections in plain words (TR12)", () => {
  it("leads with one sentence a lifter gets at a glance, then the numbers", () => {
    const w = connectionWords(conn("carbs"), squat, "kg");
    // 3.3% of a 150 kg squat is 4.95 kg, rounded to the plate.
    expect(w.headline).toBe("Your squat is about 5 kg heavier the day after a higher-carb day");
    expect(w.parts).toEqual({ before: "Your squat is about ", effect: "5 kg heavier", after: " the day after a higher-carb day" });
    expect(w.numbers).toBe("312 g vs 221 g of carbs · 46 sessions");
    expect(w.overlap).toBeNull();
  });

  it("always describes the upper third, heavier or lighter, in each condition's own words", () => {
    expect(connectionWords(conn("sleep", { diffPct: 4 }, 7.8, 6.1), squat, "kg")).toMatchObject({ headline: "Your squat is about 6 kg heavier after a longer night", values: "7h 48m vs 6h 06m of sleep" });
    expect(connectionWords(conn("rest", { diffPct: -2 }, 3, 1), squat, "kg")).toMatchObject({ headline: "Your squat is about 3 kg lighter after a longer break", values: "3 days vs 1 day since the last session" });
    expect(connectionWords(conn("balance", {}, -130, -790), squat, "kg").values).toBe("−130 vs −790 kcal against maintenance");
    expect(connectionWords(conn("balance", {}, 20, -600), squat, "kg").values).toBe("0 vs −600 kcal against maintenance");
    expect(connectionWords(conn("time", {}, 18.5, 7.25), squat, "kg")).toMatchObject({ headline: "Your squat is about 5 kg heavier when you train later in the day", values: "around 18:30 vs 07:15" });
    expect(connectionWords(conn("protein", {}, 185, 140), squat, "kg").values).toBe("185 g vs 140 g of protein a day");
    expect(connectionWords(conn("hrv", {}, 62, 48), squat, "kg").headline).toBe("Your squat is about 5 kg heavier on mornings with a higher HRV");
  });

  it("reads the weight trend by which side of zero it sits, in kilos a week", () => {
    expect(connectionWords(conn("rate", {}, -0.2, -0.6), squat, "kg")).toMatchObject({ headline: "Your squat is about 5 kg heavier when your weight is coming down more slowly", values: "−0.2 vs −0.6 kg a week" });
    expect(connectionWords(conn("rate", {}, 0.4, 0.1), squat, "kg").parts.after).toBe(" when your weight is going up faster");
    expect(connectionWords(conn("rate", {}, 0.2, -0.3), squat, "lb")).toMatchObject({ values: "+0.4 vs −0.7 lb a week" });
  });

  it("names the other condition that moved on the same days, so it could be either", () => {
    expect(connectionWords(conn("carbs", { movedWith: "balance", movedWithSign: 1 }), squat, "kg").overlap).toBe("Calories were higher too, so it could be either.");
    expect(connectionWords(conn("sleep", { movedWith: "rest", movedWithSign: -1 }), squat, "kg").overlap).toBe("Breaks were shorter on those days, so it could be either.");
  });

  it("falls back to percent without a lift, or when the kilos round to nothing", () => {
    expect(connectionWords(conn("carbs"), null, "kg").headline).toBe("Your top sets are about 3.3% heavier the day after a higher-carb day");
    expect(connectionWords(conn("carbs", { diffPct: 1.5 }), { name: "Curl", levelKg: 12 }, "kg").parts.effect).toBe("1.5% heavier");
    expect(connectionWords(conn("carbs"), squat, "lb").parts.effect).toBe("11 lb heavier");
  });

  it("says what moved together, never a cause or advice", () => {
    for (const id of ["sleep", "carbs", "balance", "protein", "time", "rest", "rate", "hrv"] as ConnectionId[]) {
      const w = connectionWords(conn(id, { diffPct: -2.5 }), squat, "kg");
      expect(`${w.headline} ${w.numbers}`).not.toMatch(/because|better|should|try|so you|causes?/i);
      expect(bannedPhrasesIn(`${w.headline} ${w.numbers}`)).toEqual([]);
    }
  });
});
