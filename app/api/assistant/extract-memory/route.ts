/**
 * Extracts durable, scoped facts from a finished assistant conversation.
 * Output is consumed by future conversations as USER MEMORY (see
 * Decisions/2026-04-30-assistant-memory-system.md).
 *
 * POST body:
 *   { conversation: { role: "user" | "assistant"; content: string }[] }
 *
 * Response:
 *   { facts: { category: "preferences" | "goals" | "findings" | "facts";
 *              fact: string;
 *              timestamp: string }[] }
 *
 * Returns { facts: [] } on empty conversation, malformed payload, or model
 * parse failure — the caller treats absence of new facts as a no-op merge.
 */

import Anthropic from "@anthropic-ai/sdk";
import { NextResponse } from "next/server";

const anthropic = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });

const VALID_CATEGORIES = new Set(["preferences", "goals", "findings", "facts"] as const);

const EXTRACTION_PROMPT = `You extract durable facts from a single conversation between a strength-training app user and the AI coach. Your output is the user's USER MEMORY for future conversations — these facts will be shown to the coach as background to inform answers, not repeated to the user.

Return ONLY valid JSON of this exact shape, no prose, no markdown fences:

{ "facts": [ { "category": "preferences" | "goals" | "findings" | "facts", "fact": "<one short sentence>", "timestamp": "<ISO datetime — use TODAY below>" } ] }

EXTRACT ONLY:
- preferences: training preferences the user STATED (split, frequency, session structure, exercises they prefer / avoid, equipment access). Example: "Trains a 4-day upper/lower split."
- goals: goals or priorities the user STATED. Example: "Wants to bring up bench press."
- findings: notable things SURFACED OR CONFIRMED in this conversation that should carry forward. Example: "Shoulder hurts on overhead press." / "Found 5x5 motivating." / "Responded well to swapping flat bench for incline."
- facts: user-stated facts about their training that the rules engine cannot derive from logged sets. Example: "Trains at home with limited dumbbells." / "Has 7 years of training history."

DO NOT EXTRACT:
- Generic advice or science the assistant gave.
- Questions the user asked.
- Anything derivable from logged workout data (sets, reps, weights, weekly volume, exercise trends — the rules engine already supplies that to the coach).
- Platitudes about the user ("user is motivated", "user takes training seriously"), restated obvious context, or things the user did not actually say.
- Vague emotional reactions unless they reflect a durable preference.

QUALITY RULES:
- Each fact: one short sentence, specific, written in third person about the user ("Trains 4 days a week", NOT "I train 4 days").
- If the user contradicts an earlier statement in the same conversation, extract the latest stated version only.
- If nothing extractable, return { "facts": [] }.
- Cap output at 20 facts. Prefer fewer, sharper facts over many marginal ones.

Today's ISO timestamp: <TODAY>

The conversation:
<CONVERSATION>`;

type RawFact = { category?: unknown; fact?: unknown; timestamp?: unknown };

function stripCodeFences(text: string): string {
  return text
    .trim()
    .replace(/^```(?:json)?\s*/i, "")
    .replace(/\s*```\s*$/i, "")
    .trim();
}

export async function POST(req: Request) {
  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ facts: [] });
  }

  const conversation = Array.isArray((body as { conversation?: unknown })?.conversation)
    ? ((body as { conversation: unknown[] }).conversation as unknown[])
    : [];

  if (conversation.length === 0) return NextResponse.json({ facts: [] });

  const today = new Date().toISOString();
  const conversationText = conversation
    .map((m): string | null => {
      if (!m || typeof m !== "object") return null;
      const role = (m as { role?: unknown }).role;
      const content = (m as { content?: unknown }).content;
      if (typeof role !== "string" || typeof content !== "string") return null;
      const trimmed = content.trim();
      if (!trimmed) return null;
      return `${role.toUpperCase()}: ${trimmed}`;
    })
    .filter((s): s is string => Boolean(s))
    .join("\n\n");

  if (!conversationText) return NextResponse.json({ facts: [] });

  const prompt = EXTRACTION_PROMPT.replace("<TODAY>", today).replace(
    "<CONVERSATION>",
    conversationText
  );

  try {
    const response = await anthropic.messages.create({
      model: "claude-sonnet-4-6",
      max_tokens: 1024,
      messages: [{ role: "user", content: prompt }],
    });
    const textBlock = response.content.find((b) => b.type === "text");
    const raw = textBlock?.type === "text" ? textBlock.text : "";
    const cleaned = stripCodeFences(raw);

    let parsed: unknown;
    try {
      parsed = JSON.parse(cleaned);
    } catch {
      console.error(
        "[extract-memory] failed to parse model output as JSON:",
        raw.slice(0, 500)
      );
      return NextResponse.json({ facts: [] });
    }

    if (!parsed || typeof parsed !== "object" || !Array.isArray((parsed as { facts?: unknown }).facts)) {
      return NextResponse.json({ facts: [] });
    }

    const rawFacts = (parsed as { facts: unknown[] }).facts as RawFact[];
    const facts = rawFacts
      .filter(
        (f): f is { category: string; fact: string; timestamp?: string } =>
          Boolean(f) &&
          typeof f === "object" &&
          typeof f.category === "string" &&
          typeof f.fact === "string" &&
          VALID_CATEGORIES.has(f.category as "preferences" | "goals" | "findings" | "facts") &&
          (typeof f.timestamp === "string" || typeof f.timestamp === "undefined")
      )
      .map((f) => ({
        category: f.category as "preferences" | "goals" | "findings" | "facts",
        fact: f.fact.trim(),
        timestamp: f.timestamp || today,
      }))
      .filter((f) => f.fact.length > 0);

    return NextResponse.json({ facts });
  } catch (e) {
    console.error("[extract-memory] anthropic call failed:", e);
    return NextResponse.json({ error: "extraction_failed", facts: [] }, { status: 500 });
  }
}
