"use client";

import { useMemo, useState } from "react";
import PageHeader from "@/components/ui/PageHeader";
import { Caption, ErrorLine, PrimaryButton, Row, RowGroup } from "@/components/physique/ui";
import { useUnit } from "@/lib/unit-preference";
import {
  commitImportedWorkouts,
  parseImportCsv,
  type CommitMode,
  type ImportableWorkout,
  type ParseResult,
} from "@/lib/csvImport";
import { weighInsRepo } from "@/lib/physique/io/repos";
import DailyLogImport from "@/components/import/DailyLogImport";

type FormatChoice = "auto" | "hevy" | "strong" | "repcount";

function formatDate(iso: string): string {
  try {
    const d = new Date(iso);
    return d.toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "numeric" });
  } catch {
    return iso;
  }
}

export default function ImportCsvPage() {
  const { unit } = useUnit();
  const [text, setText] = useState("");
  const [formatChoice, setFormatChoice] = useState<FormatChoice>("auto");
  const [mode, setMode] = useState<CommitMode>("append");
  const [sourceUnit, setSourceUnit] = useState<"kg" | "lb">("kg");
  const [parseResult, setParseResult] = useState<ParseResult | null>(null);
  const [status, setStatus] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  function handleFile(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = () => {
      const result = reader.result;
      if (typeof result === "string") {
        setText(result);
        setParseResult(null);
        setStatus(null);
        setError(null);
      }
    };
    reader.readAsText(file);
  }

  function handlePreview() {
    setStatus(null);
    setError(null);
    if (!text.trim()) {
      setError("Paste CSV or choose a file first.");
      setParseResult(null);
      return;
    }
    const result = parseImportCsv(text, {
      format: formatChoice === "auto" ? undefined : formatChoice,
      targetUnit: unit,
      sourceUnit,
    });
    setParseResult(result);
    if (!result.ok) setError(result.error);
  }

  function handleCommit() {
    if (!parseResult || !parseResult.ok) return;
    if (mode === "replace") {
      const ok = window.confirm(
        "Replace will delete ALL existing workout history and substitute the imported data. Continue?"
      );
      if (!ok) return;
    }
    try {
      const r = commitImportedWorkouts(parseResult.workouts, mode);
      if (parseResult.weighIns.length > 0) {
        // Bodyweights the file carried become weigh-ins; a re-import replaces the same day's import.
        void weighInsRepo.bulkUpsert(
          parseResult.weighIns.map((w) => ({ id: `import-w-${w.date}`, date: w.date, loggedAt: `${w.date}T08:00:00.000Z`, source: "import" as const, schemaVersion: 1 as const, kg: w.kg }))
        );
      }
      setStatus(
        mode === "replace"
          ? `Replaced history. ${r.written} workouts saved (total ${r.total}).`
          : `Imported ${r.written} workout${r.written === 1 ? "" : "s"}` +
              (r.duplicatesSkipped > 0
                ? `, skipped ${r.duplicatesSkipped} duplicate${r.duplicatesSkipped === 1 ? "" : "s"}`
                : "") +
              `. Total now ${r.total}.`
      );
      setText("");
      setParseResult(null);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to save imported workouts.");
    }
  }

  const previewSummary = useMemo(() => {
    if (!parseResult || !parseResult.ok) return null;
    const ws = parseResult.workouts;
    if (ws.length === 0) return null;
    const setsTotal = ws.reduce(
      (sum, w) => sum + w.exercises.reduce((s, e) => s + e.sets.length, 0),
      0
    );
    const exercisesTotal = ws.reduce((sum, w) => sum + w.exercises.length, 0);
    const dates = ws.map((w) => new Date(w.completedAt).getTime()).sort((a, b) => a - b);
    return {
      workouts: ws.length,
      exercises: exercisesTotal,
      sets: setsTotal,
      first: new Date(dates[0]).toISOString(),
      last: new Date(dates[dates.length - 1]).toISOString(),
    };
  }, [parseResult]);

  const sampleWorkouts: ImportableWorkout[] = useMemo(() => {
    if (!parseResult || !parseResult.ok) return [];
    return parseResult.workouts.slice(-5).reverse();
  }, [parseResult]);

  const selectClass = "h-9 max-w-[200px] rounded-[10px] px-2 text-[13px] outline-none";
  const selectStyle = { background: "var(--surface-raised)", color: "var(--text)", border: "1px solid var(--border)" };

  return (
    <main className="min-h-screen pb-28" style={{ background: "var(--page)", color: "var(--text)" }}>
      <div className="mx-auto flex max-w-2xl flex-col gap-5 px-5 sm:px-6">
        <PageHeader back={{ href: "/profile", label: "Profile" }} title="Import" />

        <DailyLogImport />

        <section className="flex flex-col gap-2" aria-label="File settings">
          <Caption>Workouts</Caption>
          <p className="text-[12px]" style={{ color: "var(--text-tertiary)" }}>
            History from Hevy, Strong or Rep Count. Pick the file or paste the CSV.
          </p>
          <RowGroup>
            <Row
              label="Format"
              value={
                <select value={formatChoice} onChange={(e) => setFormatChoice(e.target.value as FormatChoice)} className={selectClass} style={selectStyle} aria-label="Format">
                  <option value="auto">Auto-detect</option>
                  <option value="hevy">Hevy</option>
                  <option value="strong">Strong</option>
                  <option value="repcount">Rep Count</option>
                </select>
              }
            />
            {(formatChoice === "repcount" || formatChoice === "auto") && (
              <Row
                label="Weights in the file"
                sub="Rep Count only. Hevy and Strong say their unit."
                value={
                  <select value={sourceUnit} onChange={(e) => setSourceUnit(e.target.value as "kg" | "lb")} className={selectClass} style={selectStyle} aria-label="Weights in the file are">
                    <option value="kg">kg</option>
                    <option value="lb">lb</option>
                  </select>
                }
              />
            )}
            <Row
              label="Mode"
              value={
                <select value={mode} onChange={(e) => setMode(e.target.value as CommitMode)} className={selectClass} style={selectStyle} aria-label="Mode">
                  <option value="append">Append, skip duplicates</option>
                  <option value="replace">Replace all history</option>
                </select>
              }
            />
          </RowGroup>
          <p className="text-[11px]" style={{ color: "var(--text-tertiary)" }}>
            Weights are saved in {unit}, your current unit. Change it under Profile first if the file uses the other.
          </p>
        </section>

        <section className="flex flex-col gap-2" aria-label="CSV">
          <div className="flex items-center gap-3">
            <label className="inline-flex h-9 cursor-pointer items-center rounded-full px-4 text-[13px] font-semibold" style={{ background: "var(--surface-raised)", color: "var(--text)" }}>
              Choose file
              <input type="file" accept=".csv,text/csv" onChange={handleFile} className="hidden" />
            </label>
            <span className="text-[12px]" style={{ color: "var(--text-tertiary)" }}>
              or paste below
            </span>
          </div>
          <textarea
            value={text}
            onChange={(e) => {
              setText(e.target.value);
              setParseResult(null);
              setStatus(null);
              setError(null);
            }}
            rows={8}
            placeholder="Paste the CSV here"
            className="w-full rounded-[12px] px-3 py-2.5 font-mono text-[12px] outline-none focus:ring-1"
            style={{ background: "var(--surface-raised)", color: "var(--text)", border: "1px solid var(--border)" }}
            aria-label="CSV text"
          />
          {parseResult?.ok ? (
            <PrimaryButton onClick={handleCommit}>{mode === "replace" ? "Replace history" : "Import"}</PrimaryButton>
          ) : (
            <PrimaryButton onClick={handlePreview} disabled={!text.trim()}>
              Preview
            </PrimaryButton>
          )}
          <ErrorLine text={error} />
          {status && (
            <p className="text-[13px]" style={{ color: "var(--status-good)" }} aria-live="polite">
              {status}
            </p>
          )}
        </section>

        {parseResult?.ok && previewSummary && (
          <section className="flex flex-col gap-2" aria-label="Preview">
            <Caption>Preview</Caption>
            <RowGroup>
              <Row label="Workouts" sub={`${previewSummary.exercises} exercise entries · ${previewSummary.sets} sets`} value={previewSummary.workouts} />
              <Row label="Range" value={`${formatDate(previewSummary.first)} to ${formatDate(previewSummary.last)}`} />
              <Row
                label="Format"
                sub={
                  parseResult.skippedRows > 0
                    ? `Skipped ${parseResult.skippedRows} ${parseResult.skippedRows === 1 ? "row" : "rows"} ${parseResult.format === "repcount" ? "with no reps logged (planned sets)" : "(warm-ups, missing data)"}`
                    : undefined
                }
                value={parseResult.format === "repcount" ? "Rep Count" : parseResult.format === "hevy" ? "Hevy" : parseResult.format === "strong" ? "Strong" : parseResult.format}
              />
            </RowGroup>
            <Caption>
              Latest {sampleWorkouts.length} {sampleWorkouts.length === 1 ? "session" : "sessions"}
            </Caption>
            <RowGroup>
              {sampleWorkouts.map((w, i) => (
                <Row key={`${w.completedAt}-${i}`} label={w.name?.trim() || "Untitled session"} sub={`${w.exercises.length} ${w.exercises.length === 1 ? "exercise" : "exercises"} · ${w.exercises.reduce((t, e) => t + e.sets.length, 0)} sets`} value={<span className="text-[13px] font-medium" style={{ color: "var(--text-secondary)" }}>{formatDate(w.completedAt)}</span>} />
              ))}
            </RowGroup>
          </section>
        )}
      </div>
    </main>
  );
}
