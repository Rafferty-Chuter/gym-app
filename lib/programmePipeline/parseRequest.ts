import {
  parseExcludedExerciseIds,
  parseRequestedExerciseConstraints,
} from "@/lib/parseRequestedExerciseConstraints";
import { parseStructuralProgrammeConstraints } from "@/lib/parseStructuralProgrammeConstraints";
import { parseSplitFromMessage, tryParseOnDayStructure } from "@/lib/splitParser";
import type { ProgrammeIntent, ParsedProgrammeRequest } from "./types";

export type ParseProgrammeRequestContext = {
  message: string;
  intent: ProgrammeIntent;
};

function detectSplitTypeFromText(t: string): ParsedProgrammeRequest["splitType"] {
  if (/\b(push\s*pull\s*legs|\bppl\b)\b/.test(t)) return "ppl";
  if (/\b(upper\s*[\/\s-]?\s*lower|upper lower)\b/.test(t)) return "upper_lower";
  if (/\bfull[\s_-]?body\b/.test(t)) return "full_body";
  if (/\b(custom|my own|day\s+1|on\s+one\s+day)\b/.test(t)) return "custom";
  return "general";
}

function detectFatigueMode(t: string): ParsedProgrammeRequest["fatigueMode"] {
  if (/\b(low fatigue|less fatiguing|lower fatigue|recovery|deload|easy week)\b/.test(t)) return "low_fatigue";
  if (/\bstrength bias|strength-focused|heavy compounds\b/.test(t)) return "strength_bias";
  if (/\bhypertrophy bias|muscle growth|pump work|more isolation\b/.test(t)) return "hypertrophy_bias";
  return "normal";
}

function detectEmphasis(t: string): string[] {
  const out: string[] = [];
  if (/\btriceps?\b/.test(t) && /\b(more|extra|add|emphas|priorit)/.test(t)) out.push("triceps");
  if (/\bbiceps?\b/.test(t) && /\b(more|extra|add|emphas|priorit)/.test(t)) out.push("biceps");
  if (/\bchest\b/.test(t) && /\b(more|extra|twice|2\s*x|two\s+times)/.test(t)) out.push("chest");
  if (/\b(isolation|accessories?)\b/.test(t) && /\bmore\b/.test(t)) out.push("isolation");
  if (/\bbench\b/.test(t) && /\b(twice|2\s*x|two\s+times|\b2\s*\/\s*week)\b/.test(t)) out.push("bench_frequency");
  return out;
}

function detectRequestedChanges(t: string): string[] {
  const changes: string[] = [];
  if (/\badd\s+more\b/.test(t)) changes.push("volume_increase");
  if (/\btriceps?\b/.test(t)) changes.push("triceps");
  if (/\b(low fatigue|less fatiguing|lower fatigue)\b/.test(t)) changes.push("reduce_fatigue");
  if (/\b(swap|replace|instead)\b/.test(t)) changes.push("exercise_swap");
  return changes;
}

function detectComparisonTargets(t: string): string[] {
  const targets: string[] = [];
  if (/\bppl\b|push\s*pull\s*legs/.test(t)) targets.push("ppl");
  if (/\bupper\s*[\/\s-]?\s*lower|upper lower/.test(t)) targets.push("upper_lower");
  if (/\bfull[\s_-]?body\b/.test(t)) targets.push("full_body");
  return targets;
}

function inferFrequency(t: string): number | undefined {
  const m = t.match(/\b([2-7])\s*(?:day|days|x\s*\/\s*week|times?\s+a\s+week)\b/);
  if (m) return Number(m[1]);
  if (/\bonce\s+(?:a\s+)?week\b/.test(t)) return 1;
  if (/\btwice\s+(?:a\s+)?week\b/.test(t) || /\btwo\s+times?\s+(?:a\s+)?week\b/.test(t)) return 2;
  if (/\bthree\s+times?\s+(?:a\s+)?week\b/.test(t)) return 3;
  const benchTwice = /\bbench\b/.test(t) && /\b(twice|2\s*x|two\s+times|2\s*\/\s*week)\b/.test(t);
  if (benchTwice) return 2;
  return undefined;
}

function customGroupsFromSplitDef(
  days: Array<{ dayLabel: string; targetMuscles: string[] }>
): ParsedProgrammeRequest["customDayGroups"] {
  return days.map((d) => ({ dayLabel: d.dayLabel, targetMuscles: [...d.targetMuscles] }));
}

function logParsedRequest(out: ParsedProgrammeRequest): ParsedProgrammeRequest {
  console.log("[programme-request-parsed]", JSON.stringify(out));
  return out;
}

/**
 * Turn free text into structured constraints (semantic cues + split parser; not a single keyword gate).
 */
export function parseProgrammeRequest(ctx: ParseProgrammeRequestContext): ParsedProgrammeRequest {
  const raw = ctx.message.trim();
  const t = raw.toLowerCase();
  const intent = ctx.intent;

  const exerciseParse = parseRequestedExerciseConstraints(raw);
  const excludedFromNegation = parseExcludedExerciseIds(raw);
  const requestedExercises = exerciseParse.exerciseIds.filter((id) => !excludedFromNegation.includes(id));
  const structuralConstraints = parseStructuralProgrammeConstraints(raw);

  const out: ParsedProgrammeRequest = {
    intent,
    requestedExercises,
    fatigueMode: detectFatigueMode(t),
    emphasis: detectEmphasis(t),
    frequency: inferFrequency(t),
    requestedChanges: detectRequestedChanges(t),
    comparisonTargets: detectComparisonTargets(t),
  };

  if (excludedFromNegation.length > 0) {
    out.excludedExercises = excludedFromNegation;
  }

  if (
    structuralConstraints.uniformPerMuscleExerciseCount != null ||
    structuralConstraints.perMuscleMinimums ||
    structuralConstraints.perMuscleMaximums ||
    structuralConstraints.moreIsolationPerMuscle
  ) {
    out.structuralConstraints = structuralConstraints;
  }

  if (intent === "programme_compare") {
    const st = detectSplitTypeFromText(t);
    if (st !== "general") out.splitType = st;
    return logParsedRequest(out);
  }

  if (intent === "programme_explain" || intent === "non_programme") {
    return logParsedRequest(out);
  }

  const onDay = tryParseOnDayStructure(raw);
  if (onDay && onDay.days.length >= 2 && onDay.source === "parsed") {
    out.splitType = "custom";
    out.customDayGroups = customGroupsFromSplitDef(onDay.days);
    return logParsedRequest(out);
  }

  const parsedSplit = parseSplitFromMessage(raw);
  if (parsedSplit && parsedSplit.days.length > 0) {
    if (parsedSplit.source === "parsed") {
      out.splitType = "custom";
      out.customDayGroups = customGroupsFromSplitDef(parsedSplit.days);
    } else if (/\b(ppl|push\s*pull\s*legs)\b/.test(t)) {
      out.splitType = "ppl";
    } else if (/\b(upper\s*[\/\s-]?\s*lower|upper lower)\b/.test(t)) {
      out.splitType = "upper_lower";
    } else if (/\bfull[\s_-]?body\b/.test(t)) {
      out.splitType = "full_body";
    } else {
      out.splitType = detectSplitTypeFromText(t);
      out.customDayGroups = customGroupsFromSplitDef(parsedSplit.days);
    }
    return logParsedRequest(out);
  }

  out.splitType = detectSplitTypeFromText(t);
  return logParsedRequest(out);
}
