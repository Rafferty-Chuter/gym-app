import OpenAI from "openai";
import { exerciseIdWhitelist } from "@/lib/exerciseCatalogForLLM";

export type ProgrammeLLMDayPlan = {
  dayLabel: string;
  targetMuscles: string[];
  exerciseIds: string[];
};

export type ProgrammeStructureLLMOutput = {
  splitType: "ppl" | "upper_lower" | "full_body" | "custom" | "general";
  days: ProgrammeLLMDayPlan[];
  briefRationale: string;
};

const ALLOWED_MUSCLES = new Set([
  "chest",
  "back",
  "shoulders",
  "biceps",
  "triceps",
  "arms",
  "quads",
  "hamstrings",
  "glutes",
  "calves",
  "legs",
]);

function sanitizeDay(day: ProgrammeLLMDayPlan): ProgrammeLLMDayPlan {
  const validIds = exerciseIdWhitelist();
  const dayLabel = typeof day.dayLabel === "string" ? day.dayLabel.trim().slice(0, 60) : "Day";
  const targetMuscles = Array.isArray(day.targetMuscles)
    ? [...new Set(day.targetMuscles.map((m) => String(m).toLowerCase().trim()).filter((m) => ALLOWED_MUSCLES.has(m)))]
    : [];
  const exerciseIds = Array.isArray(day.exerciseIds)
    ? [...new Set(day.exerciseIds.map((id) => String(id).trim()).filter((id) => validIds.has(id)))]
    : [];
  return { dayLabel: dayLabel || "Day", targetMuscles, exerciseIds };
}

function sanitize(raw: ProgrammeStructureLLMOutput): ProgrammeStructureLLMOutput {
  const splitType =
    raw.splitType === "ppl" ||
    raw.splitType === "upper_lower" ||
    raw.splitType === "full_body" ||
    raw.splitType === "custom"
      ? raw.splitType
      : "general";
  const days = Array.isArray(raw.days) ? raw.days.map(sanitizeDay).filter((d) => d.exerciseIds.length > 0) : [];
  return {
    splitType,
    days: days.slice(0, 6),
    briefRationale: typeof raw.briefRationale === "string" ? raw.briefRationale.slice(0, 280) : "",
  };
}

export async function extractProgrammeStructureLLM(params: {
  userMessage: string;
  apiKey: string;
  requestedExerciseIds: string[];
  excludedExerciseIds: string[];
  retryIssues?: string[];
}): Promise<ProgrammeStructureLLMOutput | null> {
  const openai = new OpenAI({ apiKey: params.apiKey });
  const validIds = JSON.stringify([...exerciseIdWhitelist()]);
  const issues =
    params.retryIssues && params.retryIssues.length > 0
      ? `\nPrevious attempt issues:\n- ${params.retryIssues.join("\n- ")}\nFix all of them.`
      : "";

  const system = `You generate a complete structured weekly programme plan as JSON for a workout app.
Return JSON only.

Schema:
{
  "splitType": "ppl" | "upper_lower" | "full_body" | "custom" | "general",
  "days": [
    {
      "dayLabel": string,
      "targetMuscles": string[],
      "exerciseIds": string[]
    }
  ],
  "briefRationale": string
}

Rules:
- Use ONLY exercise ids from this allowlist: ${validIds}
- Respect explicit exclusions strictly. Never include excluded ids.
- Include explicit requested ids when feasible and not excluded.
- Build practical days with 4-8 exerciseIds per day.
- Keep 2-6 days total.
- dayLabel should be concise (e.g., Upper, Lower, Push).
- targetMuscles should be realistic and match the day.
- No markdown, no explanation outside JSON.${issues}`;

  const user = `User request: ${params.userMessage.trim().slice(0, 3000)}
Requested exercise ids: ${JSON.stringify(params.requestedExerciseIds)}
Excluded exercise ids: ${JSON.stringify(params.excludedExerciseIds)}`;

  try {
    const res = await openai.chat.completions.create({
      model: "gpt-4.1-mini",
      response_format: { type: "json_object" },
      temperature: 0.2,
      max_completion_tokens: 1200,
      messages: [
        { role: "system", content: system },
        { role: "user", content: user },
      ],
    });
    const txt = res.choices[0]?.message?.content?.trim();
    if (!txt) return null;
    const parsed = JSON.parse(txt) as ProgrammeStructureLLMOutput;
    return sanitize(parsed);
  } catch (err) {
    console.warn("[extractProgrammeStructureLLM] failed", err);
    return null;
  }
}
