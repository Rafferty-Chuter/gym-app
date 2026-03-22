import { NextRequest, NextResponse } from "next/server";
import OpenAI from "openai";

/** Mirrors client `coachStructuredOutput` — deterministic Coach tab output + evidence id hooks. */
export type AssistantCoachStructuredOutput = {
  keyFocus: string | null;
  keyFocusType: "plateau" | "declining" | "low-volume" | "progressing" | "none";
  keyFocusExercise?: string;
  keyFocusGroups?: string[];
  keyFocusEvidenceCardIds: string[];
  whatsGoingWell: Array<{ text: string; evidenceCardIds: string[] }>;
  actionableSuggestions: Array<{ text: string; evidenceCardIds: string[] }>;
};

/** Deduped catalog cards referenced by the current coach output (subset of full EvidenceCard). */
export type AssistantEvidenceCard = {
  id: string;
  title: string;
  summary: string;
  practicalTakeaway: string;
  caution?: string;
  confidence: "low" | "moderate" | "high";
};

/**
 * POST /api/assistant JSON body.
 * Coach evidence: `coachStructuredOutput` carries deterministic text + `evidenceCardIds` per section;
 * `evidenceCards` is the deduped catalog subset for those ids (server filters to referenced ids only).
 */
export type AssistantBody = {
  message: string;
  trainingSummary: {
    totalWorkouts: number;
    totalExercises: number;
    totalSets: number;
    weeklyVolume: Record<string, number>;
    recentExercises: string[];
  };
  trainingFocus?: string;
  experienceLevel?: string;
  unit?: string;
  /** Priority goal label (same as Coach). */
  priorityGoal?: string;
  exerciseTrends?: Array<{
    exercise: string;
    trend: string;
    recentPerformances: Array<{ completedAt: string; weight: number; reps: number }>;
  }>;
  trainingInsights?: {
    weeklyVolume: Record<string, number>;
    frequency: number;
    exerciseInsights: Array<{
      exercise: string;
      sessionsTracked: number;
      trend: string;
      changeSummary: string;
      consistency: string;
      hasAdequateExposure: boolean;
      possiblePlateau: boolean;
      possibleFatigue: boolean;
      possibleLowSpecificity: boolean;
    }>;
    findings: string[];
  };
  coachStructuredOutput?: AssistantCoachStructuredOutput;
  /** Only cards referenced via evidenceCardIds in coachStructuredOutput. */
  evidenceCards?: AssistantEvidenceCard[];
};

export type AssistantResponse = {
  reply: string;
};

function isStringArray(a: unknown): a is string[] {
  return Array.isArray(a) && a.every((x) => typeof x === "string");
}

function isCoachStructuredOutput(v: unknown): v is AssistantCoachStructuredOutput {
  if (v == null || typeof v !== "object") return false;
  const o = v as Record<string, unknown>;
  if (!("keyFocus" in o) || !(o.keyFocus === null || typeof o.keyFocus === "string")) return false;
  if (typeof o.keyFocusType !== "string") return false;
  if (!isStringArray(o.keyFocusEvidenceCardIds)) return false;
  if (!Array.isArray(o.whatsGoingWell) || !Array.isArray(o.actionableSuggestions)) return false;
  for (const row of o.whatsGoingWell) {
    if (row == null || typeof row !== "object") return false;
    const r = row as Record<string, unknown>;
    if (typeof r.text !== "string" || !isStringArray(r.evidenceCardIds)) return false;
  }
  for (const row of o.actionableSuggestions) {
    if (row == null || typeof row !== "object") return false;
    const r = row as Record<string, unknown>;
    if (typeof r.text !== "string" || !isStringArray(r.evidenceCardIds)) return false;
  }
  return true;
}

function sanitizeEvidenceCards(v: unknown): AssistantEvidenceCard[] {
  if (!Array.isArray(v)) return [];
  const out: AssistantEvidenceCard[] = [];
  for (const item of v) {
    if (item == null || typeof item !== "object") continue;
    const c = item as Record<string, unknown>;
    if (typeof c.id !== "string" || typeof c.title !== "string") continue;
    if (typeof c.summary !== "string" || typeof c.practicalTakeaway !== "string") continue;
    if (c.confidence !== "low" && c.confidence !== "moderate" && c.confidence !== "high") continue;
    out.push({
      id: c.id,
      title: c.title,
      summary: c.summary,
      practicalTakeaway: c.practicalTakeaway,
      caution: typeof c.caution === "string" ? c.caution : undefined,
      confidence: c.confidence,
    });
  }
  return out;
}

function referencedEvidenceIds(coach: AssistantCoachStructuredOutput): Set<string> {
  const ids = new Set<string>();
  for (const id of coach.keyFocusEvidenceCardIds) ids.add(id);
  for (const w of coach.whatsGoingWell) for (const id of w.evidenceCardIds) ids.add(id);
  for (const s of coach.actionableSuggestions) for (const id of s.evidenceCardIds) ids.add(id);
  return ids;
}

async function getAssistantReply(
  message: string,
  trainingSummary: AssistantBody["trainingSummary"],
  profile: { trainingFocus?: string; experienceLevel?: string; unit?: string; priorityGoal?: string },
  exerciseTrends: NonNullable<AssistantBody["exerciseTrends"]>,
  trainingInsights: AssistantBody["trainingInsights"] | undefined,
  coachStructuredOutput: AssistantCoachStructuredOutput | undefined,
  evidenceCards: AssistantEvidenceCard[]
): Promise<string> {
  const apiKey = process.env.OPENAI_API_KEY;
  if (!apiKey) {
    throw new Error("OPENAI_API_KEY is not set");
  }

  const openai = new OpenAI({ apiKey });

  const weeklyVolumeStr =
    Object.entries(trainingSummary.weeklyVolume ?? {})
      .filter(([, n]) => n > 0)
      .map(([g, n]) => `${g}: ${n} sets`)
      .join("; ") || "none logged";

  const context = `Training data: ${trainingSummary.totalWorkouts} total workouts, ${trainingSummary.totalSets} total sets, ${trainingSummary.totalExercises} exercise types. Weekly volume (last 7 days): ${weeklyVolumeStr}. Recent exercises: ${(trainingSummary.recentExercises ?? []).join(", ") || "none"}.`;

  const insightsFrequency = trainingInsights?.frequency ?? 0;
  const insightsWeeklyVolume = trainingInsights?.weeklyVolume ?? trainingSummary.weeklyVolume;
  const insightsWeeklyVolumeStr =
    Object.entries(insightsWeeklyVolume ?? {})
      .filter(([, n]) => n > 0)
      .map(([g, n]) => `${g}: ${n} sets`)
      .join("; ") || "none";
  const findingsStr = (trainingInsights?.findings ?? []).slice(0, 5).join(" ");
  const keyExerciseSignalsStr = (trainingInsights?.exerciseInsights ?? [])
    .slice(0, 4)
    .map(
      (e) =>
        `${e.exercise}: ${e.trend} (${e.changeSummary})`
    )
    .join("; ");
  const trendsStr =
    exerciseTrends.length > 0
      ? exerciseTrends
          .map(
            (t) =>
              `${t.exercise}: ${t.trend} (last ${t.recentPerformances.length} sessions; best set range ${t.recentPerformances[0]?.weight ?? "?"}×${t.recentPerformances[0]?.reps ?? "?"} → ${t.recentPerformances[t.recentPerformances.length - 1]?.weight ?? "?"}×${t.recentPerformances[t.recentPerformances.length - 1]?.reps ?? "?"})`
          )
          .join(". ")
      : "";
  const profileStr =
    [
      profile.trainingFocus && `Training focus: ${profile.trainingFocus}`,
      profile.experienceLevel && `Experience level: ${profile.experienceLevel}`,
      profile.unit && `Preferred units: ${profile.unit}`,
      profile.priorityGoal && `Priority goal: ${profile.priorityGoal}`,
    ]
      .filter(Boolean)
      .join(". ") || "";

  const coachJson = coachStructuredOutput
    ? JSON.stringify(coachStructuredOutput)
    : "";
  const evidenceJson = evidenceCards.length > 0 ? JSON.stringify(evidenceCards) : "[]";
  const hasEvidenceCards = evidenceCards.length > 0;

  const coachAuthorityBlock = coachStructuredOutput
    ? `
Deterministic coach output (authoritative for key focus, positives, and top suggestions — rephrase and explain only; do not contradict or replace with new diagnoses):
${coachJson}

Evidence cards linked to that output (by id). Fields: title, summary, practicalTakeaway, optional caution, confidence — mine summary AND caution for nuance/limitations, not just the title:
${evidenceJson}

Strict rules when coach output is present:
- Do not invent plateaus, injuries, fatigue diagnoses, or problems not stated in coachStructuredOutput.
- Do not introduce new evidence cards or study claims beyond the provided evidenceCards array.
- If the user asks for assessments outside what the structured fields and training summaries support, state the limit and suggest logging more sessions instead of speculating.
`
    : "";

  const evidenceDrivenReasoningBlock = hasEvidenceCards
    ? `
EVIDENCE CARDS (when non-empty — required):
One pass per card: principle + nuance; tie once to their log — same rules as above (short sentences, no stacked outcomes).

Consequences: outcomes, not risks — "will stall", "will stall progress", "is the limiting factor" — not "risking a stall", "plateau risk", or "can limit."
`
    : "";

  const reasoningBaseBlock = `
SENTENCE CRAFT (hard rules):
- Max one key idea per sentence. Each sentence should read like a standalone insight.
- Cap sentence length at ~15–18 words. Split if longer.
- Do not stack metrics and interpretation in one sentence (number in one short beat; meaning in the next).
- No stacked concepts in a single sentence — one claim, then move on.
- Clarity beats completeness: omit nice-to-haves before you add length.

SIGNAL DENSITY:
- No repeated ideas: each sentence must add new information. Each outcome once (no stall + plateau + limit progress for one problem).

LENGTH & MERGE:
- Target 3–4 sentences total. Combine two short beats into one sentence only when it stays under ~18 words and stays one clear claim.
- More detail only if the user explicitly asks.

STRUCTURE (default arc — diagnose a system constraint, not fitness 101):
(1) What’s happening — progress or position (from their data).
(2) What’s limiting it — name the bottleneck / limiting factor / constraint.
(3) What happens if unchanged — decisive consequence.
(4) Exact fix — one concise, direct action.

GENERIC PHRASES (ban):
- "maintain progress", "keep progress moving", "balance volume", "find balance", "stay consistent" as empty advice — replace with mechanism: limiting factor, bottleneck, constraint, dose, frequency, recovery.

MECHANISTIC LANGUAGE (prefer):
- Use: limiting factor, bottleneck, constraint, caps, stalls — tied to their log. Sound like a high-level coach fixing a system, not explaining basics.

DECISIVE COACHING (not possibilities):
- Every line sounds like a coaching call — what happens, what to do — not a maybe.
- Prefer certainty over probability; cautious wording only when uncertainty is real and in the data.
- Replace soft / probabilistic phrasing, e.g.: "risking a stall" → "will stall"; "will raise plateau risk" / "may stall" → "will stall progress"; "can limit" → "is the limiting factor."
- Ban hedged outcome talk: risking, could lead to, might mean, at risk of — unless the log truly leaves room for doubt (say that once, plainly).
- Avoid softeners: sustainable, potential, risk, likelihood — except when necessary (e.g. injury risk).
- Keep: "will stall", "is the limiting factor", "caps progression." Ban: "will likely stall", "could become a limiting factor."

OPENINGS:
- Lead with the point. No: however, since, if you keep, but, generally, it's worth noting.

DEPTH (compressed):
- Keep mechanism, cause→effect, one system link when data support — spread across short sentences, not one dense block.

HOW TO REASON:
- With coach output: coachStructuredOutput + evidenceCards → trainingInsights → exerciseTrends → context. Without: insights + trends + context.

PLAIN LANGUAGE:
- Support muscles; sets, frequency, effort — not lab jargon unless the card uses it. Prefer "system constraint" framing over vague wellness talk.

TONE:
- Certain, direct, minimal — senior coach diagnosing and removing a constraint, not listing possibilities.
`;

  const response = await openai.responses.create({
    model: "gpt-4.1-mini",
    input: `
  You are an elite strength coach: diagnose system constraints, prescribe fixes — not generic fitness explanation.

  ${reasoningBaseBlock}
  ${coachAuthorityBlock}
  ${evidenceDrivenReasoningBlock}
  ${
    trainingInsights
      ? `trainingInsights (use for specifics — frequencies, volumes, per-exercise signals, findings):\n- Training frequency (last 7 days): ${insightsFrequency} session${insightsFrequency === 1 ? "" : "s"}\n- Weekly volume: ${insightsWeeklyVolumeStr}\n- Key exercise signals: ${keyExerciseSignalsStr || "none"}\n- Notable findings: ${findingsStr || "none"}\n`
      : ""
  }
  ${trendsStr ? `exerciseTrends (use for progression / plateau language tied to actual loads and reps):\n${trendsStr}\n` : ""}
  ${profileStr ? `User profile: ${profileStr}.` : ""}

  Training context (totals and recent exercise names):
  ${context}

  User question:
  ${message}

  Answer in plain language. 3–4 sentences; ~15–18 words each; one new idea per sentence; structure: progress → limiter → if unchanged → fix.
  `,
  });
  
  const reply = response.output_text?.trim();
  if (!reply) throw new Error("Empty response from model");
  return reply;
}

export async function POST(request: NextRequest) {
  try {
    const body = (await request.json()) as AssistantBody;
    const {
      message,
      trainingSummary,
      trainingFocus,
      experienceLevel,
      unit,
      priorityGoal,
      exerciseTrends,
      trainingInsights,
      coachStructuredOutput: rawCoach,
      evidenceCards: rawEvidence,
    } = body;

    const coachStructuredOutput = isCoachStructuredOutput(rawCoach) ? rawCoach : undefined;
    const evidenceCards =
      coachStructuredOutput != null
        ? sanitizeEvidenceCards(rawEvidence).filter((c) =>
            referencedEvidenceIds(coachStructuredOutput).has(c.id)
          )
        : [];

    if (typeof message !== "string" || !message.trim()) {
      return NextResponse.json(
        { error: "message is required and must be a non-empty string." },
        { status: 400 }
      );
    }
    if (trainingSummary == null || typeof trainingSummary !== "object") {
      return NextResponse.json(
        { error: "trainingSummary is required." },
        { status: 400 }
      );
    }

    const reply = await getAssistantReply(
      message.trim(),
      {
        totalWorkouts: Number(trainingSummary.totalWorkouts) || 0,
        totalExercises: Number(trainingSummary.totalExercises) || 0,
        totalSets: Number(trainingSummary.totalSets) || 0,
        weeklyVolume: trainingSummary.weeklyVolume ?? {},
        recentExercises: Array.isArray(trainingSummary.recentExercises)
          ? trainingSummary.recentExercises
          : [],
      },
      { trainingFocus, experienceLevel, unit, priorityGoal },
      exerciseTrends ?? [],
      trainingInsights,
      coachStructuredOutput,
      evidenceCards
    );

    return NextResponse.json({ reply } satisfies AssistantResponse);
  } catch (err) {
    console.error("Assistant route error:", err);
  
    const message = err instanceof Error ? err.message : "Invalid request.";
    const status =
      message.includes("OPENAI") || message.includes("Empty response") ? 500 : 400;
  
    return NextResponse.json({ error: message }, { status });
  }
}
