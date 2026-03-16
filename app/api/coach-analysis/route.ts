import { NextRequest, NextResponse } from "next/server";

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

/**
 * Simulated AI response. Replace with real AI model call later.
 */
function getPlaceholderAnalysis(_summary: TrainingSummaryBody): string[] {
  return ["AI analysis placeholder."];
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

    const analysis = getPlaceholderAnalysis({
      totalWorkouts,
      weeklyVolume: weeklyVolume ?? {},
      recentExercises: recentExercises ?? [],
      totalSets,
    });

    return NextResponse.json({ analysis } satisfies CoachAnalysisResponse);
  } catch {
    return NextResponse.json(
      { error: "Invalid request body." },
      { status: 400 }
    );
  }
}
