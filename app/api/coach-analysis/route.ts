import { NextRequest, NextResponse } from "next/server";

export type CoachAnalysisBody = {
  weeklyVolume: Record<string, number>;
  trainingFrequency: number;
  recentWorkouts: {
    completedAt: string;
    exercises: { name: string; sets: { weight: string; reps: string }[] }[];
  }[];
};

export type CoachAnalysisResponse = {
  analysis: string[];
};

/**
 * Placeholder AI-style response. Replace with real AI model call later.
 */
function getPlaceholderAnalysis(_payload: CoachAnalysisBody): string[] {
  return [
    "Your recent training looks consistent.",
    "Chest and back volume are in a good range.",
    "Leg volume may be slightly low compared to upper body—consider adding a dedicated leg day if needed.",
    "Continue progressing your main lifts and keep logging workouts.",
  ];
}

export async function POST(request: NextRequest) {
  try {
    const body = (await request.json()) as CoachAnalysisBody;
    const { weeklyVolume, trainingFrequency, recentWorkouts } = body;

    if (
      weeklyVolume == null ||
      typeof trainingFrequency !== "number" ||
      !Array.isArray(recentWorkouts)
    ) {
      return NextResponse.json(
        { error: "Missing or invalid body: weeklyVolume, trainingFrequency, recentWorkouts required." },
        { status: 400 }
      );
    }

    const analysis = getPlaceholderAnalysis({
      weeklyVolume: weeklyVolume ?? {},
      trainingFrequency,
      recentWorkouts: recentWorkouts ?? [],
    });

    return NextResponse.json({ analysis } satisfies CoachAnalysisResponse);
  } catch {
    return NextResponse.json(
      { error: "Invalid request body." },
      { status: 400 }
    );
  }
}
