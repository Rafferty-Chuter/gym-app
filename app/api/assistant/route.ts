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

  const completion = await openai.chat.completions.create({
    model: "gpt-4.1-mini",
    messages: [
      {
        role: "system",
        content: `You are a friendly strength training assistant. You have access to the user's training summary. Use it to give relevant, concise answers. Be encouraging and practical.`,
      },
      {
        role: "user",
        content: `[Context: ${context}]\n\nUser question: ${message}`,
      },
    ],
  });

  const reply = completion.choices[0]?.message?.content?.trim();
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
    const message = err instanceof Error ? err.message : "Invalid request.";
    const status =
      message.includes("OPENAI") || message.includes("Empty response") ? 500 : 400;
    return NextResponse.json({ error: message }, { status });
  }
}
