"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import { useUnit } from "@/lib/unit-preference";
import {
  commitImportedWorkouts,
  parseImportCsv,
  type CommitMode,
  type ImportableWorkout,
  type ParseResult,
} from "@/lib/csvImport";

type FormatChoice = "auto" | "hevy" | "strong";

function formatDate(iso: string): string {
  try {
    const d = new Date(iso);
    return d.toLocaleDateString(undefined, { year: "numeric", month: "short", day: "numeric" });
  } catch {
    return iso;
  }
}

export default function ImportCsvPage() {
  const { unit } = useUnit();
  const [text, setText] = useState("");
  const [formatChoice, setFormatChoice] = useState<FormatChoice>("auto");
  const [mode, setMode] = useState<CommitMode>("append");
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

  return (
    <main className="min-h-screen bg-zinc-950 text-white p-6 pb-28">
      <div className="mx-auto max-w-2xl">
        <Link href="/profile" className="text-sm font-medium text-app-secondary hover:text-white transition-colors">
          ← Profile
        </Link>
        <h1 className="mt-2 text-3xl font-bold text-white">Import CSV</h1>
        <p className="mt-1 text-sm text-app-secondary">
          Bring in workout history from Hevy or Strong. Paste the CSV or pick a file.
        </p>

        <section className="mt-6 rounded-2xl border border-zinc-700/80 bg-zinc-900/60 p-5">
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            <div>
              <label className="text-xs font-semibold uppercase tracking-wide text-zinc-400">Format</label>
              <select
                value={formatChoice}
                onChange={(e) => setFormatChoice(e.target.value as FormatChoice)}
                className="mt-1.5 w-full rounded-lg border border-zinc-700 bg-zinc-950 px-3 py-2 text-sm text-white"
              >
                <option value="auto">Auto-detect</option>
                <option value="hevy">Hevy</option>
                <option value="strong">Strong</option>
              </select>
            </div>
            <div>
              <label className="text-xs font-semibold uppercase tracking-wide text-zinc-400">Mode</label>
              <select
                value={mode}
                onChange={(e) => setMode(e.target.value as CommitMode)}
                className="mt-1.5 w-full rounded-lg border border-zinc-700 bg-zinc-950 px-3 py-2 text-sm text-white"
              >
                <option value="append">Append (skip duplicates)</option>
                <option value="replace">Replace all history</option>
              </select>
            </div>
          </div>

          <p className="mt-3 text-[11px] text-zinc-500">
            Weights will be saved in <span className="font-semibold text-zinc-300">{unit}</span> (matches your current unit). Change it from Profile if needed.
          </p>

          <div className="mt-4 flex flex-wrap items-center gap-3">
            <label className="inline-flex cursor-pointer items-center gap-2 rounded-lg border border-zinc-700 bg-zinc-950 px-3 py-2 text-sm text-zinc-200 hover:border-teal-500/50">
              <span>Choose file</span>
              <input type="file" accept=".csv,text/csv" onChange={handleFile} className="hidden" />
            </label>
            <span className="text-xs text-zinc-500">or paste below</span>
          </div>

          <textarea
            value={text}
            onChange={(e) => {
              setText(e.target.value);
              setParseResult(null);
              setStatus(null);
              setError(null);
            }}
            rows={10}
            placeholder="Paste CSV here…"
            className="mt-3 block w-full rounded-lg border border-zinc-700 bg-zinc-950 px-3 py-2 font-mono text-xs text-zinc-100"
          />

          <div className="mt-4 flex flex-wrap gap-2">
            <button
              type="button"
              onClick={handlePreview}
              className="rounded-lg border border-teal-500/40 bg-teal-950/40 px-4 py-2 text-sm font-bold text-teal-100 hover:bg-teal-900/50 transition-colors"
            >
              Preview
            </button>
            <button
              type="button"
              onClick={handleCommit}
              disabled={!parseResult || !parseResult.ok}
              className="rounded-lg border border-emerald-500/40 bg-emerald-950/40 px-4 py-2 text-sm font-bold text-emerald-100 hover:bg-emerald-900/50 disabled:cursor-not-allowed disabled:opacity-40 transition-colors"
            >
              {mode === "replace" ? "Replace history" : "Import"}
            </button>
          </div>

          {error && (
            <p className="mt-3 rounded-md border border-red-500/40 bg-red-950/30 px-3 py-2 text-xs text-red-200">
              {error}
            </p>
          )}
          {status && (
            <p className="mt-3 rounded-md border border-emerald-500/40 bg-emerald-950/30 px-3 py-2 text-xs text-emerald-100">
              {status}
            </p>
          )}
        </section>

        {parseResult?.ok && previewSummary && (
          <section className="mt-6 rounded-2xl border border-zinc-700/80 bg-zinc-900/60 p-5">
            <p className="text-xs font-semibold uppercase tracking-wide text-zinc-400">Preview</p>
            <p className="mt-1 text-sm text-white">
              {previewSummary.workouts} workout{previewSummary.workouts === 1 ? "" : "s"} ·{" "}
              {previewSummary.exercises} exercise entries · {previewSummary.sets} sets
            </p>
            <p className="mt-1 text-xs text-zinc-400">
              Range: {formatDate(previewSummary.first)} → {formatDate(previewSummary.last)} · Format:{" "}
              <span className="font-semibold text-zinc-200">{parseResult.format}</span>
              {parseResult.skippedRows > 0 && (
                <> · Skipped {parseResult.skippedRows} unusable row{parseResult.skippedRows === 1 ? "" : "s"} (warmups, missing data)</>
              )}
            </p>

            <div className="mt-4 space-y-2">
              <p className="text-[11px] font-semibold uppercase tracking-wide text-zinc-500">
                Latest {sampleWorkouts.length} session{sampleWorkouts.length === 1 ? "" : "s"}
              </p>
              {sampleWorkouts.map((w, i) => (
                <div key={i} className="rounded-md border border-zinc-800 bg-black/30 px-3 py-2">
                  <div className="flex items-baseline justify-between gap-2">
                    <p className="text-sm font-semibold text-white">
                      {w.name?.trim() || "Untitled session"}
                    </p>
                    <p className="text-[11px] tabular-nums text-zinc-500">{formatDate(w.completedAt)}</p>
                  </div>
                  <p className="mt-0.5 text-[11px] text-zinc-500">
                    {w.exercises.length} exercise{w.exercises.length === 1 ? "" : "s"} ·{" "}
                    {w.exercises.reduce((s, e) => s + e.sets.length, 0)} sets
                  </p>
                </div>
              ))}
            </div>
          </section>
        )}
      </div>
    </main>
  );
}
