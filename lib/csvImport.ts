import type { CompletedWorkout } from "@/lib/workout-store";

export type ImportableWorkout = Omit<CompletedWorkout, "id" | "totalExercises" | "totalSets">;
export type CsvFormat = "hevy" | "strong" | "repcount" | "unknown";
export type Unit = "kg" | "lb";

/** A bodyweight the export carried alongside a session (Rep Count's Bodyweight column). */
export type ImportedWeighIn = { date: string; kg: number };

export type ParseResult =
  | { ok: true; format: Exclude<CsvFormat, "unknown">; workouts: ImportableWorkout[]; skippedRows: number; weighIns: ImportedWeighIn[] }
  | { ok: false; error: string };

const KG_PER_LB = 0.45359237;

function kgToLb(kg: number): number {
  return kg / KG_PER_LB;
}

function lbToKg(lb: number): number {
  return lb * KG_PER_LB;
}

function roundWeight(n: number): number {
  return Math.round(n * 100) / 100;
}

function rpeToRir(rpe: number | undefined): number | undefined {
  if (rpe === undefined || !Number.isFinite(rpe)) return undefined;
  if (rpe < 1 || rpe > 10) return undefined;
  return Math.max(0, Math.min(10, 10 - rpe));
}

/** Minimal CSV parser. Handles quoted fields with embedded commas, quotes ("") and newlines. Shared with the daily-log import (I1). */
export function parseCsv(text: string, separator: "," | ";" = ","): string[][] {
  const rows: string[][] = [];
  let row: string[] = [];
  let field = "";
  let inQuotes = false;
  let i = 0;

  while (i < text.length) {
    const c = text[i];
    if (inQuotes) {
      if (c === '"') {
        if (text[i + 1] === '"') {
          field += '"';
          i += 2;
          continue;
        }
        inQuotes = false;
        i += 1;
        continue;
      }
      field += c;
      i += 1;
      continue;
    }
    if (c === '"') {
      inQuotes = true;
      i += 1;
      continue;
    }
    if (c === separator) {
      row.push(field);
      field = "";
      i += 1;
      continue;
    }
    if (c === "\n" || c === "\r") {
      row.push(field);
      field = "";
      if (row.length > 1 || row[0] !== "") rows.push(row);
      row = [];
      if (c === "\r" && text[i + 1] === "\n") i += 2;
      else i += 1;
      continue;
    }
    field += c;
    i += 1;
  }
  if (field.length > 0 || row.length > 0) {
    row.push(field);
    if (row.length > 1 || row[0] !== "") rows.push(row);
  }
  return rows;
}

function pickSeparator(firstLine: string): "," | ";" {
  const semi = (firstLine.match(/;/g) ?? []).length;
  const comma = (firstLine.match(/,/g) ?? []).length;
  return semi > comma ? ";" : ",";
}

function normalizeHeader(h: string): string {
  return h.trim().toLowerCase().replace(/^"+|"+$/g, "");
}

export function detectFormat(headers: string[]): CsvFormat {
  const norm = headers.map(normalizeHeader);
  const has = (k: string) => norm.includes(k);
  if (has("start_time") && (has("weight_kg") || has("exercise_title"))) return "hevy";
  if (has("workout name") && has("exercise name") && has("set order")) return "strong";
  if (has("workout start") && has("exercise") && has("reps")) return "repcount";
  return "unknown";
}

/**
 * The workout app a CSV came from, read from its header row alone; null
 * when it is not a Hevy, Strong or Rep Count export. Lets the daily-log box
 * take a workout file instead of failing on its dates (C7).
 */
export function workoutFormatOf(text: string): Exclude<CsvFormat, "unknown"> | null {
  const first = text.replace(/^\uFEFF/, "").trim().split(/\r?\n/)[0] ?? "";
  if (!first) return null;
  const headers = parseCsv(first, pickSeparator(first))[0] ?? [];
  const f = detectFormat(headers);
  return f === "unknown" ? null : f;
}

/**
 * Rep Count dates are local wall-clock, "2026-10-16 18:34", with no zone.
 * Built with the Date constructor so the device's own timezone applies.
 */
function parseRepCountDate(s: string): string | null {
  const m = /^(\d{4})-(\d{2})-(\d{2})[ T](\d{2}):(\d{2})(?::(\d{2}))?$/.exec((s ?? "").trim());
  if (!m) return null;
  const d = new Date(Number(m[1]), Number(m[2]) - 1, Number(m[3]), Number(m[4]), Number(m[5]), Number(m[6] ?? 0));
  return Number.isNaN(d.getTime()) ? null : d.toISOString();
}

/**
 * Rep Count export: one row per set with Workout Start, Workout End,
 * Exercise, Weight, Reps, Notes, Kcal, Distance, Duration, Category, Name,
 * Bodyweight. Rows with neither weight nor reps are planned sets never
 * done and are skipped. Weights are in `sourceUnit` (the app's setting).
 */
function parseRepCount(rows: string[][], targetUnit: Unit, sourceUnit: Unit): { workouts: ImportableWorkout[]; weighIns: ImportedWeighIn[] } {
  if (rows.length === 0) return { workouts: [], weighIns: [] };
  const idx = indexer(rows[0]);
  const iStart = idx("workout start");
  const iEnd = idx("workout end");
  const iEx = idx("exercise");
  const iWeight = idx("weight");
  const iReps = idx("reps");
  const iNotes = idx("notes");
  const iName = idx("name");
  const iBw = idx("bodyweight");
  const groups = new Map<string, RowGroup>();
  const weighIns = new Map<string, ImportedWeighIn>();
  for (let r = 1; r < rows.length; r++) {
    const row = rows[r];
    if (!row || row.length <= Math.max(iStart, iEx, iReps)) continue;
    const startIso = parseRepCountDate(row[iStart] ?? "");
    if (!startIso) continue;
    const endIso = iEnd >= 0 ? parseRepCountDate(row[iEnd] ?? "") : null;
    const completedAt = endIso ?? startIso;
    const name = iName >= 0 ? (row[iName] ?? "").trim() : "";
    const groupKey = `${startIso}::${completedAt}::${name}`;
    let group = groups.get(groupKey);
    if (!group) {
      let durationSec: number | undefined;
      if (endIso) {
        const diff = (new Date(endIso).getTime() - new Date(startIso).getTime()) / 1000;
        if (diff > 0 && diff < 24 * 3600) durationSec = Math.round(diff);
      }
      group = { completedAt, name, durationSec, exercises: new Map() };
      groups.set(groupKey, group);
    }
    if (iBw >= 0) {
      const bw = Number((row[iBw] ?? "").trim());
      if (Number.isFinite(bw) && bw > 0) {
        const kg = sourceUnit === "lb" ? lbToKg(bw) : bw;
        weighIns.set(completedAt.slice(0, 10), { date: completedAt.slice(0, 10), kg: roundWeight(kg) });
      }
    }
    const exerciseName = (row[iEx] ?? "").trim();
    if (!exerciseName) continue;
    const weightRaw = iWeight >= 0 ? (row[iWeight] ?? "").trim() : "";
    const repsRaw = (row[iReps] ?? "").trim();
    if (weightRaw === "" && repsRaw === "") continue; // planned, never done
    const reps = Number(repsRaw);
    if (!Number.isFinite(reps) || reps <= 0) continue;
    const weightNum = Number(weightRaw);
    let weightStr = "";
    if (Number.isFinite(weightNum) && weightNum > 0) {
      const inTarget = sourceUnit === targetUnit ? weightNum : targetUnit === "lb" ? kgToLb(weightNum) : lbToKg(weightNum);
      weightStr = String(roundWeight(inTarget));
    }
    const notes = iNotes >= 0 ? (row[iNotes] ?? "").trim() || undefined : undefined;
    pushSet(group, exerciseName, { weight: weightStr, reps: String(reps), notes });
  }
  return { workouts: groupsToWorkouts(groups), weighIns: [...weighIns.values()] };
}

/**
 * Hevy date format: "01 Apr 2024, 19:35" or ISO. We try a few patterns and fall back to Date.parse.
 * Returns ISO string or null if unparseable.
 */
function parseHevyDate(s: string): string | null {
  if (!s) return null;
  const trimmed = s.trim();
  const direct = new Date(trimmed);
  if (!Number.isNaN(direct.getTime())) return direct.toISOString();
  const m = trimmed.match(/^(\d{1,2})\s+([A-Za-z]{3,})\s+(\d{4}),?\s+(\d{1,2}):(\d{2})(?::(\d{2}))?$/);
  if (m) {
    const [, d, mon, y, hh, mm, ss] = m;
    const month = ["jan","feb","mar","apr","may","jun","jul","aug","sep","oct","nov","dec"].indexOf(mon.slice(0,3).toLowerCase());
    if (month >= 0) {
      const date = new Date(Number(y), month, Number(d), Number(hh), Number(mm), Number(ss ?? "0"));
      if (!Number.isNaN(date.getTime())) return date.toISOString();
    }
  }
  return null;
}

/** Strong date format: "2024-01-01 19:35:00" (ISO-ish without T) or "2024-01-01 7:35:00 pm" (Hevy iOS export style). */
function parseStrongDate(s: string): string | null {
  if (!s) return null;
  const trimmed = s.trim();
  const ampm = trimmed.match(
    /^(\d{4}-\d{2}-\d{2})\s+(\d{1,2}):(\d{2})(?::(\d{2}))?\s*(am|pm)$/i
  );
  if (ampm) {
    const [, date, hh, mm, ss, period] = ampm;
    let h = Number(hh);
    const isPm = period.toLowerCase() === "pm";
    if (isPm && h < 12) h += 12;
    else if (!isPm && h === 12) h = 0;
    const d = new Date(
      `${date}T${String(h).padStart(2, "0")}:${mm}:${ss ?? "00"}`
    );
    if (!Number.isNaN(d.getTime())) return d.toISOString();
  }
  const isoish = trimmed.includes("T") ? trimmed : trimmed.replace(" ", "T");
  const d = new Date(isoish);
  if (!Number.isNaN(d.getTime())) return d.toISOString();
  return null;
}

function indexer(headers: string[]): (key: string) => number {
  const norm = headers.map(normalizeHeader);
  return (key: string) => norm.indexOf(key.toLowerCase());
}

type RowGroup = {
  completedAt: string;
  name: string;
  durationSec?: number;
  exercises: Map<string, ImportableWorkout["exercises"][number]>;
};

function pushSet(
  group: RowGroup,
  exerciseName: string,
  set: { weight: string; reps: string; notes?: string; rir?: number }
) {
  const key = exerciseName;
  let ex = group.exercises.get(key);
  if (!ex) {
    ex = { name: exerciseName, sets: [] };
    group.exercises.set(key, ex);
  }
  ex.sets.push(set);
}

function groupsToWorkouts(groups: Map<string, RowGroup>): ImportableWorkout[] {
  const out: ImportableWorkout[] = [];
  for (const g of groups.values()) {
    const exercises = Array.from(g.exercises.values());
    if (exercises.length === 0) continue;
    out.push({
      completedAt: g.completedAt,
      name: g.name || undefined,
      durationSec: g.durationSec,
      exercises,
    });
  }
  out.sort((a, b) => new Date(a.completedAt).getTime() - new Date(b.completedAt).getTime());
  return out;
}

function parseDurationToSec(s: string | undefined): number | undefined {
  if (!s) return undefined;
  const trimmed = s.trim();
  if (!trimmed) return undefined;
  const asNumber = Number(trimmed);
  if (Number.isFinite(asNumber)) return Math.round(asNumber);
  let total = 0;
  let matched = false;
  const h = trimmed.match(/(\d+)\s*h/i);
  const m = trimmed.match(/(\d+)\s*m(?!s)/i);
  const sec = trimmed.match(/(\d+)\s*s/i);
  if (h) { total += Number(h[1]) * 3600; matched = true; }
  if (m) { total += Number(m[1]) * 60; matched = true; }
  if (sec) { total += Number(sec[1]); matched = true; }
  return matched ? total : undefined;
}

function parseHevy(rows: string[][], targetUnit: Unit): ImportableWorkout[] {
  if (rows.length === 0) return [];
  const headers = rows[0];
  const idx = indexer(headers);
  const iTitle = idx("title");
  const iStart = idx("start_time");
  const iEnd = idx("end_time");
  const iEx = idx("exercise_title");
  const iNotes = idx("exercise_notes");
  const iWeight = idx("weight_kg");
  const iReps = idx("reps");
  const iRpe = idx("rpe");
  const iSetType = idx("set_type");

  const groups = new Map<string, RowGroup>();
  for (let r = 1; r < rows.length; r++) {
    const row = rows[r];
    if (!row || row.length < 2) continue;
    const start = iStart >= 0 ? row[iStart] : "";
    const completedAt = parseHevyDate(start);
    if (!completedAt) continue;
    const title = iTitle >= 0 ? row[iTitle]?.trim() || "" : "";
    const groupKey = `${completedAt}::${title}`;
    let group = groups.get(groupKey);
    if (!group) {
      let durationSec: number | undefined;
      if (iEnd >= 0) {
        const endIso = parseHevyDate(row[iEnd] ?? "");
        if (endIso) {
          const diff = (new Date(endIso).getTime() - new Date(completedAt).getTime()) / 1000;
          if (diff > 0 && diff < 24 * 3600) durationSec = Math.round(diff);
        }
      }
      group = { completedAt, name: title, durationSec, exercises: new Map() };
      groups.set(groupKey, group);
    }

    const exerciseName = iEx >= 0 ? row[iEx]?.trim() : "";
    if (!exerciseName) continue;

    const setType = iSetType >= 0 ? (row[iSetType] ?? "").trim().toLowerCase() : "";
    if (setType === "warmup" || setType === "warm up" || setType === "warm-up") continue;

    const weightKgRaw = iWeight >= 0 ? row[iWeight] : "";
    const repsRaw = iReps >= 0 ? row[iReps] : "";
    const weightKg = Number(weightKgRaw);
    const reps = Number(repsRaw);
    if (!Number.isFinite(reps) || reps <= 0) continue;

    let weightStr = "";
    if (Number.isFinite(weightKg) && weightKg > 0) {
      const w = targetUnit === "lb" ? roundWeight(kgToLb(weightKg)) : roundWeight(weightKg);
      weightStr = String(w);
    }

    const rpe = iRpe >= 0 ? Number(row[iRpe]) : NaN;
    const rir = rpeToRir(Number.isFinite(rpe) ? rpe : undefined);
    const notes = iNotes >= 0 ? row[iNotes]?.trim() || undefined : undefined;

    pushSet(group, exerciseName, {
      weight: weightStr,
      reps: String(reps),
      notes,
      rir,
    });
  }
  return groupsToWorkouts(groups);
}

function parseStrong(rows: string[][], targetUnit: Unit): ImportableWorkout[] {
  if (rows.length === 0) return [];
  const headers = rows[0];
  const idx = indexer(headers);
  const iDate = idx("date");
  const iName = idx("workout name");
  const iDuration = idx("duration") >= 0 ? idx("duration") : idx("workout duration (sec)");
  const iEx = idx("exercise name");
  const iWeight = idx("weight");
  const iWeightUnit = idx("weight unit");
  const iReps = idx("reps");
  const iRpe = idx("rpe");
  const iNotes = idx("notes");

  const groups = new Map<string, RowGroup>();
  for (let r = 1; r < rows.length; r++) {
    const row = rows[r];
    if (!row || row.length < 2) continue;
    const completedAt = parseStrongDate(iDate >= 0 ? row[iDate] : "");
    if (!completedAt) continue;
    const name = iName >= 0 ? row[iName]?.trim() || "" : "";
    const groupKey = `${completedAt}::${name}`;
    let group = groups.get(groupKey);
    if (!group) {
      const durationSec = iDuration >= 0 ? parseDurationToSec(row[iDuration]) : undefined;
      group = { completedAt, name, durationSec, exercises: new Map() };
      groups.set(groupKey, group);
    }
    const exerciseName = iEx >= 0 ? row[iEx]?.trim() : "";
    if (!exerciseName) continue;

    const reps = Number(iReps >= 0 ? row[iReps] : "");
    if (!Number.isFinite(reps) || reps <= 0) continue;

    const weightRaw = iWeight >= 0 ? Number(row[iWeight]) : NaN;
    const rowUnitRaw = iWeightUnit >= 0 ? (row[iWeightUnit] ?? "").trim().toLowerCase() : "";
    const rowUnit: Unit | undefined =
      rowUnitRaw === "kg" ? "kg" : rowUnitRaw === "lbs" || rowUnitRaw === "lb" ? "lb" : undefined;

    let weightStr = "";
    if (Number.isFinite(weightRaw) && weightRaw > 0) {
      const sourceUnit: Unit = rowUnit ?? targetUnit;
      let converted = weightRaw;
      if (sourceUnit !== targetUnit) {
        converted = sourceUnit === "kg" ? kgToLb(weightRaw) : lbToKg(weightRaw);
      }
      weightStr = String(roundWeight(converted));
    }

    const rpe = iRpe >= 0 ? Number(row[iRpe]) : NaN;
    const rir = rpeToRir(Number.isFinite(rpe) ? rpe : undefined);
    const notes = iNotes >= 0 ? row[iNotes]?.trim() || undefined : undefined;

    pushSet(group, exerciseName, {
      weight: weightStr,
      reps: String(reps),
      notes,
      rir,
    });
  }
  return groupsToWorkouts(groups);
}

export function parseImportCsv(
  text: string,
  opts: { format?: Exclude<CsvFormat, "unknown">; targetUnit: Unit; /** Unit the file's weights are in (Rep Count only; Hevy and Strong say). */ sourceUnit?: Unit }
): ParseResult {
  const trimmed = text.replace(/^﻿/, "").trim();
  if (!trimmed) return { ok: false, error: "CSV is empty." };

  const firstLineEnd = trimmed.indexOf("\n");
  const firstLine = firstLineEnd >= 0 ? trimmed.slice(0, firstLineEnd) : trimmed;
  const separator = pickSeparator(firstLine);
  const rows = parseCsv(trimmed, separator);
  if (rows.length < 2) return { ok: false, error: "CSV has no data rows." };

  const detected = detectFormat(rows[0]);
  const format = opts.format ?? (detected === "unknown" ? null : detected);
  if (!format) {
    return {
      ok: false,
      error:
        "Could not detect the format. Pick Hevy, Strong or Rep Count: the header did not match a known one.",
    };
  }

  const initialDataRows = rows.length - 1;
  let weighIns: ImportedWeighIn[] = [];
  let workouts: ImportableWorkout[];
  if (format === "hevy") workouts = parseHevy(rows, opts.targetUnit);
  else if (format === "strong") workouts = parseStrong(rows, opts.targetUnit);
  else {
    const r = parseRepCount(rows, opts.targetUnit, opts.sourceUnit ?? "kg");
    workouts = r.workouts;
    weighIns = r.weighIns;
  }
  const accountedSets = workouts.reduce(
    (sum, w) => sum + w.exercises.reduce((s, e) => s + e.sets.length, 0),
    0
  );
  const skippedRows = Math.max(0, initialDataRows - accountedSets);

  if (workouts.length === 0) {
    return {
      ok: false,
      error: `Parsed 0 workouts from ${initialDataRows} rows. Header may not match the selected format.`,
    };
  }

  return { ok: true, format, workouts, skippedRows, weighIns };
}

const WORKOUT_HISTORY_KEY = "workoutHistory";

type StoredShape = {
  completedAt: string;
  name?: string;
  durationSec?: number;
  exercises: ImportableWorkout["exercises"];
};

function readExistingHistory(): StoredShape[] {
  if (typeof window === "undefined") return [];
  try {
    const raw = localStorage.getItem(WORKOUT_HISTORY_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    if (!Array.isArray(parsed)) return [];
    return parsed as StoredShape[];
  } catch {
    return [];
  }
}

export type CommitMode = "append" | "replace";

export type CommitResult = {
  written: number;
  duplicatesSkipped: number;
  total: number;
};

export function commitImportedWorkouts(
  workouts: ImportableWorkout[],
  mode: CommitMode
): CommitResult {
  if (typeof window === "undefined") return { written: 0, duplicatesSkipped: 0, total: 0 };
  const incoming: StoredShape[] = workouts.map((w) => ({
    completedAt: w.completedAt,
    name: w.name,
    durationSec: w.durationSec,
    exercises: w.exercises,
  }));

  let next: StoredShape[];
  let duplicatesSkipped = 0;
  if (mode === "replace") {
    next = incoming;
  } else {
    const existing = readExistingHistory();
    const seen = new Set(existing.map((w) => `${w.completedAt}::${w.name ?? ""}`));
    const toAdd: StoredShape[] = [];
    for (const w of incoming) {
      const key = `${w.completedAt}::${w.name ?? ""}`;
      if (seen.has(key)) {
        duplicatesSkipped += 1;
        continue;
      }
      seen.add(key);
      toAdd.push(w);
    }
    next = [...existing, ...toAdd].sort(
      (a, b) => new Date(a.completedAt).getTime() - new Date(b.completedAt).getTime()
    );
  }

  localStorage.setItem(WORKOUT_HISTORY_KEY, JSON.stringify(next));
  window.dispatchEvent(new Event("workoutHistoryChanged"));
  return {
    written: mode === "replace" ? incoming.length : incoming.length - duplicatesSkipped,
    duplicatesSkipped,
    total: next.length,
  };
}
