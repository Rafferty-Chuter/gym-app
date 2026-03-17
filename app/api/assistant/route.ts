import { NextRequest, NextResponse } from "next/server";
import OpenAI from "openai";

export type AssistantBody = {
  message: string;
  trainingSummary: {
    totalWorkouts: number;
    totalExercises: number;
    totalSets: number;
    weeklyVolume: Record<string, number>;
    recentExercises: string[];
  };
};

export type AssistantResponse = {
  reply: string;
};

async function getAssistantReply(
  message: string,
  trainingSummary: AssistantBody["trainingSummary"]
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

  const response = await openai.responses.create({
    model: "gpt-4.1-mini",
    input: `
  You are a friendly strength training assistant.
  
  Use the user's training data to answer their question clearly and practically.
  
  Training context:
  ${context}
  
  User question:
  ${message}
  
  Respond concisely and helpfully.
  `,
  });
  
  const reply = response.output_text?.trim();
  if (!reply) throw new Error("Empty response from model");
  return reply;
}

export async function POST(request: NextRequest) {
  try {
    const body = (await request.json()) as AssistantBody;
    const { message, trainingSummary } = body;

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

    const reply = await getAssistantReply(message.trim(), {
      totalWorkouts: Number(trainingSummary.totalWorkouts) || 0,
      totalExercises: Number(trainingSummary.totalExercises) || 0,
      totalSets: Number(trainingSummary.totalSets) || 0,
      weeklyVolume: trainingSummary.weeklyVolume ?? {},
      recentExercises: Array.isArray(trainingSummary.recentExercises)
        ? trainingSummary.recentExercises
        : [],
    });

    return NextResponse.json({ reply } satisfies AssistantResponse);
  } catch (err) {
    console.error("Assistant route error:", err);
  
    const message = err instanceof Error ? err.message : "Invalid request.";
    const status =
      message.includes("OPENAI") || message.includes("Empty response") ? 500 : 400;
  
    return NextResponse.json({ error: message }, { status });
  }
}
