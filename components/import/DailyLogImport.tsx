"use client";

import { useMemo, useState } from "react";
import { Caption, ErrorLine, PrimaryButton, Row, RowGroup, SecondaryButton } from "@/components/physique/ui";
import { longLocalDate } from "@/components/charts/TimeSeriesChart";
import { useNow } from "@/lib/ui/useToday";
import { useUnit } from "@/lib/unit-preference";
import { useBodyData } from "@/lib/physique/io/bodyData";
import { useWorkouts } from "@/lib/physique/io/workouts";
import { commitDailyLog, commitWorkoutImport, removeImportedData } from "@/lib/physique/io/dailyLogImport";
import { dailyLogRecords, parseDailyLog, type DailyLogParse } from "@/lib/import/dailyLog";
import { SAMPLE_WORKOUT_SUFFIX, sampleDailyLog, sampleWorkoutsCsv } from "@/lib/import/sample";
import { commitImportedWorkouts, parseImportCsv, workoutFormatOf, type ParseResult } from "@/lib/csvImport";
import { isMacroFactorWorkbook, macroFactorCsvKind, macroFactorFoodLogDays, macroFactorWorkbookDays } from "@/lib/import/macroFactor";
import { looksLikeZip, readXlsx } from "@/lib/import/xlsx";
import { formatWeight } from "@/lib/units";

const APP_NAME = { hevy: "Hevy", strong: "Strong", repcount: "Rep Count" } as const;
const shortDate = (iso: string) => new Date(iso).toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "numeric" });

const FORMAT_LINE = "date, weight_kg, calories, protein_g, carbs_g, fat_g, fibre_g, bedtime, wake, asleep_min, steps";
const ACCEPT = ".csv,.xlsx,text/csv,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet";

const plural = (n: number, one: string, many = `${one}s`) => `${n} ${n === 1 ? one : many}`;

function download(name: string, text: string) {
  const url = URL.createObjectURL(new Blob([text], { type: "text/csv" }));
  const a = document.createElement("a");
  a.href = url;
  a.download = name;
  a.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

/**
 * Profile → Import, the daily log and the sample (I1): days of weight,
 * food totals, sleep and steps from a CSV, an optional goal line set as
 * starting on its own date, and eleven weeks of sample data to try the app
 * with. A MacroFactor export (the .xlsx workbook, or its food log) is read
 * into the same days (TR7). A chosen file is previewed straight away. Days
 * the user logged themselves are kept, days already imported are left as
 * they are, and everything imported can be removed in one go.
 */
export default function DailyLogImport() {
  const now = useNow();
  const { unit: rawUnit } = useUnit();
  const unit = rawUnit === "lb" ? "lb" : "kg";
  const data = useBodyData();
  const workouts = useWorkouts();
  const [text, setText] = useState("");
  const [fromSample, setFromSample] = useState(false);
  const [parsed, setParsed] = useState<DailyLogParse | null>(null);
  // TR7: where the days came from when it wasn't the daily-log format, and the chosen file's name.
  const [origin, setOrigin] = useState<string | null>(null);
  const [fileName, setFileName] = useState<string | null>(null);
  // C7: a Hevy, Strong or Rep Count export put in this box is read as workouts.
  const [workoutFile, setWorkoutFile] = useState<Extract<ParseResult, { ok: true }> | null>(null);
  const [setGoal, setSetGoal] = useState(true);
  const [safety, setSafety] = useState<boolean | null>(null);
  const [busy, setBusy] = useState(false);
  const [status, setStatus] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const imported = useMemo(
    () => [data.weighIns, data.foodEntries, data.sleepNights, data.steps].some((xs) => xs.some((x) => x.source === "import")) || workouts.some((w) => (w.name ?? "").endsWith(SAMPLE_WORKOUT_SUFFIX)),
    [data, workouts]
  );
  const preview = useMemo(() => {
    if (!parsed || parsed.rows.length === 0) return null;
    const recs = dailyLogRecords(parsed.rows, { weighIns: data.weighIns, foodEntries: data.foodEntries, sleepNights: data.sleepNights, steps: data.steps }, new Date().toISOString());
    return { recs, first: parsed.rows[0].date, last: parsed.rows[parsed.rows.length - 1].date };
  }, [parsed, data]);

  function reset(next: string, sample = false, name: string | null = null) {
    setText(next);
    setFromSample(sample);
    setFileName(name);
    setParsed(null);
    setOrigin(null);
    setWorkoutFile(null);
    setStatus(null);
    setError(null);
  }

  async function readFile(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    // Let the same file be chosen again after an import.
    e.target.value = "";
    if (!file || !now) return;
    const bytes = new Uint8Array(await file.arrayBuffer());
    if (!looksLikeZip(bytes)) {
      const csv = new TextDecoder().decode(bytes);
      reset(csv, false, file.name);
      runPreview(csv);
      return;
    }
    reset("", false, file.name);
    try {
      const wb = await readXlsx(bytes);
      if (!isMacroFactorWorkbook(wb.sheetNames)) {
        setError("That spreadsheet isn't a MacroFactor export. Other files need to be a CSV in the format above.");
        return;
      }
      const p = await macroFactorWorkbookDays(wb, now.today);
      showDays(p, "MacroFactor");
    } catch {
      setError("Couldn't read that file. A MacroFactor export is the .xlsx from More, Data Management, Data Export.");
    }
  }

  function showDays(p: DailyLogParse, from: string | null) {
    setParsed(p);
    setOrigin(from);
    setError(p.rows.length === 0 ? (p.issues.at(-1) ?? "No days found in that file.") : null);
  }

  function runPreview(source = text) {
    if (!now) return;
    const mf = macroFactorCsvKind(source);
    if (mf === "workout-log") {
      setParsed(null);
      setError("That's MacroFactor's workout log, which isn't read here. Its .xlsx export brings your food and weight; workouts come in from Hevy, Strong or Rep Count.");
      return;
    }
    if (mf === "food-log") return showDays(macroFactorFoodLogDays(source, now.today), "MacroFactor food log");
    const fmt = workoutFormatOf(source);
    if (fmt) {
      const w = parseImportCsv(source, { format: fmt, targetUnit: unit, sourceUnit: unit });
      setParsed(null);
      setWorkoutFile(w.ok && w.workouts.length > 0 ? w : null);
      setError(!w.ok ? w.error : w.workouts.length === 0 ? `No workouts found in that ${APP_NAME[fmt]} file.` : null);
      return;
    }
    const p = parseDailyLog(source, now.today);
    setParsed(p);
    setOrigin(null);
    setError(p.rows.length === 0 ? (p.issues[0] ?? "No days found in that file.") : null);
  }

  function loadSample() {
    if (!now) return;
    const s = sampleDailyLog(now.today).csv;
    reset(s, true);
    runPreview(s);
  }

  async function runImport() {
    if (!parsed || !now || busy) return;
    setBusy(true);
    setError(null);
    try {
      const out = await commitDailyLog(parsed, { setGoal: !!parsed.goal && setGoal, pregnantOrEdHistory: safety, now, unit, nowIso: new Date().toISOString() });
      let workoutsLine = "";
      if (fromSample) {
        const w = parseImportCsv(sampleWorkoutsCsv(now.today), { format: "strong", targetUnit: unit, sourceUnit: "kg" });
        if (w.ok) workoutsLine = ` · ${commitImportedWorkouts(w.workouts, "append").written} workouts`;
      }
      const c = out.counts;
      const goalLine = out.goal === "set" ? " Goal set." : out.goal ? ` ${out.goal}` : "";
      const parts = [c.weighIns && plural(c.weighIns, "weigh-in"), c.food && plural(c.food, "food day"), c.nights && plural(c.nights, "night"), c.steps && plural(c.steps, "step day")].filter(Boolean).join(", ");
      const from = origin ? ` from ${origin}` : "";
      const lead = parts ? `Imported ${parts}${workoutsLine}${from}.` : `Nothing new${from}.`;
      const same = out.sameDays ? ` ${plural(out.sameDays, "day was", "days were")} already here.` : "";
      setStatus(`${lead}${same}${out.kept ? ` Kept your own logs on ${plural(out.kept, "day")}.` : ""}${goalLine}`);
      setText("");
      setParsed(null);
      setOrigin(null);
      setFileName(null);
      setFromSample(false);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Couldn't save the import.");
    } finally {
      setBusy(false);
    }
  }

  async function importWorkouts() {
    if (!workoutFile || busy) return;
    setBusy(true);
    setError(null);
    try {
      const r = await commitWorkoutImport(workoutFile.workouts, workoutFile.weighIns, "append");
      setStatus(`Imported ${r.written} workout${r.written === 1 ? "" : "s"} from ${APP_NAME[workoutFile.format]}${r.duplicatesSkipped ? `, ${r.duplicatesSkipped} already there` : ""}.`);
      setText("");
      setFileName(null);
      setWorkoutFile(null);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Couldn't save the workouts.");
    } finally {
      setBusy(false);
    }
  }

  async function remove() {
    if (busy || !window.confirm("Remove every imported day, the sample workouts and any goal an import set? Your own logs stay.")) return;
    setBusy(true);
    try {
      await removeImportedData();
      setStatus("Imported data removed.");
    } catch (e) {
      setError(e instanceof Error ? e.message : "Couldn't remove it.");
    } finally {
      setBusy(false);
    }
  }

  const goal = parsed?.goal ?? null;
  const goalReady = !goal || !setGoal || safety !== null;
  const nothingNew = !!preview && preview.recs.days === 0 && !(goal && setGoal);

  return (
    <>
      <section className="flex flex-col gap-2" aria-label="Sample data">
        <Caption>Try it with sample data</Caption>
        <div className="flex flex-col gap-3 rounded-[16px] p-4" style={{ background: "var(--surface)" }}>
          <p className="text-[13px] leading-snug" style={{ color: "var(--text-secondary)" }}>
            Eleven weeks: three at maintenance, then a cut from 86 kg that began eight weeks ago, with daily weigh-ins, food totals, sleep and steps, and four workouts a week. Days you logged yourself are kept, and it all comes out again with one tap.
          </p>
          <div className="flex flex-wrap gap-2">
            <SecondaryButton small onClick={loadSample} disabled={!now || busy}>
              Load the sample
            </SecondaryButton>
            <SecondaryButton
              small
              disabled={!now}
              onClick={() => {
                if (!now) return;
                download("sample-daily-log.csv", sampleDailyLog(now.today).csv);
                download("sample-workouts-strong.csv", sampleWorkoutsCsv(now.today));
              }}
            >
              Download the files
            </SecondaryButton>
          </div>
        </div>
      </section>

      <section className="flex flex-col gap-2" aria-label="Daily log">
        <Caption>From MacroFactor or a daily log</Caption>
        <p className="text-[12px] leading-snug" style={{ color: "var(--text-tertiary)" }}>
          A MacroFactor export (the .xlsx from More, Data Management, Data Export) brings your food and weight history. A workout export from Hevy, Strong or Rep Count works here too.
        </p>
        <p className="text-[12px] leading-snug" style={{ color: "var(--text-tertiary)" }}>
          Or a CSV with one day per row: {FORMAT_LINE}. Any column but the date can be blank. A first line like <span className="font-mono">{"# goal start=2026-08-24 target_kg=80 rate_pct_per_week=-0.6"}</span> sets a goal from that date.
        </p>
        <div className="flex min-w-0 items-center gap-3">
          <label className="inline-flex h-9 shrink-0 cursor-pointer items-center rounded-full px-4 text-[13px] font-semibold" style={{ background: "var(--surface-raised)", color: "var(--text)" }}>
            Choose file
            <input type="file" accept={ACCEPT} onChange={(e) => void readFile(e)} className="hidden" />
          </label>
          <span className="truncate text-[12px]" style={{ color: "var(--text-tertiary)" }}>
            {fileName ?? "or paste below"}
          </span>
        </div>
        {/* While a chosen file's preview shows, the paste box steps aside; it is back after the import or if the file can't be read. */}
        {!(fileName && (preview || workoutFile)) && (
          <textarea
            value={text}
            onChange={(e) => reset(e.target.value)}
            rows={4}
            placeholder="Paste the daily log here"
            className="w-full rounded-[12px] px-3 py-2.5 font-mono text-[12px] outline-none focus:ring-1"
            style={{ background: "var(--surface-raised)", color: "var(--text)", border: "1px solid var(--border)" }}
            aria-label="Daily log CSV"
          />
        )}

        {preview && parsed && (
          <RowGroup>
            <Row label="Days" sub={`${origin ? `${origin} · ` : ""}${longLocalDate(preview.first)} to ${longLocalDate(preview.last)}`} value={parsed.rows.length} />
            <Row label="Weigh-ins" value={preview.recs.weighIns.length} />
            <Row label="Food days" sub={origin ? "Each as one day total, up to yesterday" : "Each as one day total"} value={preview.recs.foodEntries.length} />
            {(!origin || preview.recs.sleepNights.length > 0) && <Row label="Nights" value={preview.recs.sleepNights.length} />}
            <Row label="Step days" value={preview.recs.steps.length} />
            {fromSample && <Row label="Workouts" sub="Upper and lower, twice a week" value="Included" />}
            {preview.recs.kept.weight + preview.recs.kept.food + preview.recs.kept.sleep + preview.recs.kept.steps > 0 && <Row label="Kept" sub="Days you logged yourself are not overwritten" value={preview.recs.kept.weight + preview.recs.kept.food + preview.recs.kept.sleep + preview.recs.kept.steps} />}
            {preview.recs.sameDays > 0 && <Row label="Already here" sub="From an earlier import, left as they are" value={preview.recs.sameDays} />}
          </RowGroup>
        )}
        {workoutFile && (
          <RowGroup>
            <Row
              label="Workouts"
              sub={`From ${APP_NAME[workoutFile.format]} · ${shortDate(workoutFile.workouts.reduce((a, w) => (w.completedAt < a ? w.completedAt : a), workoutFile.workouts[0].completedAt))} to ${shortDate(workoutFile.workouts.reduce((a, w) => (w.completedAt > a ? w.completedAt : a), workoutFile.workouts[0].completedAt))}`}
              value={workoutFile.workouts.length}
            />
            <Row label="Sets" value={workoutFile.workouts.reduce((t, w) => t + w.exercises.reduce((u, e) => u + e.sets.length, 0), 0)} />
            {workoutFile.weighIns.length > 0 && <Row label="Weigh-ins" sub="Bodyweight the file carries" value={workoutFile.weighIns.length} />}
          </RowGroup>
        )}
        {preview && parsed && parsed.issues.length > 0 && (
          <ul className="flex flex-col gap-1 text-[12px]" style={{ color: "var(--status-watch)" }}>
            {parsed.issues.map((i) => (
              <li key={i}>{i}</li>
            ))}
          </ul>
        )}

        {preview && goal && (
          <div className="flex flex-col gap-3 rounded-[16px] p-4" style={{ background: "var(--surface)" }}>
            <div className="flex items-start justify-between gap-3">
              <span className="flex flex-col">
                <span className="text-[15px] font-semibold">Goal in the file</span>
                <span className="text-[12px]" style={{ color: "var(--text-secondary)" }}>
                  {formatWeight(goal.targetKg, unit)} at {goal.ratePctPerWeek > 0 ? "+" : "−"}
                  {Math.abs(goal.ratePctPerWeek).toFixed(2)} %/wk, from {longLocalDate(goal.start)}
                  {data.goal && !data.goal.completedAt ? ". Replaces your current goal." : "."}
                </span>
              </span>
              <button type="button" role="switch" aria-checked={setGoal} aria-label="Set this goal" onClick={() => setSetGoal(!setGoal)} className="relative h-7 w-12 shrink-0 rounded-full transition-colors" style={{ background: setGoal ? "var(--primary)" : "var(--border-strong)" }}>
                <span className="absolute top-0.5 h-6 w-6 rounded-full transition-transform" style={{ left: 2, background: setGoal ? "var(--text-on-primary)" : "var(--surface)", transform: setGoal ? "translateX(20px)" : "translateX(0)" }} />
              </button>
            </div>
            {setGoal && (
              <div className="flex items-center justify-between gap-3">
                <span className="text-[13px]">Are you pregnant, or have you had an eating disorder?</span>
                <div className="flex shrink-0 gap-1" role="radiogroup" aria-label="Pregnant or eating disorder history">
                  {[
                    { v: false, label: "No" },
                    { v: true, label: "Yes" },
                  ].map((o) => (
                    <button key={o.label} type="button" role="radio" aria-checked={safety === o.v} onClick={() => setSafety(o.v)} className="h-[30px] rounded-full px-3 text-[12px] font-medium" style={{ background: safety === o.v ? "var(--primary)" : "var(--surface-raised)", color: safety === o.v ? "var(--text-on-primary)" : "var(--text-secondary)" }}>
                      {o.label}
                    </button>
                  ))}
                </div>
              </div>
            )}
          </div>
        )}

        {workoutFile ? (
          <PrimaryButton onClick={() => void importWorkouts()} disabled={busy}>
            {busy ? "Importing" : `Import ${workoutFile.workouts.length} workouts`}
          </PrimaryButton>
        ) : preview ? (
          <PrimaryButton onClick={runImport} disabled={busy || !goalReady || nothingNew}>
            {busy ? "Importing" : nothingNew ? "Nothing new to import" : `Import ${plural(preview.recs.days, "day")}`}
          </PrimaryButton>
        ) : (
          <PrimaryButton onClick={() => runPreview()} disabled={!text.trim() || !now}>
            Preview
          </PrimaryButton>
        )}
        <ErrorLine text={error} />
        {status && (
          <p className="text-[13px]" style={{ color: "var(--status-good)" }} aria-live="polite">
            {status}
          </p>
        )}
        {imported && (
          <RowGroup>
            <Row label="Remove imported data" sub="Imported days, sample workouts and a goal an import set. Your own logs stay." value="" onClick={remove} ariaLabel="Remove imported data" />
          </RowGroup>
        )}
      </section>
    </>
  );
}
