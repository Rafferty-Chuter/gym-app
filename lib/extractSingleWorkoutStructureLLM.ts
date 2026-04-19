import OpenAI from "openai";
import { exerciseIdWhitelist } from "@/lib/exerciseCatalogForLLM";
import type { SessionType } from "@/lib/sessionTemplates";

export type SingleWorkoutStructureLLMOutput = {
  sessionType: SessionType;
  targetMuscles: string[];
  requiredExerciseIds: string[];
  preferredExerciseIds: string[];
  exerciseCountHint?: number;
  briefRationale?: string;
};

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

function sanitize(raw: SingleWorkoutStructureLLMOutput): SingleWorkoutStructureLLMOutput {
  const valid = exerciseIdWhitelist();
  const sessionType = SESSION_TYPES.includes(raw.sessionType) ? raw.sessionType : "upper";
  const targetMuscles = Array.isArray(raw.targetMuscles)
    ? [...new Set(raw.targetMuscles.map((m) => String(m).toLowerCase().trim()).filter((m) => ALLOWED_MUSCLES.has(m)))]
    : [];
  const requiredExerciseIds = Array.isArray(raw.requiredExerciseIds)
    ? [...new Set(raw.requiredExerciseIds.map((id) => String(id).trim()).filter((id) => valid.has(id)))]
    : [];
  const preferredExerciseIds = Array.isArray(raw.preferredExerciseIds)
    ? [...new Set(raw.preferredExerciseIds.map((id) => String(id).trim()).filter((id) => valid.has(id)))]
    : [];
  const exerciseCountHint =
    Number.isFinite(raw.exerciseCountHint) && raw.exerciseCountHint
      ? Math.max(4, Math.min(10, Math.round(raw.exerciseCountHint)))
      : undefined;
  return {
    sessionType,
    targetMuscles,
    requiredExerciseIds,
    preferredExerciseIds,
    exerciseCountHint,
    briefRationale: typeof raw.briefRationale === "string" ? raw.briefRationale.slice(0, 240) : "",
  };
}

export async function extractSingleWorkoutStructureLLM(params: {
  userMessage: string;
  apiKey: string;
  requestedExerciseIds: string[];
  excludedExerciseIds: string[];
  inferredSessionType: SessionType;
  retryIssues?: string[];
}): Promise<SingleWorkoutStructureLLMOutput | null> {
  const openai = new OpenAI({ apiKey: params.apiKey });
  const validIds = JSON.stringify([...exerciseIdWhitelist()]);
  const issues =
    params.retryIssues && params.retryIssues.length > 0
      ? `\nPrevious attempt issues:\n- ${params.retryIssues.join("\n- ")}\nFix all of them.`
      : "";
  const system = `You plan a SINGLE workout session as strict JSON only.
Schema:
{
  "sessionType": "chest"|"back"|"legs"|"shoulders"|"arms"|"push"|"pull"|"upper"|"lower"|"full_body",
  "targetMuscles": string[],
  "requiredExerciseIds": string[],
  "preferredExerciseIds": string[],
  "exerciseCountHint": number,
  "briefRationale": string
}
Rules:
- Use only exercise ids from allowlist: ${validIds}
- Respect exclusions strictly.
- Keep requiredExerciseIds short (0-4), preferredExerciseIds short (0-8).
- Prioritize balanced coverage and non-redundant structure for the requested session.
- Return JSON only.${issues}`;
  const user = `User request: ${params.userMessage.trim().slice(0, 2500)}
Inferred session type: ${params.inferredSessionType}
Requested ids: ${JSON.stringify(params.requestedExerciseIds)}
Excluded ids: ${JSON.stringify(params.excludedExerciseIds)}`;
  try {
    const res = await openai.chat.completions.create({
      model: "gpt-4.1-mini",
      response_format: { type: "json_object" },
      temperature: 0.2,
      max_completion_tokens: 800,
      messages: [
        { role: "system", content: system },
        { role: "user", content: user },
      ],
    });
    const txt = res.choices[0]?.message?.content?.trim();
    if (!txt) return null;
    return sanitize(JSON.parse(txt) as SingleWorkoutStructureLLMOutput);
  } catch (err) {
    console.warn("[extractSingleWorkoutStructureLLM] failed", err);
    return null;
  }
}

