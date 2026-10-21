/**
 * The assistant's physique integration (I2). The static block below rides
 * STATIC_COACH_SYSTEM_PROMPT (no per-user interpolation, so the global cache
 * holds); the payload schema and the per-request block formatter live here
 * too, so the route file only exports handlers.
 */

/** Added to STATIC_COACH_SYSTEM_PROMPT. Mirrors 02-engine-spec §10 (must-not-claim). */
export const PHYSIQUE_CONTEXT_INTEGRATION_BLOCK = `
- A separate system message labelled "PHYSIQUE CONTEXT" may accompany requests when the user tracks bodyweight, food or sleep (shown on the Progress tab). It is built deterministically by the physique engine on the user's device: trend weight, rate of change with its window and weigh-in count, the expenditure (maintenance) estimate and its confidence state, calorie and macro targets, adherence, strength and sleep reads, and a verdict with its rule id.
- The verdict is decided. Explain it; do not re-judge it, soften it, or contradict its numbers. If the user disagrees with it, say what extra data would change it rather than substituting your own call.
- Lead with the verdict, then the two strongest numbers behind it, then one action. A few sentences unless asked for more.
- Cite only numbers that appear in the block, and state the window and sample size next to any judgement ("over 28 days, 24 weigh-ins"). Never compute new rates, targets, calories, protein grams or dates yourself. If a number is not in the block, say it is not available yet.
- Must not claim: that the user is losing muscle or has lost muscle (say "lifts are dropping"); kilograms of muscle gained or lost; a body-fat percentage without an error caveat; "metabolic damage", "starvation mode" or "reverse dieting" as evidence-based; sleep stages ("deep sleep", "REM") from a wearable; hormone or testosterone predictions; that a single day's or week's jump is fat; that the extra weight on a bulk is fat (say "in studies, faster gains mostly add fat"); protein needs above about 2.2 g/kg in a surplus or 2.7 g/kg in a deficit; that protein can only be absorbed in some amount per meal; menstrual water retention in kilograms; any eating-disorder or RED-S diagnosis; moralising food language (cheat, earned, bad food); praise ("great job", "crushing it"); exclamation marks.
- Recomposition is neither impossible nor guaranteed; suggest it only when the block does.
- Name confounders before blaming the plan: water shifts at a phase start, creatine, sodium and carbohydrate changes, travel, illness, the menstrual cycle, incomplete food logs, few weigh-ins.
- Diet breaks are adherence and hunger tools, not metabolic ones. Don't state maintenance more precisely than the block's ± range.
- When the block has an ASKED ABOUT section, the user tapped that connection or finding on Progress: answer about it first, from its facts only, in plain words: what was compared, what the numbers mean, and what they can't show (two things moving together is not proof one causes the other). No advice unless the user asks for it.
- When the block is absent and the user asks about bodyweight, calories or sleep, say that weight, food and sleep get logged in the app and shown on Progress, then answer generally and hedge.
`.trim();

// ── Payload validation (server) ──

import { z } from "zod";
import type { AssistantPhysiquePayload } from "@/lib/physique/payload";
import { ASK_FACT_MAX_CHARS, ASK_MAX_FACTS, ASK_TITLE_MAX_CHARS } from "@/lib/physique/askAbout";

const localDate = z.string().regex(/^\d{4}-\d{2}-\d{2}$/);
const num = z.number().finite();
const numOrNull = num.nullable();
const signalState = z.enum(["good", "watch", "attention", "unknown"]);

const verdictSchema = z.object({
  id: z.string().max(24),
  title: z.string().max(120),
  detail: z.string().max(400),
  windowDays: num.optional(),
  n: num.optional(),
  evidenceIds: z.array(z.string().max(40)).max(12).default([]),
  confidence: z.enum(["high", "medium", "low"]).default("medium"),
});

/** The physique analysis as the server reads it. Unknown keys are dropped; nothing is recomputed. */
export const assistantPhysiqueAnalysisSchema = z.object({
  asOf: localDate,
  phase: z.enum(["lose", "maintain", "gain", "none"]),
  data: z
    .object({
      weighIns14: num.default(0),
      loggedShare14: num.default(0),
      nightsLogged14: num.default(0),
      expenditureState: z.enum(["holding", "calibrating", "settling", "stable"]).default("calibrating"),
      partialDaysLeftOut: z.array(localDate).max(31).default([]),
      updatingDays: num.default(0),
    })
    .default({ weighIns14: 0, loggedShare14: 0, nightsLogged14: 0, expenditureState: "calibrating", partialDaysLeftOut: [], updatingDays: 0 }),
  weight: z.object({
    trendKg: numOrNull,
    latestKg: numOrNull.default(null),
    ratePctPerWeek: numOrNull,
    rateWindowDays: numOrNull,
    rateN: numOrNull,
    margin: numOrNull.default(null),
    weighInsNeeded: num.default(0),
  }),
  expenditure: z.object({ kcal: numOrNull, state: z.enum(["holding", "calibrating", "settling", "stable"]), plusMinus: z.union([z.literal(400), z.literal(300)]).nullable() }),
  targets: z.object({ kcal: num, proteinG: num, fatG: num, carbsG: num }).nullable(),
  adherence: z.object({ deltaKcal: numOrNull, onTarget: z.boolean().nullable(), proteinGPerKg: numOrNull, daysLogged: num }),
  strength: z.object({
    status: z.enum(["dropping", "holding", "rising", "one-lift", "unclear"]),
    lifts: z.array(z.object({ name: z.string().max(40), changePct: numOrNull })).max(6),
    baselineMissing: z.boolean(),
    strOk: z.boolean().default(false),
    mainLifts: num.default(0),
    liftsRead: num.default(0),
  }),
  sleep: z.object({
    mean14h: numOrNull,
    nightsLogged14: num,
    status: z.enum(["severe", "short", "ok", "unknown"]),
    acute: z.boolean().default(false),
    source: z.enum(["manual", "wearable", "mixed"]).nullable().default(null),
    debt7h: numOrNull.default(null),
    lastNightH: numOrNull.default(null),
    sleepOk: z.boolean().default(false),
  }),
  training: z.object({ status: z.enum(["novice", "intermediate", "advanced"]), source: z.enum(["lifts", "onboarding", "default"]), medianSlopePctPerWeek: numOrNull }),
  goal: z
    .object({
      type: z.enum(["lose", "maintain", "gain"]),
      targetKg: num,
      ratePctPerWeek: num,
      startDate: localDate,
      startTrendKg: num.optional(),
      trainingStatusAtCreation: z.enum(["novice", "intermediate", "advanced"]).optional(),
    })
    .nullable(),
  verdict: verdictSchema,
  flags: z.array(verdictSchema).max(5),
  recommendation: z.object({ kind: z.string().max(32) }).loose().nullable(),
  recommendationLabel: z.string().max(200).nullable(),
  status: z.object({ state: signalState, label: z.string().max(40) }),
  checkInDue: z.boolean().default(false),
});

const dayNumber = z.object({ d: z.number().int().min(-31).max(0), kg: num });

export const assistantPhysiquePayloadSchema = z.object({
  analysis: assistantPhysiqueAnalysisSchema,
  now: z.object({ today: localDate, tz: z.string().max(64) }),
  recent: z.object({
    weighIns: z.array(dayNumber).max(31),
    intake: z.array(z.object({ d: z.number().int().min(-31).max(0), kcal: num, p: num, status: z.enum(["complete", "partial", "fasting", "unlogged"]) })).max(31),
    sleep: z.array(z.object({ d: z.number().int().min(-31).max(0), h: num })).max(31),
    lifts: z.array(z.object({ name: z.string().max(40), e1rm: z.array(dayNumber).max(5) })).max(6),
    goal: z.object({ type: z.enum(["lose", "maintain", "gain"]), targetKg: num, ratePctPerWeek: num, startDate: localDate }).nullable(),
    targets: z.object({ kcal: num, proteinG: num, fatG: num, carbsG: num, since: localDate }).nullable(),
  }),
  subject: z
    .object({
      kind: z.enum(["connection", "finding"]),
      title: z.string().max(ASK_TITLE_MAX_CHARS),
      facts: z.array(z.string().max(ASK_FACT_MAX_CHARS)).max(ASK_MAX_FACTS),
    })
    .optional(),
});

export type ValidatedPhysiquePayload = z.infer<typeof assistantPhysiquePayloadSchema>;

/** Max serialised size of the physique part of the request body. OURS. */
export const PHYSIQUE_PAYLOAD_MAX_BYTES = 64 * 1024;

export type PhysiqueValidation = { ok: true; payload: ValidatedPhysiquePayload } | { ok: false; error: string };

/** Validate `body.physique`; the route answers 400 on failure and never recomputes the verdict. */
export function validatePhysiquePayload(raw: unknown): PhysiqueValidation {
  let size = 0;
  try {
    size = JSON.stringify(raw).length;
  } catch {
    return { ok: false, error: "physique payload is not serialisable" };
  }
  if (size > PHYSIQUE_PAYLOAD_MAX_BYTES) return { ok: false, error: "physique payload too large" };
  const r = assistantPhysiquePayloadSchema.safeParse(raw);
  if (!r.success) {
    const paths = r.error.issues.slice(0, 5).map((i) => i.path.join(".")).join(", ");
    return { ok: false, error: `physique payload invalid: ${paths}` };
  }
  return { ok: true, payload: r.data };
}

// ── Block formatter (server) ──

/** Upper bound on the block for the largest valid payload (I2 acceptance). OURS. */
export const PHYSIQUE_BLOCK_MAX_CHARS = 2400;
/** Upper bound on the ASKED ABOUT section for the largest valid subject (PR3f), on top of the block. OURS: six facts at their limit plus the heading. */
export const PHYSIQUE_SUBJECT_MAX_CHARS = 1600;

const fmtKg = (v: number | null | undefined) => (v == null ? "n/a" : `${v.toFixed(1)} kg`);
const fmtRate = (v: number | null | undefined) => (v == null ? "n/a" : `${v > 0 ? "+" : ""}${v.toFixed(2)} %/wk`);
const fmtH = (v: number | null | undefined) => (v == null ? "n/a" : `${v.toFixed(1)} h`);
const signed = (v: number) => `${v > 0 ? "+" : ""}${Math.round(v)}`;

/**
 * The PHYSIQUE CONTEXT system block: the decided verdict first, then the
 * numbers behind it, then compact recent facts. Everything the model may
 * cite is here; nothing else about the user's body is sent.
 */
export function formatPhysiqueContextBlock(input: AssistantPhysiquePayload | ValidatedPhysiquePayload): string {
  const a = input.analysis;
  const r = input.recent;
  const lines: string[] = [];
  lines.push("PHYSIQUE CONTEXT (deterministic; computed on the user's device by the physique engine). Cite these numbers only; the verdict is decided.");
  lines.push(`As of ${a.asOf} (${input.now.tz}). Phase: ${a.phase}. Status: ${a.status.state} (${a.status.label}).`);
  lines.push(`VERDICT ${a.verdict.id}: ${a.verdict.title}. ${a.verdict.detail}${a.verdict.windowDays ? ` [window ${a.verdict.windowDays} d${a.verdict.n ? `, n ${a.verdict.n}` : ""}]` : ""}`);
  // Flags carry their title only: their numbers are already in the sections below.
  if (a.flags.length) lines.push(`FLAGS: ${a.flags.slice(0, 3).map((f) => `${f.id} (${f.title})`).join("; ")}.`);
  if (a.recommendationLabel) lines.push(`RECOMMENDATION: ${a.recommendationLabel}`);
  if (a.goal) lines.push(`GOAL: ${a.goal.type} to ${fmtKg(a.goal.targetKg)} at ${fmtRate(a.goal.ratePctPerWeek)}, started ${a.goal.startDate}.`);
  else lines.push("GOAL: none set.");
  lines.push(
    `WEIGHT: trend ${fmtKg(a.weight.trendKg)}, latest ${fmtKg(a.weight.latestKg)}, rate ${fmtRate(a.weight.ratePctPerWeek)}${a.weight.rateWindowDays ? ` over ${a.weight.rateWindowDays} d (${a.weight.rateN ?? "?"} weigh-ins${a.weight.margin != null ? `, ±${a.weight.margin.toFixed(2)}` : ""})` : a.weight.weighInsNeeded > 0 ? ` (${a.weight.weighInsNeeded} more weigh-ins needed)` : ""}.`
  );
  lines.push(
    `EXPENDITURE: ${a.expenditure.kcal == null ? "not available yet" : `${Math.round(a.expenditure.kcal)} kcal/day`}${a.expenditure.plusMinus ? ` ± ${a.expenditure.plusMinus}` : ""} (${a.expenditure.state}, ${a.data.updatingDays} updating days).`
  );
  lines.push(a.targets ? `TARGETS: ${a.targets.kcal} kcal, P ${a.targets.proteinG} g, F ${a.targets.fatG} g, C ${a.targets.carbsG} g.` : "TARGETS: none (no program).");
  lines.push(
    `ADHERENCE (14 d): ${a.adherence.deltaKcal == null ? "not computable" : `${signed(a.adherence.deltaKcal)} kcal/day vs target, ${a.adherence.onTarget ? "on target" : "off target"}`}; ${a.adherence.daysLogged} days logged; protein ${a.adherence.proteinGPerKg == null ? "n/a" : `${a.adherence.proteinGPerKg.toFixed(1)} g/kg`}.`
  );
  const liftList = a.strength.lifts
    .slice(0, 4)
    .map((l) => `${l.name.slice(0, 24)} ${l.changePct == null ? "n/a" : `${l.changePct > 0 ? "+" : ""}${l.changePct.toFixed(1)}%`}`)
    .join(", ");
  lines.push(`STRENGTH: ${a.strength.status}${a.strength.baselineMissing ? " (no pre-phase baseline)" : ""}; main lifts since phase start: ${liftList || "none"}.`);
  lines.push(`SLEEP: ${a.sleep.status}, mean ${fmtH(a.sleep.mean14h)} over ${a.sleep.nightsLogged14} of 14 nights${a.sleep.source ? ` (${a.sleep.source})` : ""}${a.sleep.debt7h != null ? `, 7-day debt ${fmtH(a.sleep.debt7h)}` : ""}${a.sleep.lastNightH != null ? `, last night ${fmtH(a.sleep.lastNightH)}` : ""}${a.sleep.acute ? ", acute short night" : ""}.`);
  lines.push(`TRAINING STATUS: ${a.training.status} (from ${a.training.source}).`);
  lines.push(`DATA (14 d): ${a.data.weighIns14} weigh-ins, ${Math.round(a.data.loggedShare14 * 100)}% of days with food, ${a.data.nightsLogged14} nights${a.data.partialDaysLeftOut.length ? `, ${a.data.partialDaysLeftOut.length} days left out as part-logged` : ""}.${a.checkInDue ? " Check-in due." : ""}`);
  // Recent facts, day offsets relative to today (0 = today).
  if (r.weighIns.length) lines.push(`RECENT WEIGH-INS (day:kg): ${r.weighIns.map((w) => `${w.d}:${w.kg.toFixed(1)}`).join(" ")}`);
  if (r.intake.length) lines.push(`RECENT INTAKE (day:kcal/P g${r.intake.some((i) => i.status !== "complete") ? ", * partial, f fasting" : ""}): ${r.intake.map((i) => `${i.d}:${Math.round(i.kcal)}/${Math.round(i.p)}${i.status === "partial" ? "*" : i.status === "fasting" ? "f" : ""}`).join(" ")}`);
  if (r.sleep.length) lines.push(`RECENT SLEEP (day:h): ${r.sleep.map((s) => `${s.d}:${s.h.toFixed(1)}`).join(" ")}`);
  for (const l of r.lifts.slice(0, 4)) lines.push(`E1RM ${l.name.slice(0, 24)} (day:kg): ${l.e1rm.map((e) => `${e.d}:${e.kg.toFixed(1)}`).join(" ")}`);
  // PR3f: what the user tapped "Ask the coach why" on, as the engine read it.
  const s = input.subject;
  if (s) {
    lines.push(`ASKED ABOUT (${s.kind} on Progress): ${s.title}`);
    for (const f of s.facts) lines.push(`- ${f}`);
  }
  return lines.join("\n");
}
