import OpenAI from "openai";

export type ProgrammeReviewPayload = {
  programmeTitle: string;
  programmeGoal: string;
  notes?: string;
  days: Array<{
    dayLabel: string;
    sessionType: string;
    exercises: string[];
  }>;
};

export type SingleWorkoutReviewPayload = {
  sessionType: string;
  purposeSummary: string;
  exercises: Array<{ slotLabel: string; exerciseName: string }>;
  weeklyFrequency?: { timesPerWeek: number; restDaysBetween: number; rationale: string };
};

/**
 * Natural-language coach review of an already-generated routine (not a template).
 * Fails soft: returns null on error so callers can omit the review.
 */
export async function generateCoachRoutineReviewLLM(params: {
  apiKey: string;
  userMessage: string;
  coachContextSnippet: string;
  kind: "single_workout" | "programme";
  workout?: SingleWorkoutReviewPayload;
  programme?: ProgrammeReviewPayload;
  /** Short generic build requests: keep the review brief so the workout list comes first. */
  verbosity?: "default" | "compact";
}): Promise<string | null> {
  const openai = new OpenAI({ apiKey: params.apiKey });
  const payload =
    params.kind === "single_workout"
      ? JSON.stringify(params.workout, null, 0)
      : JSON.stringify(params.programme, null, 0);

  const compact = params.verbosity === "compact" && params.kind === "single_workout";

  const freqLine =
    params.kind === "single_workout" && params.workout?.weeklyFrequency
      ? `\n- If a weeklyFrequency object is present in the plan summary, end your response with: "Best done ${params.workout.weeklyFrequency.timesPerWeek}× per week — leave at least ${params.workout.weeklyFrequency.restDaysBetween} rest day${params.workout.weeklyFrequency.restDaysBetween === 1 ? "" : "s"} between sessions." Do not rephrase this line.`
      : "";

  const system = compact
    ? `You are an elite strength coach in a training app. A workout was just generated (summary JSON below).

Rules:
- Write at most 2 short sentences (under 55 words total). No paragraphs, no markdown, no bullet lists, no JSON.
- One line: tie the session to what they asked for. One line: one execution tip (effort, order, or progression).${freqLine}
- Do not list every exercise by name unless the summary has 3 or fewer moves.
- Do not invent movements not in the summary.`
    : `You are an elite strength coach chatting in a training app. The system already generated a concrete workout or programme (JSON summary below). Your job is to review and explain it in the same warm, decisive, calm voice you use in normal coaching chat.

Rules:
- Write 2–4 short paragraphs of flowing prose. No markdown headings, no bullet lists of every exercise, no JSON.
- Briefly tie the plan to what they asked for, then explain why this structure makes sense (patterns, balance across muscles, fatigue/recovery, progression or RIR ideas where relevant).
- End with one practical execution tip (ordering, effort, or when to add load).
- Do not invent exercises that are not implied by the summary. If the summary is thin, stay general.
- Do not apologize excessively or say you "cannot" do something.`;

  const user = `User request (verbatim, may be truncated):
${params.userMessage.trim().slice(0, 2800)}

Reader context (may be minimal):
${params.coachContextSnippet.trim().slice(0, 800)}

Generated plan summary (authoritative list of what they will see in the app):
${payload.slice(0, 12000)}`;

  try {
    const res = await openai.chat.completions.create({
      model: "gpt-4.1-mini",
      temperature: compact ? 0.5 : 0.65,
      max_completion_tokens: compact ? 240 : 700,
      messages: [
        { role: "system", content: system },
        { role: "user", content: user },
      ],
    });
    const txt = res.choices[0]?.message?.content?.trim();
    if (!txt) return null;
    return txt.slice(0, 4500);
  } catch (err) {
    console.warn("[explainRoutineCoachLLM] failed", err);
    return null;
  }
}
