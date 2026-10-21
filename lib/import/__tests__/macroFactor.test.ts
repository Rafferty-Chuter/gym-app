import { describe, expect, it } from "vitest";
import { addDays } from "@/lib/dates";
import { readXlsx } from "@/lib/import/xlsx";
import { dailyLogRecords, DAY_TOTAL_LABEL, MAX_ROWS } from "@/lib/import/dailyLog";
import { isMacroFactorWorkbook, macroFactorCsvKind, macroFactorDays, macroFactorFoodLogDays, macroFactorWorkbookDays } from "@/lib/import/macroFactor";
import { macroFactorSampleTables, macroFactorSampleXlsx, MF_DAYS, MF_FIRST, MF_NO_WEIGH_IN, MF_TODAY, MF_TWO_WEIGH_INS, MF_UNLOGGED, serialOf } from "./macroFactorSample";

const NOW_ISO = "2026-10-18T09:00:00.000Z";
const none = { weighIns: [], foodEntries: [], sleepNights: [], steps: [] };

describe("MacroFactor workbook (TR7)", () => {
  it("is recognised by its sheets", async () => {
    const wb = await readXlsx(macroFactorSampleXlsx());
    expect(isMacroFactorWorkbook(wb.sheetNames)).toBe(true);
    expect(isMacroFactorWorkbook(["Sheet1"])).toBe(false);
  });

  it("maps each day to a food total and the day's first weigh-in, leaving out unlogged days and today's food", async () => {
    const p = await macroFactorWorkbookDays(await readXlsx(macroFactorSampleXlsx({ sharedStrings: true, compress: true })), MF_TODAY);
    const t = macroFactorSampleTables();
    expect(p.issues).toEqual([]);
    expect(p.goal).toBeNull();
    expect(p.rows[0].date).toBe(MF_FIRST);
    expect(p.rows.at(-1)!.date).toBe(MF_TODAY);
    // Food: every day but the unlogged one and today, with fibre from the micronutrients.
    const food = p.rows.filter((r) => r.kcal != null);
    expect(food).toHaveLength(MF_DAYS - 2);
    const first = t.macros[1];
    expect(p.rows[0]).toMatchObject({ kcal: first[1], proteinG: first[2], fatG: first[3], carbsG: first[4], fibreG: t.micros[1][2] });
    expect(p.rows.find((r) => r.date === MF_UNLOGGED)?.kcal).toBeUndefined();
    const today = p.rows.at(-1)!;
    expect(today.kcal).toBeUndefined();
    expect(today.steps).toBeUndefined();
    expect(today.weightKg).toBeDefined();
    // Weight: one a day, the first reading; a missed day has none.
    expect(p.rows.filter((r) => r.weightKg != null)).toHaveLength(MF_DAYS - 1);
    const twice = t.weight.filter((r) => r[0] === serialOf(MF_TWO_WEIGH_INS));
    expect(twice).toHaveLength(2);
    expect(p.rows.find((r) => r.date === MF_TWO_WEIGH_INS)!.weightKg).toBe(twice[0][1]);
    expect(p.rows.find((r) => r.date === MF_NO_WEIGH_IN)!.weightKg).toBeUndefined();
    expect(p.rows.filter((r) => r.steps != null)).toHaveLength(MF_DAYS - 1);
  });

  it("builds day-total food entries and weigh-ins; a second import of the same file adds nothing", () => {
    const p = macroFactorDays(macroFactorSampleTables(), { today: MF_TODAY });
    const r = dailyLogRecords(p.rows, none, NOW_ISO);
    expect(r.foodEntries).toHaveLength(MF_DAYS - 2);
    expect(r.foodEntries[0]).toMatchObject({ id: `imp-f-${MF_FIRST}`, label: DAY_TOTAL_LABEL, source: "import", method: "quick" });
    expect(r.weighIns).toHaveLength(MF_DAYS - 1);
    expect(r.days).toBe(MF_DAYS);
    const again = dailyLogRecords(p.rows, { weighIns: r.weighIns, foodEntries: r.foodEntries, sleepNights: [], steps: r.steps }, "2026-10-19T09:00:00.000Z");
    expect([again.weighIns, again.foodEntries, again.steps].map((x) => x.length)).toEqual([0, 0, 0]);
    expect(again.days).toBe(0);
    expect(again.sameDays).toBe(MF_DAYS);
    // A day edited in MacroFactor since replaces the earlier import of it.
    const edited = p.rows.map((row) => (row.date === MF_FIRST ? { ...row, kcal: 1999 } : row));
    const third = dailyLogRecords(edited, { weighIns: r.weighIns, foodEntries: r.foodEntries, sleepNights: [], steps: r.steps }, NOW_ISO);
    expect(third.foodEntries.map((f) => [f.id, f.kcal])).toEqual([[`imp-f-${MF_FIRST}`, 1999]]);
    expect(third.days).toBe(1);
  });

  it("reads the unit a column names, and drops what is out of range or undated", () => {
    const p = macroFactorDays(
      {
        macros: [["Date", "Energy (kJ)", "Protein (g)"], [serialOf("2026-10-01"), 9205, 150], ["2026-10-02", 0, 0], ["not a date", 2000, 100], [serialOf("2026-10-03"), 99999, 100]],
        weight: [["Date", "Weight (lbs)"], ["2026-10-01", 180], ["2026-10-02", 2000], ["2026-10-30", 180]],
      },
      { today: MF_TODAY }
    );
    expect(p.rows).toEqual([{ date: "2026-10-01", kcal: expect.closeTo(2200, 0), proteinG: 150, weightKg: 81.65 }]);
    expect(p.issues).toEqual(["1 row has no date that could be read and was skipped.", "1 day is after today and was skipped.", "2 values were out of range and left out."]);
  });

  it("reads slash dates only when the column says which way round they are", () => {
    const weight = (dates: string[]) => macroFactorDays({ weight: [["Date", "Weight (kg)"], ...dates.map((d) => [d, 80])] }, { today: MF_TODAY });
    expect(weight(["13/09/2026", "01/10/2026"]).rows.map((r) => r.date)).toEqual(["2026-09-13", "2026-10-01"]);
    expect(weight(["09/13/2026", "10/01/2026"]).rows.map((r) => r.date)).toEqual(["2026-09-13", "2026-10-01"]);
    // A day that doesn't exist is unreadable, not unclear.
    expect(weight(["13/09/2026", "31/02/2026"]).issues).toEqual(["1 row has no date that could be read and was skipped."]);
    const unclear = weight(["01/10/2026", "02/10/2026"]);
    expect(unclear.rows).toEqual([]);
    expect(unclear.issues[0]).toMatch(/day-first or month-first/);
  });

  it("keeps the latest days when a long history passes the cap", () => {
    const rows = Array.from({ length: MAX_ROWS + 30 }, (_, i) => [serialOf(addDays(MF_TODAY, -(MAX_ROWS + 30) + i)), 80]);
    const p = macroFactorDays({ weight: [["Date", "Weight (kg)"], ...rows] }, { today: MF_TODAY });
    expect(p.rows).toHaveLength(MAX_ROWS);
    expect(p.rows.at(-1)!.date).toBe(addDays(MF_TODAY, -1));
    expect(p.issues[0]).toMatch(/^Only the latest 800 days were read/);
  });
});

describe("MacroFactor CSVs (TR7)", () => {
  const foodLog = [
    "Date,Time,Food Name,Serving Size,Serving Qty,Serving Weight (g),Calories (kcal),Fat (g),Carbs (g),Protein (g)",
    "2026-10-16,08:05 AM,Oats,1 cup,1,80,300,6,54,10",
    '2026-10-16,01:10 PM,"Chicken, rice",1 bowl,1,400,650,15,70,55',
    "2026-10-17,09:00 AM,Eggs,2 large,2,100,140,10,1,12",
    "2026-10-18,09:00 AM,Toast,1 slice,1,40,100,1,18,4",
  ].join("\n");
  const workoutLog = "Date,Workout Duration,Workout,Exercise,Exercise Base Weight (kg),Set Type,Weight (kg),Reps,RIR\n2026-10-16,3600,Push,Bench Press,0,Standard,100,5,2";

  it("tells the food log from the workout log by the header", () => {
    expect(macroFactorCsvKind(foodLog)).toBe("food-log");
    expect(macroFactorCsvKind(workoutLog)).toBe("workout-log");
    expect(macroFactorCsvKind("date,weight_kg,calories\n2026-10-01,80,2000")).toBeNull();
  });

  it("adds a day's foods into one total, today left out", () => {
    const p = macroFactorFoodLogDays(foodLog, MF_TODAY);
    expect(p.rows).toEqual([
      { date: "2026-10-16", kcal: 950, fatG: 21, carbsG: 124, proteinG: 65 },
      { date: "2026-10-17", kcal: 140, fatG: 10, carbsG: 1, proteinG: 12 },
    ]);
    expect(p.issues).toEqual([]);
  });
});
