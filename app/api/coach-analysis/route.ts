import { NextRequest, NextResponse } from "next/server";
import OpenAI from "openai";

/**
 * Training summary sent from the Coach page for AI analysis.
 */
export type TrainingSummaryBody = {
  totalWorkouts: number;
  weeklyVolume: Record<string, number>;
  recentExercises: string[];
  totalSets: number;
};

export type CoachAnalysisResponse = {
  analysis: string[];
};

function parseBulletPoints(text: string): string[] {
  return text
    .split(/\n/)
    .map((line) => line.replace(/^[\s\-*•]+/, "").trim())
    .filter((line) => line.length > 0);
}

async function getAIAnalysis(summary: TrainingSummaryBody): Promise<string[]> {
  const apiKey = process.env.OPENAI_API_KEY;
  if (!apiKey) {
    throw new Error("OPENAI_API_KEY is not set");
  }

  const openai = new OpenAI({ apiKey });

  const weeklyVolumeStr = Object.entries(summary.weeklyVolume ?? {})
    .filter(([, n]) => n > 0)
    .map(([group, n]) => `${group}: ${n} sets`)
    .join("; ") || "none logged";

  const prompt = `You are a strength training coach. Based on this trainee's summary, give 3–5 concise bullet points of feedback. Be encouraging and practical.

Summary:
- Total workouts logged (all time): ${summary.totalWorkouts}
- Total sets logged (all time): ${summary.totalSets}
- Weekly volume by muscle group (last 7 days): ${weeklyVolumeStr}
- Recent exercises: ${(summary.recentExercises ?? []).join(", ") || "none"}

Reply with 3–5 short bullet points only, one per line. No numbering or extra formatting.`;

  const completion = await openai.chat.completions.create({
    model: "gpt-4.1-mini",
    messages: [
      {
        role: "system",
        content:
          "You are a strength training coach. Reply only with 3–5 concise bullet points, one per line. No other text or formatting.",
      },
      { role: "user", content: prompt },
    ],
  });

  const content = completion.choices[0]?.message?.content?.trim();
  if (!content) {
    throw new Error("Empty response from model");
  }

  const analysis = parseBulletPoints(content);
  return analysis.length > 0 ? analysis : [content];
}

export async function POST(request: NextRequest) {
  try {
    const body = (await request.json()) as TrainingSummaryBody;
    const { totalWorkouts, weeklyVolume, recentExercises, totalSets } = body;

    if (
      typeof totalWorkouts !== "number" ||
      weeklyVolume == null ||
      typeof weeklyVolume !== "object" ||
      !Array.isArray(recentExercises) ||
      typeof totalSets !== "number"
    ) {
      return NextResponse.json(
        {
          error:
            "Missing or invalid body: totalWorkouts, weeklyVolume, recentExercises, totalSets required.",
        },
        { status: 400 }
      );
    }

    const summary: TrainingSummaryBody = {
      totalWorkouts,
      weeklyVolume: weeklyVolume ?? {},
      recentExercises: recentExercises ?? [],
      totalSets,
    };

    const analysis = await getAIAnalysis(summary);

    return NextResponse.json({ analysis } satisfies CoachAnalysisResponse);
  } catch (err) {
    const message = err instanceof Error ? err.message : "Invalid request body.";
    const status = message.includes("OPENAI") || message.includes("Empty response") ? 500 : 400;
    return NextResponse.json({ error: message }, { status });
  }
}
