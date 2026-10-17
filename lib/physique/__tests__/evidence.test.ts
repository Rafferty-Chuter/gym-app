import { describe, expect, it } from "vitest";
import { CITATIONS, evidenceFor, evidenceLabels, RULE_EVIDENCE } from "@/lib/physique/evidence";
import type { RuleId } from "@/lib/physique/types";

const RULES: RuleId[] = [
  "SAFE-0", "SAFE-1", "SAFE-2", "SAFE-3", "SAFE-4", "SAFE-5",
  "NO-GOAL", "DATA-PARTIAL", "DATA-HOLD", "DATA-RATE", "DATA-EXP", "G-EXP-2",
  "DB-1", "ADH-1",
  "LOSS-1", "LOSS-2", "LOSS-2u", "LOSS-3", "LOSS-4", "LOSS-6",
  "GAIN-1", "GAIN-2", "GAIN-3", "GAIN-4", "RECOMP-1", "RECOMP-WAIST",
  "STR-1", "STR-2", "SLEEP-1", "SLEEP-1i", "SLEEP-2", "SLEEP-3",
  "PRO-1", "PRO-2", "FAT-1", "ON-TRACK", "NO-CHANGE",
];

describe("evidence map (research F)", () => {
  it("covers every rule id, and every key resolves to a citation with an https url", () => {
    for (const id of RULES) {
      expect(RULE_EVIDENCE[id], id).toBeDefined();
      for (const key of RULE_EVIDENCE[id]) {
        const c = CITATIONS[key];
        expect(c, `${id} → ${key}`).toBeDefined();
        expect(c.url).toMatch(/^https:\/\//);
        expect(c.label.length).toBeGreaterThan(0);
        expect(["primary", "secondary"]).toContain(c.kind);
      }
    }
  });

  it("evidence rules cite the papers research F lists for them", () => {
    expect(evidenceFor("LOSS-1").map((c) => c.id)).toEqual(["helms2014", "garthe2011", "mero2010", "murphy2022", "roberts2020"]);
    expect(evidenceFor("SLEEP-1").map((c) => c.label)).toContain("Nedeltcheva 2010");
    expect(evidenceFor("SAFE-4").map((c) => c.id)).toContain("who_bmi");
    expect(evidenceFor("NO-CHANGE")).toEqual([]);
    expect(evidenceLabels(["helms2014", "garthe2011", "missing"])).toBe("Helms 2014; Garthe 2011");
  });

  it("has no duplicate citation ids and no em dashes", () => {
    const ids = Object.keys(CITATIONS);
    expect(new Set(ids).size).toBe(ids.length);
    for (const c of Object.values(CITATIONS)) expect(c.title).not.toContain("—");
  });
});
