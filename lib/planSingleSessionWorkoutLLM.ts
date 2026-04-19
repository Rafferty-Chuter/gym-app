import OpenAI from "openai";
import { exerciseIdWhitelist, getExerciseCatalogForLLM } from "@/lib/exerciseCatalogForLLM";
import { resolveSessionExerciseCountPolicy } from "@/lib/sessionExerciseCountPolicy";
import { buildHypertrophyEvidencePromptBlock } from "@/lib/hypertrophyEvidenceV1";
import { buildMuscleCoverageBriefForLLM } from "@/lib/muscleCoverageBriefForLLM";
import type { SessionType } from "@/lib/sessionTemplates";

const SESSION_TYPES: SessionType[] = [
  "chest",
  "back",
  "legs",
  "shoulders",
  "arms",
  "push",
  "pull",
  "upper",
  "lower",
  "full_body",
];

export type PlannedSessionExercise = {
  exerciseId: string;
  slotLabel: string;
  rationaleLine?: string;
};

export type PlannedWeeklyFrequency = {
  timesPerWeek: number;
  restDaysBetween: number;
  rationale: string;
};

export type PlannedSingleSessionLLMOutput = {
  sessionType: SessionType;
  purposeSummary: string;
  exercises: PlannedSessionExercise[];
  weeklyFrequency?: PlannedWeeklyFrequency;
};

/** Parsed from model JSON, logged server-side only — not stored on the workout card. */
type PlannerDebugPayload = {
  workoutGoal?: string;
  minimumMovesRationale?: string;
  perExercise?: Array<{
    order?: number;
    exerciseId?: string;
    addedBecause?: string;
    coverageAfterThisPick?: string;
    stopConsidered?: boolean;
    wouldNextMoveBeMostlyRedundant?: string;
    decidedToStopOrContinue?: string;
  }>;
  finalStopReason?: string;
};

function logPlannerDebugPayload(
  debug: PlannerDebugPayload | undefined,
  userMessage: string,
  exerciseIdsOrdered: string[]
): void {
  const preview = userMessage.trim().slice(0, 100);
  if (!debug || typeof debug !== "object") {
    console.log("[planner-stop-decision]", {
      preview,
      note: "plannerDebug missing from model output",
      exerciseCount: exerciseIdsOrdered.length,
    });
    return;
  }
  console.log("[planner-session-goal]", {
    preview,
    workoutGoal: debug.workoutGoal ?? null,
    minimumMovesRationale: debug.minimumMovesRationale ?? null,
  });
  const steps = Array.isArray(debug.perExercise) ? debug.perExercise : [];
  for (let i = 0; i < steps.length; i++) {
    const step = steps[i] ?? {};
    console.log("[planner-coverage-after-exercise]", {
      preview,
      stepIndex: i,
      exerciseId: step.exerciseId ?? exerciseIdsOrdered[i] ?? null,
      coverageAfterThisPick: step.coverageAfterThisPick ?? null,
      addedBecause: step.addedBecause ?? null,
    });
    console.log("[planner-stop-decision]", {
      preview,
      stepIndex: i,
      stopConsidered: step.stopConsidered ?? null,
      wouldNextMoveBeMostlyRedundant: step.wouldNextMoveBeMostlyRedundant ?? null,
      decidedToStopOrContinue: step.decidedToStopOrContinue ?? null,
    });
    console.log("[planner-extra-exercise-justification]", {
      preview,
      stepIndex: i,
      text: step.addedBecause ?? step.decidedToStopOrContinue ?? null,
    });
  }
  console.log("[planner-final-stop-reason]", {
    preview,
    finalStopReason: debug.finalStopReason ?? null,
    exerciseCount: exerciseIdsOrdered.length,
  });
}

function normalizeSessionType(rawSessionType: unknown): SessionType | null {
  if (rawSessionType == null) return null;
  const s = String(rawSessionType).toLowerCase().trim();
  // Normalize separators.
  const v = s.replace(/[-\s_]+/g, "_");
  if (SESSION_TYPES.includes(v as SessionType)) return v as SessionType;

  // Common variants.
  if (/\bpush\b/.test(v)) return "push";
  if (/\bpull\b/.test(v)) return "pull";
  if (/\bupper\b/.test(v)) return "upper";
  if (/\blower\b/.test(v)) return "lower";
  if (/\blegs?\b/.test(v) || /\bleg_day\b/.test(v) || /\bleg\b/.test(v)) return "legs";
  if (/\bshoulder(s)?\b/.test(v)) return "shoulders";
  if (/\barm(s)?\b/.test(v)) return "arms";
  if (/\bfull[_\s-]?body\b/.test(s)) return "full_body";
  if (/\bchest\b/.test(v)) return "chest";
  if (/\bback\b/.test(v)) return "back";
  return null;
}

function sanitize(
  raw: PlannedSingleSessionLLMOutput,
  validIds: Set<string>,
  bounds: { min: number; max: number }
): PlannedSingleSessionLLMOutput | null {
  const originalSessionType = raw.sessionType;
  const sessionType = normalizeSessionType(raw.sessionType);
  if (!sessionType) {
    console.warn("[planner-sanitize-fail]", {
      reason: "bad_session_type",
      originalSessionType,
      normalizedSessionType: null,
      bounds,
      rawExerciseCount: Array.isArray((raw as any).exercises) ? (raw as any).exercises.length : null,
    });
    return null;
  }
  const exercises = Array.isArray(raw.exercises)
    ? raw.exercises
        .map((row) => {
          let rationaleLine =
            typeof row.rationaleLine === "string" ? row.rationaleLine.trim().slice(0, 220) : undefined;
          if (rationaleLine && /\s*\/\s*|\s+\/\s+/.test(rationaleLine)) {
            rationaleLine = rationaleLine.split(/\s*\/\s*/)[0]?.trim().slice(0, 220);
          }
          return {
            exerciseId: String(row.exerciseId ?? "")
              .trim()
              .toLowerCase()
              .replace(/[\s-]+/g, "_")
              .replace(/[^\w]/g, ""),
            slotLabel:
              typeof row.slotLabel === "string" && row.slotLabel.trim()
                ? row.slotLabel.trim().slice(0, 80)
                : "Movement",
            rationaleLine,
          };
        })
        .filter((row) => validIds.has(row.exerciseId))
    : [];
  const deduped: PlannedSessionExercise[] = [];
  const seen = new Set<string>();
  for (const ex of exercises) {
    if (seen.has(ex.exerciseId)) continue;
    seen.add(ex.exerciseId);
    deduped.push(ex);
  }
  if (deduped.length < bounds.min || deduped.length > bounds.max) {
    console.warn("[planner-sanitize-fail]", {
      reason: "exercise_count_out_of_bounds",
      originalSessionType,
      normalizedSessionType: sessionType,
      bounds,
      rawExerciseCount: Array.isArray(raw.exercises) ? raw.exercises.length : null,
      mappedAndValidCount: exercises.length,
      dedupedCount: deduped.length,
      firstDedupedExerciseIds:
        deduped.length > 0 ? deduped.slice(0, 6).map((e) => e.exerciseId) : [],
    });
    return null;
  }
  const purposeSummary =
    typeof raw.purposeSummary === "string" && raw.purposeSummary.trim()
      ? raw.purposeSummary.trim().slice(0, 120)
      : `${sessionType.replace("_", " ")} session tailored to the request.`;

  const weeklyFrequency: PlannedWeeklyFrequency | undefined = (() => {
    const wf = (raw as any).weeklyFrequency;
    if (!wf || typeof wf !== "object") return undefined;
    const times = Number(wf.timesPerWeek);
    const rest = Number(wf.restDaysBetween);
    const rationale = typeof wf.rationale === "string" ? wf.rationale.trim().slice(0, 200) : undefined;
    if (!Number.isFinite(times) || times < 1 || times > 7) return undefined;
    if (!Number.isFinite(rest) || rest < 0) return undefined;
    return { timesPerWeek: times, restDaysBetween: rest, rationale: rationale ?? "" };
  })();

  return { sessionType, purposeSummary, exercises: deduped, weeklyFrequency };
}

export async function planSingleSessionWorkoutLLM(params: {
  userMessage: string;
  apiKey: string;
  sessionTypeHint: SessionType;
  equipmentAvailable: string[];
  exclusions: string[];
  requestedExerciseIds: string[];
  recoveryLowFatigue: boolean;
  builderGoalLabel: string;
  coachContextSnippet: string;
  retryIssues?: string[];
}): Promise<PlannedSingleSessionLLMOutput | null> {
  const openai = new OpenAI({ apiKey: params.apiKey });
  const catalog = getExerciseCatalogForLLM();
  const validIds = exerciseIdWhitelist();
  const countPolicy = resolveSessionExerciseCountPolicy({
    recoveryLowFatigue: params.recoveryLowFatigue,
    userMessage: params.userMessage,
  });
  const requested = params.requestedExerciseIds.filter((id) => validIds.has(id));
  const excludedIdsHint = params.exclusions
    .map((s) => s.trim().toLowerCase())
    .filter(Boolean);

  const issuesBlock =
    params.retryIssues && params.retryIssues.length > 0
      ? `\n\nPrevious plan failed quality checks. Fix ALL of these in the new JSON:\n- ${params.retryIssues.slice(0, 8).join("\n- ")}`
      : "";

  // Data-driven muscle-head coverage brief — generated from MUSCLE_RULES + catalog.
  // Adapts automatically to session type; no hardcoded push/pull/legs template prose.
  const patternCoverageBlock =
    "\n\n" + buildMuscleCoverageBriefForLLM(params.sessionTypeHint) +
    `

Evidence-driven planning instructions (complete before committing to exercise IDs):
1) plannerDebug.workoutGoal: state the session goal in one sentence.
2) plannerDebug.minimumMovesRationale: for each muscle in the coverage brief, list every [REQUIRED] pattern you will cover and explain why you chose the specific exercise.
3) Pick exactly ONE exercise per [REQUIRED] pattern gap. Use the listed catalog candidates. Pick an [optional] pattern only when it addresses a clearly distinct sub-region not already covered.
4) Per exercise, fill plannerDebug.perExercise: addedBecause (which pattern gap), coverageAfterThisPick (patterns now covered vs still open), stopConsidered (true/false), wouldNextMoveBeMostlyRedundant, decidedToStopOrContinue.
5) plannerDebug.finalStopReason: confirm all [REQUIRED] patterns are covered, or state any acceptable gap and why.`;

  const frequencyBlock = `

WEEKLY FREQUENCY RECOMMENDATION (output as weeklyFrequency):
After selecting exercises, determine how many times per week this session should ideally be performed for the best hypertrophy and strength outcomes, and how many rest days to leave between sessions.

Rules:
- Each major muscle group needs ~10–20 sets/week for hypertrophy. Count how many direct sets this session provides per primary muscle.
- Divide the target (~10 sets) by the sets-per-session to get minimum frequency needed. Cap at recoverable volume.
- Major muscles (chest, back, quads, glutes, hamstrings): need 48–72h recovery between hard sessions → minimum 2 rest days between repeats.
- Smaller muscles (biceps, triceps, calves, delts): recover faster (~36–48h) → minimum 1–2 rest days.
- Typical recommendations: push/pull 2×/week; legs 1–2×/week; upper/lower 2×/week; full-body 2–3×/week.
- If COACH CONTEXT shows the user already trains this session type frequently, adjust toward the low end.

Output: weeklyFrequency: { "timesPerWeek": number, "restDaysBetween": number, "rationale": "one sentence tying frequency to recovery + weekly volume target" }`;

  const system = `You are an elite strength coach in a training app. The user asked for ONE workout session.

You MUST output a single JSON object only — no markdown, no prose outside JSON.

Schema:
{
  "sessionType": ${JSON.stringify(SESSION_TYPES)},
  "purposeSummary": string (max ~12 words; user-facing; no long preamble),
  "weeklyFrequency": {
    "timesPerWeek": number (1–4),
    "restDaysBetween": number (minimum rest days between repeats),
    "rationale": string (one sentence)
  },
  "plannerDebug": {
    "workoutGoal": string,
    "minimumMovesRationale": string,
    "perExercise": [
      {
        "order": number,
        "exerciseId": string,
        "addedBecause": string,
        "coverageAfterThisPick": string,
        "stopConsidered": boolean,
        "wouldNextMoveBeMostlyRedundant": string,
        "decidedToStopOrContinue": string
      }
    ],
    "finalStopReason": string
  },
  "exercises": [
    {
      "exerciseId": string,
      "slotLabel": string (short UI label; ONE movement only — never use "/", " or ", or combined exercise names; use the catalog name style),
      "rationaleLine": string (optional, max one short sentence)
    }
  ]
}

Hard rules:
- Use ONLY "exerciseId" values from the CATALOG JSON below. Never invent ids.
- Prefer sessionType "${params.sessionTypeHint}" unless the user clearly asked for a different single session.
- Include ${requested.length > 0 ? `these requested exercise ids (unless impossible with equipment): ${JSON.stringify(requested)}` : "no mandatory exercise ids beyond what fits the user request."}
- Respect EQUIPMENT; avoid gear the lifter does not list.
- Avoid movements conflicting with exclusions / injuries.
- ${params.recoveryLowFatigue ? "Recovery / low-fatigue: fewer redundant compounds, machine/cable-friendly when sensible." : "Normal training density is fine."}
- ${countPolicy.promptLine}
- Order: heavier compounds before lighter accessories when appropriate.
- slotLabel and rationaleLine: commit to exactly one catalog exercise; no slash-combined names.${patternCoverageBlock}${frequencyBlock}${issuesBlock}`;

  const hypertrophyEvidence = buildHypertrophyEvidencePromptBlock();
  const user = `USER REQUEST:\n${params.userMessage.trim().slice(0, 3200)}

COACH CONTEXT (training history and profile — use this to personalise selection, avoid recently over-trained muscles, and match volume targets):\n${params.coachContextSnippet.trim().slice(0, 1200)}

HYPERTROPHY & PROGRAMMING FRAMEWORK (apply when selecting exercises, volume, and patterns):\n${hypertrophyEvidence}

INFERRED GOAL / STYLE: ${params.builderGoalLabel}

EQUIPMENT (strings the lifter has):\n${JSON.stringify(params.equipmentAvailable.slice(0, 40))}

EXCLUSION / INJURY KEYWORDS (avoid loading these patterns):\n${JSON.stringify(excludedIdsHint.slice(0, 24))}

CATALOG (id + name — exerciseId MUST be one of these ids):\n${JSON.stringify(catalog)}`;

  try {
    const res = await openai.chat.completions.create({
      model: "gpt-4.1-mini",
      response_format: { type: "json_object" },
      temperature: 0.4,
      max_completion_tokens: 3000,
      messages: [
        { role: "system", content: system },
        { role: "user", content: user },
      ],
    });
    const txt = res.choices[0]?.message?.content?.trim();
    if (!txt) return null;
    const parsed = JSON.parse(txt) as PlannedSingleSessionLLMOutput & {
      plannerDebug?: PlannerDebugPayload;
    };
    const plannerDebug = parsed.plannerDebug;
    const { plannerDebug: _drop, ...planBody } = parsed;
    const sanitized = sanitize(planBody, validIds, { min: countPolicy.min, max: countPolicy.max });
    if (sanitized) {
      logPlannerDebugPayload(plannerDebug, params.userMessage, sanitized.exercises.map((e) => e.exerciseId));
    }
    return sanitized;
  } catch (err) {
    console.warn("[planSingleSessionWorkoutLLM] failed", err);
    return null;
  }
}
