import OpenAI from "openai";
import { exerciseIdWhitelist, getExerciseCatalogForLLM } from "@/lib/exerciseCatalogForLLM";

export type ProgrammeConstraintsLLMOutput = {
  excludeExerciseIds: string[];
  includeExerciseIds: string[];
  uniformPerMuscleExerciseCount: number | null;
  splitTypeHint: "ppl" | "upper_lower" | "full_body" | null;
  recoveryOrFatigueHint: "normal" | "low_fatigue" | null;
  briefRationale: string;
};

function emptyOutput(): ProgrammeConstraintsLLMOutput {
  return {
    excludeExerciseIds: [],
    includeExerciseIds: [],
    uniformPerMuscleExerciseCount: null,
    splitTypeHint: null,
    recoveryOrFatigueHint: null,
    briefRationale: "",
  };
}

function sanitizeAgainstCatalog(raw: ProgrammeConstraintsLLMOutput): ProgrammeConstraintsLLMOutput {
  const ok = exerciseIdWhitelist();
  const ex = raw.excludeExerciseIds.filter((id) => ok.has(id));
  const inc = raw.includeExerciseIds.filter((id) => ok.has(id));
  let u = raw.uniformPerMuscleExerciseCount;
  if (typeof u !== "number" || !Number.isFinite(u)) u = null;
  else u = Math.max(1, Math.min(6, Math.floor(u)));
  const hint = raw.splitTypeHint;
  const split =
    hint === "ppl" || hint === "upper_lower" || hint === "full_body" ? hint : null;
  const fat =
    raw.recoveryOrFatigueHint === "low_fatigue" || raw.recoveryOrFatigueHint === "normal"
      ? raw.recoveryOrFatigueHint
      : null;
  return {
    excludeExerciseIds: [...new Set(ex)],
    includeExerciseIds: [...new Set(inc)],
    uniformPerMuscleExerciseCount: u,
    splitTypeHint: split as ProgrammeConstraintsLLMOutput["splitTypeHint"],
    recoveryOrFatigueHint: fat,
    briefRationale: typeof raw.briefRationale === "string" ? raw.briefRationale.slice(0, 400) : "",
  };
}

/**
 * Model interprets free-text → constrained JSON. IDs must come from our catalog only (sanitized server-side).
 */
export async function extractProgrammeConstraintsLLM(params: {
  userMessage: string;
  apiKey: string;
}): Promise<ProgrammeConstraintsLLMOutput | null> {
  const catalog = getExerciseCatalogForLLM();
  const catalogJson = JSON.stringify(catalog);

  const openai = new OpenAI({ apiKey: params.apiKey });

  const system = `You extract structured PROGRAMME BUILDING constraints from the user message for a workout app.

Output a single JSON object ONLY (no markdown) with exactly these keys:
{
  "excludeExerciseIds": string[],
  "includeExerciseIds": string[],
  "uniformPerMuscleExerciseCount": number | null,
  "splitTypeHint": "ppl" | "upper_lower" | "full_body" | null,
  "recoveryOrFatigueHint": "normal" | "low_fatigue" | null,
  "briefRationale": string
}

Rules:
- excludeExerciseIds / includeExerciseIds: use ONLY "id" values from the provided catalog JSON. Never invent ids.
- Phrases like "no lateral raises", "without X", "don't include X", "avoid X", "doesn't include" → put matching catalog id in excludeExerciseIds.
- Phrases like "include bench", "must have JM press" → includeExerciseIds.
- "2 exercises per muscle group" (or similar) → uniformPerMuscleExerciseCount: 2 (integer 1–6).
- splitTypeHint only when user clearly wants PPL, upper/lower, or full body.
- recoveryOrFatigueHint low_fatigue if they ask for easy / recovery / deload / less fatigue.
- briefRationale: one short sentence.

Catalog (id + name):
${catalogJson}`;

  try {
    const res = await openai.chat.completions.create({
      model: "gpt-4.1-mini",
      response_format: { type: "json_object" },
      messages: [
        { role: "system", content: system },
        { role: "user", content: params.userMessage.trim().slice(0, 4000) },
      ],
      temperature: 0.2,
      max_completion_tokens: 512,
    });
    const text = res.choices[0]?.message?.content?.trim();
    if (!text) return null;
    const parsed = JSON.parse(text) as ProgrammeConstraintsLLMOutput;
    return sanitizeAgainstCatalog(parsed);
  } catch (e) {
    console.warn("[extractProgrammeConstraintsLLM] failed", e);
    return null;
  }
}
