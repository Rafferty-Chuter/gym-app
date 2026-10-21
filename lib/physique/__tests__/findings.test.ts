import { describe, expect, it } from "vitest";
import { makeScenario, type LiftSpec, type ScenarioSpec } from "@/lib/physique/fixtures";
import { findings, liftProgress, restingEnergyKcal, type Finding } from "@/lib/physique/findings";

const lifts = (changePct: number, profile: "linear" | "step" = "linear", atDay = 49): LiftSpec[] => [
  { name: "Squat", startE1rm: 150, profile, changePct, atDay, perWeek: 2, cv: 0.02 },
  { name: "Bench Press", startE1rm: 110, profile, changePct, atDay, perWeek: 2, cv: 0.02 },
];
const goodSleep = { meanH: 7.6, sdH: 0.5, source: "manual" as const, loggedShare: 0.95 };
const base = { days: 77, preDays: 21, startDate: "2026-07-01", bodyweightKg: 85, trueTdeeKcal: 2800, seed: 4 };

function run(spec: ScenarioSpec): Finding[] {
  const sc = makeScenario(spec);
  return findings({ weighIns: sc.weighIns, foodEntries: sc.foodEntries, dayFlags: sc.dayFlags, sleepNights: sc.sleepNights, goal: sc.goal, program: sc.program, profile: sc.profile, workouts: sc.workouts, unit: "kg" }, sc.today);
}
const ids = (f: Finding[]) => f.map((x) => x.id);

describe("Findings (E1)", () => {
  it("resting energy is Mifflin-St Jeor, the lower equation when sex is not given", () => {
    expect(restingEnergyKcal(85, 180, 30, "M")).toBe(1830);
    expect(restingEnergyKcal(58, 160, 35, "F")).toBe(1244);
    expect(restingEnergyKcal(85, 180, 30, undefined)).toBe(1664);
  });

  it("says food is likely missing when a steady weight sits on less than resting energy, and holds back protein from that log", () => {
    const f = run({ ...base, intake: { meanKcal: 2800, sdKcal: 250 }, logShare: 0.6, goal: { ratePctPerWeek: -0.5, targetKg: 78 }, sleep: goodSleep, lifts: lifts(0), proteinShare: 0.2 });
    expect(ids(f)).toEqual(["underlog"]);
    expect(f[0].data).toMatch(/^Over the last 4 weeks you logged 1,\d{3} kcal a day and the weight trend (held|fell|rose) \([−+]?\d\.\d\d %\/wk\), which puts what you burn at about 1,\d{3} kcal a day\. Lying still all day, your body would use about [12],\d{3}: 1,\d{3} at rest plus about a tenth for digesting food\.$/);
    expect(f[0].evidence).toMatch(/Lichtman 1992/);
  });

  it("stays quiet for honest loggers: losing on 2,200, a small woman on 1,500, and someone logging 85%", () => {
    expect(run({ ...base, intake: { meanKcal: 2200, sdKcal: 250 }, goal: { ratePctPerWeek: -0.5, targetKg: 78 }, sleep: goodSleep, lifts: lifts(0) })).toEqual([]);
    expect(run({ ...base, bodyweightKg: 58, trueTdeeKcal: 1900, intake: { meanKcal: 1500, sdKcal: 200 }, goal: { ratePctPerWeek: -0.5, targetKg: 54 }, sleep: goodSleep, lifts: lifts(0), profile: { sex: "F", age: 35, heightCm: 160 } })).toEqual([]);
    expect(run({ ...base, intake: { meanKcal: 2800, sdKcal: 250 }, logShare: 0.85, goal: { ratePctPerWeek: -0.5, targetKg: 78 }, sleep: goodSleep, lifts: lifts(0) })).toEqual([]);
  });

  it("names short sleep with the lifts' own 8-week progress, and not when the lifts progress or sleep is fine", () => {
    const short = { meanH: 6.1, sdH: 0.5, source: "manual" as const, loggedShare: 0.95 };
    const cut = run({ ...base, intake: "toTarget", goal: { ratePctPerWeek: -0.5, targetKg: 78 }, sleep: short, lifts: lifts(-7, "step") });
    expect(ids(cut)).toContain("sleep-lifts");
    const s = cut.find((x) => x.id === "sleep-lifts")!;
    expect(s.data).toMatch(/^Sleep averaged 6h \d\dm over \d\d nights in the last 4 weeks, under the 7 hours adults need, and your main lifts (are down|include one that is down) over the last 8 weeks \(.+\)\.$/);
    expect(s.evidence).toMatch(/Nedeltcheva 2010/);
    const rising = run({ ...base, bodyweightKg: 80, intake: "toTarget", goal: { ratePctPerWeek: 0.25, trainingStatus: "intermediate" }, sleep: short, lifts: lifts(6) });
    expect(ids(rising)).not.toContain("sleep-lifts");
    const sleeps = run({ ...base, bodyweightKg: 80, intake: "toTarget", goal: { ratePctPerWeek: 0.25, trainingStatus: "intermediate" }, sleep: goodSleep, lifts: lifts(0) });
    expect(ids(sleeps)).not.toContain("sleep-lifts");
  });

  it("reads protein against 1.8 g/kg on a cut and 1.6 otherwise", () => {
    const cut = run({ ...base, intake: "toTarget", goal: { ratePctPerWeek: -0.5, targetKg: 78 }, sleep: goodSleep, lifts: lifts(0), proteinShare: 0.16 });
    expect(cut.find((x) => x.id === "protein-low")?.evidence).toMatch(/Helms 2014/);
    const gain = run({ ...base, bodyweightKg: 80, intake: "toTarget", goal: { ratePctPerWeek: 0.25, trainingStatus: "intermediate" }, sleep: goodSleep, lifts: lifts(3), proteinShare: 0.15 });
    expect(gain.find((x) => x.id === "protein-low")?.evidence).toMatch(/Morton 2018/);
    expect(run({ ...base, intake: "toTarget", goal: { ratePctPerWeek: -0.5, targetKg: 78 }, sleep: goodSleep, lifts: lifts(0) })).toEqual([]);
  });

  it("reads the rate against the evidence: gaining too fast, and losing fast while lifts drop", () => {
    const gain = run({ ...base, bodyweightKg: 80, intake: "toTarget", intakeOffsetKcal: 600, goal: { ratePctPerWeek: 0.25, trainingStatus: "intermediate" }, sleep: goodSleep, lifts: lifts(3) });
    expect(ids(gain)).toEqual(["gain-fast"]);
    expect(gain[0].data).toMatch(/over the \d,\d{3} target\.$/);
    const cut = run({ ...base, intake: { meanKcal: 1700, sdKcal: 250 }, goal: { ratePctPerWeek: -1.0, targetKg: 75 }, sleep: goodSleep, lifts: lifts(-7, "step"), proteinShare: 0.42 });
    expect(ids(cut)).toEqual(["cut-fast-lifts"]);
    expect(cut[0].evidence).toMatch(/Garthe 2011/);
  });

  it("reads lift progress from a line through 8 weeks of sessions, silent below two lifts", () => {
    const sc = makeScenario({ ...base, intake: "toTarget", goal: { ratePctPerWeek: -0.5, targetKg: 78 }, sleep: goodSleep, lifts: lifts(-7, "step") });
    const p = liftProgress(sc.workouts, "kg", sc.today);
    expect(p).toHaveLength(2);
    for (const l of p!) expect(l.changePct).toBeLessThan(-3);
    expect(liftProgress(sc.workouts.slice(-4), "kg", sc.today)).toBeNull();
  });

  it("states data and evidence, never an instruction", () => {
    const all = [
      ...run({ ...base, intake: { meanKcal: 2800, sdKcal: 250 }, logShare: 0.6, goal: { ratePctPerWeek: -0.5, targetKg: 78 }, sleep: { meanH: 6.1, sdH: 0.5, source: "manual", loggedShare: 0.95 }, lifts: lifts(-7, "step") }),
      ...run({ ...base, bodyweightKg: 80, intake: "toTarget", intakeOffsetKcal: 600, goal: { ratePctPerWeek: 0.25, trainingStatus: "intermediate" }, sleep: goodSleep, lifts: lifts(3), proteinShare: 0.15 }),
    ];
    expect(all.length).toBeGreaterThan(2);
    for (const f of all) expect(`${f.title} ${f.data} ${f.evidence}`).not.toMatch(/\b(should|try|aim for|make sure|consider|you need to)\b|!/i);
  });
});

describe("Findings in a line (PR3d)", () => {
  const cutSpec: ScenarioSpec = { ...base, intake: { meanKcal: 1700, sdKcal: 250 }, goal: { ratePctPerWeek: -1.0, targetKg: 75 }, sleep: goodSleep, lifts: lifts(-7, "step"), proteinShare: 0.42 };
  const gainSpec: ScenarioSpec = { ...base, bodyweightKg: 80, intake: "toTarget", intakeOffsetKcal: 600, goal: { ratePctPerWeek: 0.25, trainingStatus: "intermediate" }, sleep: goodSleep, lifts: lifts(3), proteinShare: 0.15 };
  const sleepSpec: ScenarioSpec = { ...base, intake: { meanKcal: 2800, sdKcal: 250 }, logShare: 0.6, goal: { ratePctPerWeek: -0.5, targetKg: 78 }, sleep: { meanH: 6.1, sdH: 0.5, source: "manual", loggedShare: 0.95 }, lifts: lifts(-7, "step") };

  it("gives each finding one short fact, in kilos, and one sentence of evidence", () => {
    const all = [...run(cutSpec), ...run(gainSpec), ...run(sleepSpec)];
    expect(new Set(all.map((f) => f.id)).size).toBeGreaterThanOrEqual(4);
    for (const f of all) {
      expect(f.title.length).toBeLessThanOrEqual(40);
      expect(f.fact.length).toBeLessThanOrEqual(80);
      expect(f.fact).not.toMatch(/%\/wk/);
      expect(f.evidence.length).toBeLessThanOrEqual(170);
      expect(f.evidence).toMatch(/\(\D+ \d{4}\)\.$/);
      expect(`${f.title} ${f.fact} ${f.evidence}`).not.toMatch(/\b(should|try|aim for|make sure|consider|you need to)\b|!/i);
    }
  });

  it("states the rate in kilos a week and each lift's change in kilos", () => {
    const cut = run(cutSpec).find((f) => f.id === "cut-fast-lifts")!;
    expect(cut.fact).toMatch(/^Losing \d\.\d kg a week · (Squat|Bench Press) −\d+(\.5)? kg, (Squat|Bench Press) −\d+(\.5)? kg in 8 weeks$/);
    const gain = run(gainSpec).find((f) => f.id === "gain-fast")!;
    expect(gain.fact).toMatch(/^Gaining \d\.\d kg a week · studies: up to \d\.\d kg$/);
    const protein = run(gainSpec).find((f) => f.id === "protein-low")!;
    expect(protein.fact).toMatch(/^\d\.\d\d? g per kg a day · studies: 1\.6 or more$/);
  });

  it("follows the display unit", () => {
    const sc = makeScenario(cutSpec);
    const lb = findings({ weighIns: sc.weighIns, foodEntries: sc.foodEntries, dayFlags: sc.dayFlags, sleepNights: sc.sleepNights, goal: sc.goal, program: sc.program, profile: sc.profile, workouts: sc.workouts, unit: "lb" }, sc.today);
    expect(lb.find((f) => f.id === "cut-fast-lifts")!.fact).toMatch(/^Losing \d\.\d lb a week · .* lb in 8 weeks$/);
  });

  it("gives each lift's change in kilos as well as percent", () => {
    const sc = makeScenario({ ...base, intake: "toTarget", goal: { ratePctPerWeek: -0.5, targetKg: 78 }, sleep: goodSleep, lifts: lifts(-7, "step") });
    for (const l of liftProgress(sc.workouts, "kg", sc.today)!) expect(l.changeKg).toBeLessThan(-3);
  });
});
