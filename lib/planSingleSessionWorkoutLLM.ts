import Anthropic from "@anthropic-ai/sdk";
import { exerciseIdWhitelist, getExerciseCatalogForLLM } from "@/lib/exerciseCatalogForLLM";
import { resolveSessionExerciseCountPolicy } from "@/lib/sessionExerciseCountPolicy";
import { buildHypertrophyEvidencePromptBlock } from "@/lib/hypertrophyEvidenceV1";
import { buildMuscleCoverageBriefForLLM } from "@/lib/muscleCoverageBriefForLLM";
import type { MuscleRuleId } from "@/lib/trainingKnowledge/muscleRules";
import type { SessionType } from "@/lib/sessionTemplates";

const PLANNER_MODEL = "claude-sonnet-4-6";
const PLANNER_TOOL_NAME = "submit_planned_session";

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
  /**
   * One sentence about the requested muscle combination if there's something
   * genuinely worth surfacing (e.g. heavy pre-fatigue overlap, unusual
   * pairing). Empty string when nothing is worth saying. Always builds.
   */
  pairingNote?: string;
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

  // Pairing note: take the first sentence (period/newline boundary), cap at
  // 200 chars. Empty / missing → undefined (no note shown to user).
  const pairingNote = (() => {
    const rawNote = (raw as { pairingNote?: unknown }).pairingNote;
    if (typeof rawNote !== "string") return undefined;
    const trimmed = rawNote.trim();
    if (!trimmed) return undefined;
    const firstSentence = trimmed.split(/(?<=[.!?])\s|\n/)[0]?.trim();
    if (!firstSentence) return undefined;
    return firstSentence.slice(0, 200);
  })();

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

  return {
    sessionType,
    purposeSummary,
    exercises: deduped,
    weeklyFrequency,
    ...(pairingNote ? { pairingNote } : {}),
  };
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
  userTargetedMuscleRuleIds?: MuscleRuleId[];
  retryIssues?: string[];
}): Promise<PlannedSingleSessionLLMOutput | null> {
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
    "\n\n" + buildMuscleCoverageBriefForLLM(params.sessionTypeHint, params.userTargetedMuscleRuleIds) +
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

  const hypertrophyEvidence = buildHypertrophyEvidencePromptBlock();

  // System block 1: large, fully static across calls — cached.
  // Schema, output rules, hypertrophy framework, full exercise catalog.
  const systemStatic = `You are an elite strength coach in a training app. The user asked for ONE workout session.

You MUST output a single JSON object only — no markdown, no prose outside JSON.

Schema:
{
  "sessionType": ${JSON.stringify(SESSION_TYPES)},
  "purposeSummary": string (max ~12 words; user-facing; no long preamble),
  "pairingNote": string (one sentence — flag something genuinely worth surfacing about the requested muscle combination, OR empty string if nothing notable. Always build the session regardless. Examples worth flagging: heavy pressing pre-fatigues triceps; chest+biceps and chest+back are fine and don't need a note. Never warn just to warn.),
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

OUTPUT BREVITY (important — speeds responses without hurting decisions):
- plannerDebug strings: keep each ≤ 8 words. The value is committing to a choice, not long prose.
- minimumMovesRationale: one short sentence, not a paragraph.
- finalStopReason: ≤ 12 words.
- rationaleLine on exercises: optional; ≤ 10 words when present.

Hard rules:
- Use ONLY "exerciseId" values from the CATALOG below. Never invent ids.
- Respect EQUIPMENT; avoid gear the lifter does not list.
- Avoid movements conflicting with exclusions / injuries.
- Order: heavier compounds before lighter accessories when appropriate.
- slotLabel and rationaleLine: commit to exactly one catalog exercise; no slash-combined names.

HYPERTROPHY & PROGRAMMING FRAMEWORK (apply when selecting exercises, volume, and patterns):
${hypertrophyEvidence}

CATALOG (id + name — exerciseId MUST be one of these ids):
${JSON.stringify(catalog)}`;

  // System block 2: small, varies per call — NOT cached.
  // Session-type hint, recovery mode, count policy, requested ids, retry issues.
  const systemDynamic = `Session-specific configuration:
- Prefer sessionType "${params.sessionTypeHint}" unless the user clearly asked for a different single session.
- Requested exercise ids: ${requested.length > 0 ? `include these unless impossible with equipment: ${JSON.stringify(requested)}` : "none mandatory beyond what fits the user request."}
- ${params.recoveryLowFatigue ? "Recovery / low-fatigue: fewer redundant compounds, machine/cable-friendly when sensible." : "Normal training density is fine."}
- ${countPolicy.promptLine}${patternCoverageBlock}${frequencyBlock}

SELF-REVIEW (do this before outputting):
Before outputting this session, review it against your knowledge of how each requested muscle group should be trained optimally. Is anything important missing or underdeveloped? If yes, fix it first.${issuesBlock}`;

  const user = `USER REQUEST:\n${params.userMessage.trim().slice(0, 3200)}

COACH CONTEXT (training history and profile — use this to personalise selection, avoid recently over-trained muscles, and match volume targets):\n${params.coachContextSnippet.trim().slice(0, 1200)}

INFERRED GOAL / STYLE: ${params.builderGoalLabel}

EQUIPMENT (strings the lifter has):\n${JSON.stringify(params.equipmentAvailable.slice(0, 40))}

EXCLUSION / INJURY KEYWORDS (avoid loading these patterns):\n${JSON.stringify(excludedIdsHint.slice(0, 24))}`;

  // Tool schema for Anthropic structured output. Forces Sonnet to emit fields
  // that match what `sanitize()` expects, removing the "stringify-then-parse-JSON"
  // failure mode that gpt-4.1-mini occasionally hit.
  const tool: Anthropic.Messages.Tool = {
    name: PLANNER_TOOL_NAME,
    description:
      "Submit the planned single-session workout in the required schema. Call this exactly once with the final plan after self-review.",
    input_schema: {
      type: "object",
      required: ["sessionType", "purposeSummary", "exercises"],
      properties: {
        sessionType: {
          type: "string",
          enum: SESSION_TYPES as unknown as string[],
        },
        purposeSummary: {
          type: "string",
          description: "Max ~12 words; user-facing; no long preamble.",
        },
        pairingNote: {
          type: "string",
          description:
            "One sentence flagging something genuinely worth surfacing about the requested muscle combination, OR empty string if nothing notable. Always build the session regardless. Example worth flagging: heavy pressing pre-fatigues triceps. Chest+biceps and chest+back generally do not need a note. Never warn just to warn.",
        },
        weeklyFrequency: {
          type: "object",
          required: ["timesPerWeek", "restDaysBetween", "rationale"],
          properties: {
            timesPerWeek: { type: "number" },
            restDaysBetween: { type: "number" },
            rationale: { type: "string" },
          },
        },
        plannerDebug: {
          type: "object",
          properties: {
            workoutGoal: { type: "string" },
            minimumMovesRationale: { type: "string" },
            perExercise: {
              type: "array",
              items: {
                type: "object",
                properties: {
                  order: { type: "number" },
                  exerciseId: { type: "string" },
                  addedBecause: { type: "string" },
                  coverageAfterThisPick: { type: "string" },
                  stopConsidered: { type: "boolean" },
                  wouldNextMoveBeMostlyRedundant: { type: "string" },
                  decidedToStopOrContinue: { type: "string" },
                },
              },
            },
            finalStopReason: { type: "string" },
          },
        },
        exercises: {
          type: "array",
          items: {
            type: "object",
            required: ["exerciseId", "slotLabel"],
            properties: {
              exerciseId: { type: "string" },
              slotLabel: {
                type: "string",
                description:
                  "Short UI label; ONE movement only — never use '/', ' or ', or combined exercise names; use the catalog name style.",
              },
              rationaleLine: {
                type: "string",
                description: "Optional, max one short sentence.",
              },
            },
          },
        },
      },
    },
  };

  try {
    const anthropic = new Anthropic({ apiKey: params.apiKey });
    const startedAt = Date.now();
    // Two system blocks: stable (cached) + dynamic. Streaming avoids
    // HTTP timeouts on long structured outputs and gives a `usage` object
    // with cache_read/creation tokens so we can verify cache hits.
    const stream = anthropic.messages.stream({
      model: PLANNER_MODEL,
      max_tokens: 3000,
      temperature: 0.4,
      system: [
        {
          type: "text",
          text: systemStatic,
          cache_control: { type: "ephemeral" },
        },
        {
          type: "text",
          text: systemDynamic,
        },
      ],
      tools: [tool],
      tool_choice: { type: "tool", name: PLANNER_TOOL_NAME },
      messages: [{ role: "user", content: user }],
    });
    const res = await stream.finalMessage();
    const elapsedMs = Date.now() - startedAt;
    console.log("[planSingleSessionWorkoutLLM] timing", {
      elapsedMs,
      sessionType: params.sessionTypeHint,
      stopReason: res.stop_reason,
      input_tokens: res.usage?.input_tokens ?? 0,
      output_tokens: res.usage?.output_tokens ?? 0,
      cache_read_input_tokens: res.usage?.cache_read_input_tokens ?? 0,
      cache_creation_input_tokens: res.usage?.cache_creation_input_tokens ?? 0,
    });
    const toolUse = res.content.find(
      (b): b is Anthropic.Messages.ToolUseBlock => b.type === "tool_use" && b.name === PLANNER_TOOL_NAME
    );
    if (!toolUse) {
      console.warn("[planSingleSessionWorkoutLLM] no tool_use in response", {
        stopReason: res.stop_reason,
        contentTypes: res.content.map((b) => b.type),
      });
      return null;
    }
    const parsed = toolUse.input as PlannedSingleSessionLLMOutput & {
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
