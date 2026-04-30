import { readFileSync, writeFileSync, existsSync } from "node:fs";
import { join } from "node:path";
import Anthropic from "@anthropic-ai/sdk";

function loadEnvLocal() {
  const p = join(process.cwd(), ".env.local");
  if (!existsSync(p)) return;
  for (const line of readFileSync(p, "utf8").split("\n")) {
    const m = line.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*)\s*$/i);
    if (!m) continue;
    const key = m[1];
    let val = m[2];
    if ((val.startsWith('"') && val.endsWith('"')) || (val.startsWith("'") && val.endsWith("'"))) {
      val = val.slice(1, -1);
    }
    if (!(key in process.env)) process.env[key] = val;
  }
}
loadEnvLocal();

const COACH_URL = process.env.COACH_URL ?? "http://localhost:3000/api/assistant";
const SCORER_MODEL = "claude-sonnet-4-6";
const CASES_PATH = join(process.cwd(), "evals/cases.json");
const RESULTS_PATH = join(process.cwd(), "evals/results.json");
const COACH_TIMEOUT_MS = 180_000;

type Case = {
  id: string;
  description: string;
  body: Record<string, unknown>;
  rubric: string;
};

type CoachReply = {
  reply: string;
  hasStructuredWorkout: boolean;
  hasStructuredProgramme: boolean;
  raw: unknown;
};

type CaseResult = {
  id: string;
  description: string;
  question: string;
  durationMs: number;
  coach:
    | { ok: true; reply: string; hasStructuredWorkout: boolean; hasStructuredProgramme: boolean }
    | { ok: false; error: string };
  pass: boolean;
  reason: string;
};

async function callCoach(body: Record<string, unknown>): Promise<CoachReply> {
  const ctrl = new AbortController();
  const t = setTimeout(() => ctrl.abort(), COACH_TIMEOUT_MS);
  try {
    const res = await fetch(COACH_URL, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(body),
      signal: ctrl.signal,
    });
    if (!res.ok) {
      const text = await res.text();
      throw new Error(`Coach ${res.status}: ${text.slice(0, 500)}`);
    }
    const json = (await res.json()) as {
      reply?: string;
      structuredWorkout?: unknown;
      structuredProgramme?: unknown;
    };
    return {
      reply: typeof json.reply === "string" ? json.reply : "",
      hasStructuredWorkout: json.structuredWorkout != null,
      hasStructuredProgramme: json.structuredProgramme != null,
      raw: json,
    };
  } finally {
    clearTimeout(t);
  }
}

const anthropic = new Anthropic();

async function score(
  question: string,
  reply: string,
  structuredFlags: { hasStructuredWorkout: boolean; hasStructuredProgramme: boolean },
  rubric: string
): Promise<{ pass: boolean; reason: string }> {
  const prompt = `You are evaluating an AI strength coach's reply against a pass/fail rubric.

USER QUESTION:
${question}

COACH REPLY (text):
${reply || "(empty)"}

STRUCTURED OUTPUT FLAGS:
- structuredWorkout returned: ${structuredFlags.hasStructuredWorkout}
- structuredProgramme returned: ${structuredFlags.hasStructuredProgramme}

RUBRIC:
${rubric}

Decide PASS or FAIL strictly against the rubric. Be critical — do not pass a reply that partially fails the rubric.

Respond with ONLY a JSON object on a single line:
{"pass": true|false, "reason": "<one or two sentences citing the specific rubric clause that decided it>"}`;

  const result = await anthropic.messages.create({
    model: SCORER_MODEL,
    max_tokens: 400,
    messages: [{ role: "user", content: prompt }],
  });

  const text = result.content
    .filter((b): b is Anthropic.TextBlock => b.type === "text")
    .map((b) => b.text)
    .join("");

  const match = text.match(/\{[\s\S]*\}/);
  if (!match) {
    return { pass: false, reason: `Scorer returned no JSON object. Raw: ${text.slice(0, 200)}` };
  }
  try {
    const parsed = JSON.parse(match[0]) as { pass?: unknown; reason?: unknown };
    if (typeof parsed.pass !== "boolean" || typeof parsed.reason !== "string") {
      return { pass: false, reason: `Scorer JSON missing fields. Raw: ${match[0].slice(0, 200)}` };
    }
    return { pass: parsed.pass, reason: parsed.reason };
  } catch (err) {
    return { pass: false, reason: `Scorer JSON parse error: ${(err as Error).message}` };
  }
}

async function main() {
  const raw = readFileSync(CASES_PATH, "utf8");
  const { cases } = JSON.parse(raw) as { cases: Case[] };

  console.log(`\nRunning ${cases.length} case(s) against ${COACH_URL}`);
  console.log(`Scorer: ${SCORER_MODEL}\n`);

  const results: CaseResult[] = [];

  for (const c of cases) {
    const question = typeof c.body.message === "string" ? c.body.message : "";
    const start = Date.now();
    let coachOutcome: CaseResult["coach"];
    let pass = false;
    let reason = "";

    try {
      const reply = await callCoach(c.body);
      coachOutcome = {
        ok: true,
        reply: reply.reply,
        hasStructuredWorkout: reply.hasStructuredWorkout,
        hasStructuredProgramme: reply.hasStructuredProgramme,
      };
      const scored = await score(
        question,
        reply.reply,
        {
          hasStructuredWorkout: reply.hasStructuredWorkout,
          hasStructuredProgramme: reply.hasStructuredProgramme,
        },
        c.rubric
      );
      pass = scored.pass;
      reason = scored.reason;
    } catch (err) {
      coachOutcome = { ok: false, error: (err as Error).message };
      pass = false;
      reason = `Coach endpoint error: ${(err as Error).message}`;
    }

    const durationMs = Date.now() - start;
    const tag = pass ? "PASS" : "FAIL";
    console.log(`[${tag}] ${c.id} (${(durationMs / 1000).toFixed(1)}s)`);

    results.push({
      id: c.id,
      description: c.description,
      question,
      durationMs,
      coach: coachOutcome,
      pass,
      reason,
    });
  }

  const passed = results.filter((r) => r.pass).length;
  const total = results.length;
  console.log(`\n${passed}/${total} passed (${Math.round((passed / total) * 100)}%)`);

  const failures = results.filter((r) => !r.pass);
  if (failures.length > 0) {
    console.log(`\nFailures:`);
    for (const f of failures) {
      console.log(`\n  [${f.id}]`);
      console.log(`  reason: ${f.reason}`);
      if (f.coach.ok) {
        const snippet = f.coach.reply.replace(/\s+/g, " ").slice(0, 240);
        console.log(`  reply (first 240 chars): ${snippet}${f.coach.reply.length > 240 ? "..." : ""}`);
      }
    }
  }

  const out = {
    runAt: new Date().toISOString(),
    summary: { total, passed, failed: total - passed },
    scorerModel: SCORER_MODEL,
    coachUrl: COACH_URL,
    cases: results,
  };
  writeFileSync(RESULTS_PATH, JSON.stringify(out, null, 2) + "\n", "utf8");
  console.log(`\nWrote ${RESULTS_PATH}`);

  process.exit(failures.length > 0 ? 1 : 0);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
