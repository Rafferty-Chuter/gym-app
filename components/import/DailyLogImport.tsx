"use client";

import { useMemo, useState } from "react";
import { Caption, ErrorLine, PrimaryButton, Row, RowGroup, SecondaryButton } from "@/components/physique/ui";
import { longLocalDate } from "@/components/charts/TimeSeriesChart";
import { useNow } from "@/lib/ui/useToday";
import { useUnit } from "@/lib/unit-preference";
import { useBodyData } from "@/lib/physique/io/bodyData";
import { useWorkouts } from "@/lib/physique/io/workouts";
import { commitDailyLog, removeImportedData } from "@/lib/physique/io/dailyLogImport";
import { dailyLogRecords, parseDailyLog, type DailyLogParse } from "@/lib/import/dailyLog";
import { SAMPLE_WORKOUT_SUFFIX, sampleDailyLog, sampleWorkoutsCsv } from "@/lib/import/sample";
import { commitImportedWorkouts, parseImportCsv } from "@/lib/csvImport";
import { formatWeight } from "@/lib/units";

const FORMAT_LINE = "date, weight_kg, calories, protein_g, carbs_g, fat_g, fibre_g, bedtime, wake, asleep_min, steps";

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
 * with. Days the user logged themselves are kept, and everything imported
 * can be removed in one go.
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

  function reset(next: string, sample = false) {
    setText(next);
    setFromSample(sample);
    setParsed(null);
    setStatus(null);
    setError(null);
  }

  function readFile(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = () => typeof reader.result === "string" && reset(reader.result);
    reader.readAsText(file);
  }

  function runPreview(source = text) {
    if (!now) return;
    const p = parseDailyLog(source, now.today);
    setParsed(p);
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
      setStatus(`Imported ${c.weighIns} weigh-ins, ${c.food} food days, ${c.nights} nights, ${c.steps} step days${workoutsLine}.${out.kept ? ` Kept your own logs on ${out.kept} ${out.kept === 1 ? "day" : "days"}.` : ""}${goalLine}`);
      setText("");
      setParsed(null);
      setFromSample(false);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Couldn't save the import.");
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

  return (
    <>
      <section className="flex flex-col gap-2" aria-label="Sample data">
        <Caption>Try it with sample data</Caption>
        <div className="flex flex-col gap-3 rounded-[12px] p-4" style={{ background: "var(--surface)" }}>
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
        <Caption>Daily log</Caption>
        <p className="text-[12px] leading-snug" style={{ color: "var(--text-tertiary)" }}>
          One day per row: {FORMAT_LINE}. Any column but the date can be blank. A first line like <span className="font-mono">{"# goal start=2026-08-24 target_kg=80 rate_pct_per_week=-0.6"}</span> sets a goal from that date.
        </p>
        <div className="flex items-center gap-3">
          <label className="inline-flex h-9 cursor-pointer items-center rounded-full px-4 text-[13px] font-semibold" style={{ background: "var(--surface-raised)", color: "var(--text)" }}>
            Choose file
            <input type="file" accept=".csv,text/csv" onChange={readFile} className="hidden" />
          </label>
          <span className="text-[12px]" style={{ color: "var(--text-tertiary)" }}>
            or paste below
          </span>
        </div>
        <textarea
          value={text}
          onChange={(e) => reset(e.target.value)}
          rows={4}
          placeholder="Paste the daily log here"
          className="w-full rounded-[12px] px-3 py-2.5 font-mono text-[12px] outline-none focus:ring-1"
          style={{ background: "var(--surface-raised)", color: "var(--text)", border: "1px solid var(--border)" }}
          aria-label="Daily log CSV"
        />

        {preview && parsed && (
          <RowGroup>
            <Row label="Days" sub={`${longLocalDate(preview.first)} to ${longLocalDate(preview.last)}`} value={parsed.rows.length} />
            <Row label="Weigh-ins" value={preview.recs.weighIns.length} />
            <Row label="Food days" sub="Each as one day total" value={preview.recs.foodEntries.length} />
            <Row label="Nights" value={preview.recs.sleepNights.length} />
            <Row label="Step days" value={preview.recs.steps.length} />
            {fromSample && <Row label="Workouts" sub="Upper and lower, twice a week" value="Included" />}
            {preview.recs.kept.weight + preview.recs.kept.food + preview.recs.kept.sleep + preview.recs.kept.steps > 0 && <Row label="Kept" sub="Days you logged yourself are not overwritten" value={preview.recs.kept.weight + preview.recs.kept.food + preview.recs.kept.sleep + preview.recs.kept.steps} />}
          </RowGroup>
        )}
        {parsed && parsed.issues.length > 0 && (
          <ul className="flex flex-col gap-1 text-[12px]" style={{ color: "var(--status-watch)" }}>
            {parsed.issues.map((i) => (
              <li key={i}>{i}</li>
            ))}
          </ul>
        )}

        {preview && goal && (
          <div className="flex flex-col gap-3 rounded-[12px] p-4" style={{ background: "var(--surface)" }}>
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

        {preview ? (
          <PrimaryButton onClick={runImport} disabled={busy || !goalReady}>
            {busy ? "Importing" : `Import ${parsed?.rows.length ?? 0} days`}
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
