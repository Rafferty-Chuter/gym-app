import { describe, expect, it } from "vitest";
import { addDays } from "@/lib/dates";
import { makeScenario } from "@/lib/physique/fixtures";
import { connections } from "@/lib/physique/connections";
import { findings } from "@/lib/physique/findings";
import { ASK_FACT_MAX_CHARS, ASK_MAX_FACTS, askPrompt, connectionSubject, findingSubject } from "@/lib/physique/askAbout";
import { referenceLift } from "@/lib/physique/liftEffect";

const today = "2026-10-21";

describe("Ask the coach why (PR3f)", () => {
  it("hands a connection over with the engine's own numbers, within the limits", () => {
    const sc = makeScenario({ seed: 18, days: 112, startDate: addDays(today, -111), bodyweightKg: 85, trueTdeeKcal: 2800, intake: "toTarget", goal: { ratePctPerWeek: -0.5, targetKg: 78 }, sleep: { meanH: 7.0, sdH: 0.9, source: "manual", loggedShare: 1 }, lifts: [{ name: "Squat", startE1rm: 150, profile: "linear", changePct: 3, perWeek: 3, cv: 0.015 }, { name: "Bench Press", startE1rm: 110, profile: "linear", changePct: 2, perWeek: 3, cv: 0.015 }] });
    const r = connections({ workouts: sc.workouts, sleepNights: sc.sleepNights, foodEntries: sc.foodEntries, dayFlags: sc.dayFlags, weighIns: sc.weighIns, expenditure: null, unit: "kg" }, { today: sc.today, tz: "UTC" });
    const c = r.items[0];
    const lift = referenceLift(sc.workouts, "kg", { today: sc.today, tz: "UTC" });
    const s = connectionSubject(c, r, lift, "kg");
    expect(s.kind).toBe("connection");
    expect(s.title).toBe(c.label);
    expect(s.facts.length).toBeLessThanOrEqual(ASK_MAX_FACTS);
    for (const f of s.facts) expect(f.length).toBeLessThanOrEqual(ASK_FACT_MAX_CHARS);
    expect(s.facts[0]).toContain(`${c.high.sessions} sessions after ${c.high.value}`);
    expect(s.facts.join(" ")).toContain(`${r.sessions} sessions`);
    expect(s.facts.join(" ")).not.toMatch(/\b(should|try|aim for|make sure)\b/i);
    expect(askPrompt(s)).toBe(`Why does Progress show "${c.label}"? Explain it from my numbers.`);
  });

  it("hands a finding over sentence by sentence, keeping decimals whole", () => {
    const sc = makeScenario({ seed: 4, days: 77, preDays: 21, startDate: "2026-07-01", bodyweightKg: 80, trueTdeeKcal: 2800, intake: "toTarget", goal: { ratePctPerWeek: 0.25, trainingStatus: "intermediate" }, sleep: { meanH: 7.6, sdH: 0.5, source: "manual", loggedShare: 0.95 }, lifts: [{ name: "Squat", startE1rm: 150, profile: "linear", changePct: 3, perWeek: 2, cv: 0.02 }], proteinShare: 0.15 });
    const f = findings({ weighIns: sc.weighIns, foodEntries: sc.foodEntries, dayFlags: sc.dayFlags, sleepNights: sc.sleepNights, goal: sc.goal, program: sc.program, profile: sc.profile, workouts: sc.workouts, unit: "kg" }, sc.today).find((x) => x.id === "protein-low")!;
    const s = findingSubject(f);
    expect(s.facts[0]).toBe(f.fact);
    expect(s.facts.at(-1)).toBe(`Studies: ${f.evidence}`);
    expect(s.facts.some((x) => /\d\.\d+ g per kg of body weight\.$/.test(x))).toBe(true);
    for (const x of s.facts) expect(x.length).toBeLessThanOrEqual(ASK_FACT_MAX_CHARS);
  });
});
