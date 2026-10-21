import { describe, expect, it } from "vitest";
import { addDays } from "@/lib/dates";
import { DAY_TOTAL_LABEL, dailyLogCsv, dailyLogRecords, parseDailyLog, parseGoalLine } from "@/lib/import/dailyLog";
import { SAMPLE_DAYS, SAMPLE_PRE_DAYS, SAMPLE_WORKOUT_SUFFIX, sampleDailyLog, sampleWorkoutsCsv } from "@/lib/import/sample";
import { parseImportCsv } from "@/lib/csvImport";

const TODAY = "2026-10-18";
const NOW_ISO = "2026-10-18T09:00:00.000Z";
const none = { weighIns: [], foodEntries: [], sleepNights: [], steps: [] };

describe("daily-log CSV (I1)", () => {
  it("reads the goal line and every column, with blanks left out", () => {
    const text = [
      "# goal start=2026-09-01 target_kg=80 rate_pct_per_week=-0.6 training=advanced",
      "date,weight_kg,calories,protein_g,carbs_g,fat_g,fibre_g,bedtime,wake,asleep_min,steps",
      "2026-10-16,82.4,2300,170,230,70,28,23:10,07:05,440,9100",
      "2026-10-17,82.1,,,,,,,,,",
    ].join("\n");
    const p = parseDailyLog(text, TODAY);
    expect(p.goal).toEqual({ start: "2026-09-01", targetKg: 80, ratePctPerWeek: -0.6, training: "advanced" });
    expect(p.rows).toEqual([
      { date: "2026-10-16", weightKg: 82.4, kcal: 2300, proteinG: 170, carbsG: 230, fatG: 70, fibreG: 28, bedtime: "23:10", wake: "07:05", asleepMin: 440, steps: 9100 },
      { date: "2026-10-17", weightKg: 82.1 },
    ]);
    expect(p.issues).toEqual([]);
  });

  it("accepts other apps' column names, and drops future rows, bad dates and out-of-range values with a reason", () => {
    const text = ["Date,Weight,kcal,Protein,Fiber,Steps", "2026-10-17,82,2200,160,30,8000", "2026-10-19,82,2200,160,30,8000", "17/10/2026,82,,,,", "2026-10-16,8200,2200,160,30,8000"].join("\n");
    const p = parseDailyLog(text, TODAY);
    expect(p.rows.map((r) => r.date)).toEqual(["2026-10-16", "2026-10-17"]);
    expect(p.rows[0].weightKg).toBeUndefined();
    expect(p.rows[1]).toMatchObject({ weightKg: 82, kcal: 2200, proteinG: 160, fibreG: 30, steps: 8000 });
    expect(p.issues).toHaveLength(3);
    expect(parseGoalLine("# goal start=yesterday target_kg=80 rate_pct_per_week=-0.6")).toBeNull();
    expect(parseDailyLog("weight\n82", TODAY).issues[0]).toMatch(/date column/);
  });

  it("builds records with date ids and source import, and keeps a day the user logged themselves", () => {
    const rows = parseDailyLog("date,weight_kg,calories,protein_g,bedtime,wake,steps\n2026-10-16,82.4,2300,170,23:00,07:00,9000\n2026-10-17,82.1,2250,165,,,", TODAY).rows;
    const own = { ...none, weighIns: [{ id: "mine", date: "2026-10-17", loggedAt: NOW_ISO, source: "manual" as const, schemaVersion: 1 as const, kg: 82 }] };
    const r = dailyLogRecords(rows, own, NOW_ISO);
    expect(r.weighIns.map((w) => [w.id, w.source])).toEqual([["imp-w-2026-10-16", "import"]]);
    expect(r.kept.weight).toBe(1);
    expect(r.foodEntries[0]).toMatchObject({ id: "imp-f-2026-10-16", label: DAY_TOTAL_LABEL, kcal: 2300, proteinG: 170, carbsG: 0, method: "quick" });
    // Hours asleep from bed and wake when not given: in bed less the minutes to drop off.
    expect(r.sleepNights[0]).toMatchObject({ id: "imp-n-2026-10-16", bedtime: "23:00", wakeTime: "07:00", inBedMin: 480, asleepMin: 460 });
    expect(r.steps).toHaveLength(1);
    // A second import of the same days never doubles: a day held unchanged is left as it is (TR7), a new one is added.
    const again = dailyLogRecords(rows, { ...none, weighIns: r.weighIns }, NOW_ISO);
    expect(again.weighIns.map((w) => w.id)).toEqual(["imp-w-2026-10-17"]);
    expect(again.same.weight).toBe(1);
  });

  it("writes the format it reads", () => {
    const { rows, goal } = parseDailyLog("# goal start=2026-09-01 target_kg=80 rate_pct_per_week=-0.6\ndate,weight_kg,calories\n2026-10-16,82.4,2300", TODAY);
    expect(parseDailyLog(dailyLogCsv(rows, goal), TODAY)).toEqual({ rows, goal, issues: [] });
  });
});

describe("sample files (I1)", () => {
  it("eleven weeks ending today: weight and sleep through today, food and steps through yesterday, a cut that began eight weeks ago", () => {
    const s = sampleDailyLog(TODAY);
    const p = parseDailyLog(s.csv, TODAY);
    expect(p.issues).toEqual([]);
    expect(p.rows[0].date).toBe(addDays(TODAY, -(SAMPLE_DAYS - 1)));
    expect(p.rows.at(-1)!.date).toBe(TODAY);
    expect(p.goal).toEqual({ start: addDays(TODAY, -(SAMPLE_DAYS - 1 - SAMPLE_PRE_DAYS)), targetKg: 80, ratePctPerWeek: -0.6, training: "intermediate" });
    const last = p.rows.at(-1)!;
    expect(last.weightKg).toBeDefined();
    expect(last.kcal).toBeUndefined();
    expect(last.steps).toBeUndefined();
    expect(p.rows.filter((r) => r.kcal != null).length).toBeGreaterThanOrEqual(SAMPLE_DAYS - 3);
    expect(p.rows.filter((r) => r.fibreG != null).every((r) => r.fibreG! > 10 && r.fibreG! < 60)).toBe(true);
    const first = p.rows.find((r) => r.weightKg != null)!.weightKg!;
    expect(first).toBeGreaterThan(83);
    expect(last.weightKg!).toBeLessThan(first);
    // The same file on the same day.
    expect(sampleDailyLog(TODAY).csv).toBe(s.csv);
  });

  it("the workouts are Strong's format and import through the ordinary path", () => {
    const w = parseImportCsv(sampleWorkoutsCsv(TODAY), { format: "strong", targetUnit: "kg", sourceUnit: "kg" });
    expect(w.ok).toBe(true);
    if (!w.ok) return;
    expect(w.workouts.length).toBeGreaterThanOrEqual(38);
    expect(w.workouts.every((x) => (x.name ?? "").endsWith(SAMPLE_WORKOUT_SUFFIX))).toBe(true);
    const bench = w.workouts.flatMap((x) => x.exercises).find((e) => e.name === "Bench Press");
    expect(bench?.sets).toHaveLength(3);
    expect(Number(bench?.sets[0].weight)).toBeGreaterThan(70);
  });
});
