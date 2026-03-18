import { NextRequest, NextResponse } from "next/server";
import OpenAI from "openai";

export type RefineTargetBody = {
  exerciseName: string;
  recentPerformances: { weight: number; reps: number }[];
  exerciseType: "compound" | "isolation";
  weeklyVolume?: Record<string, number>;
  baseTarget: string;
};

export type RefineTargetResponse = {
  target: string;
};

async function refineTarget(payload: RefineTargetBody): Promise<string> {
  const apiKey = process.env.OPENAI_API_KEY;
  if (!apiKey) throw new Error("OPENAI_API_KEY is not set");

  const openai = new OpenAI({ apiKey });
  const perfStr = payload.recentPerformances
    .map((p) => `${p.weight}kg × ${p.reps}`)
    .join("; ");
  const volStr = payload.weeklyVolume
    ? Object.entries(payload.weeklyVolume)
        .filter(([, n]) => n > 0)
        .map(([g, n]) => `${g}: ${n}`)
        .join("; ") || "none"
    : "unknown";

  const completion = await openai.chat.completions.create({
    model: "gpt-4.1-mini",
    messages: [
      {
        role: "system",
        content: `You refine strength training targets. Output ONLY the target in format "Xkg × Y–Z" (e.g. "100kg × 6–8"). No explanation. No other text. Be conservative and practical.`,
      },
      {
        role: "user",
        content: `Exercise: ${payload.exerciseName}. Type: ${payload.exerciseType}. Recent (newest first): ${perfStr}. Weekly volume: ${volStr}. Base suggestion: ${payload.baseTarget}. Refine if needed, otherwise return the base. Output only the target.`,
      },
    ],
  });

  const text = completion.choices[0]?.message?.content?.trim();
  if (!text) throw new Error("Empty response");
  return text;
}

export async function POST(request: NextRequest) {
  try {
    const body = (await request.json()) as RefineTargetBody;
    const { exerciseName, recentPerformances, exerciseType, baseTarget } = body;

    if (
      typeof exerciseName !== "string" ||
      !Array.isArray(recentPerformances) ||
      !["compound", "isolation"].includes(exerciseType ?? "") ||
      typeof baseTarget !== "string"
    ) {
      return NextResponse.json(
        { error: "exerciseName, recentPerformances, exerciseType, baseTarget required." },
        { status: 400 }
      );
    }

    const target = await refineTarget({
      exerciseName,
      recentPerformances,
      exerciseType,
      weeklyVolume: body.weeklyVolume,
      baseTarget,
    });

    return NextResponse.json({ target } satisfies RefineTargetResponse);
  } catch (err) {
    const msg = err instanceof Error ? err.message : "Invalid request.";
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
