/**
 * "Ask the coach why" on Progress (PR3f). The cards are short on purpose
 * (the founder: the explaining is the coach's job), so a connection or a
 * finding can be handed to the assistant with its own numbers. The engine
 * did the maths; these are its results as sentences, which the assistant
 * may explain and must not recompute (CLAUDE.md rule 2).
 *
 * Pure: an engine result in, the subject and the question out.
 */

import type { Connection, ConnectionsResult } from "@/lib/physique/connections";
import type { Finding } from "@/lib/physique/findings";
import { effectKg, formatEffect, type ReferenceLift } from "@/lib/physique/liftEffect";
import { formatWeight, type WeightUnit } from "@/lib/units";

// ── Limits ──

/** Characters a fact may carry. OURS: two lines of a sentence; the server rejects longer. */
export const ASK_FACT_MAX_CHARS = 240;
/** Facts a subject carries. OURS: what was compared, the kilos, the verdict, a confound, the scope, the studies. */
export const ASK_MAX_FACTS = 6;
/** Characters a subject's title may carry. */
export const ASK_TITLE_MAX_CHARS = 80;

export type AskSubject = {
  kind: "connection" | "finding";
  title: string;
  facts: string[];
};

const pct = (v: number) => `${v > 0 ? "+" : v < 0 ? "−" : ""}${Math.abs(v).toFixed(1)}%`;
const clip = (s: string, n: number) => (s.length <= n ? s : `${s.slice(0, n - 1).trimEnd()}…`);

function subject(kind: AskSubject["kind"], title: string, facts: string[]): AskSubject {
  return { kind, title: clip(title, ASK_TITLE_MAX_CHARS), facts: facts.slice(0, ASK_MAX_FACTS).map((f) => clip(f, ASK_FACT_MAX_CHARS)) };
}

/** A connection as the engine read it: both groups, the kilos on the reference lift, clear or not, what moved with it, the scope and the studies. */
export function connectionSubject(c: Connection, r: ConnectionsResult, lift: ReferenceLift | null, unit: WeightUnit, mergedWithLabel: string | null = null, movedWithLabel: string | null = null): AskSubject {
  const facts = [
    `${c.high.sessions} sessions after ${c.high.value} averaged ${pct(c.high.pct)} against each lift's own usual; ${c.low.sessions} sessions after ${c.low.value} averaged ${pct(c.low.pct)}. Difference ${pct(c.diffPct)}.`,
  ];
  // IN5: the same size the row's headline gives: the lift's own read once it has the sessions.
  const own = lift ? c.perLift?.find((p) => p.name === lift.name && p.own) : undefined;
  if (lift) facts.push(`On ${lift.name} (estimated 1RM about ${formatWeight(lift.levelKg, unit, 0)}) that difference is about ${formatEffect(effectKg(own?.pct ?? c.diffPct, lift.levelKg), unit)}${own ? `, from its own ${own.sessions} sessions` : ""}.`);
  facts.push(c.state === "linked" ? "The app calls this a clear link: the difference held up to its test for chance across everything it checked." : mergedWithLabel ? `This rose and fell with ${mergedWithLabel} across the same sessions, so the app shows them as one and can't tell them apart.` : "The app calls this no clear link: the two groups overlap.");
  if (movedWithLabel) facts.push(`${movedWithLabel} rose and fell with this across the same sessions, so the two can't be told apart.`);
  facts.push(`Read over ${r.weeks} weeks: ${r.sessions} sessions, ${r.checked} things checked.`);
  if (c.evidence) facts.push(`Studies: ${c.evidence.text} (${c.evidence.source})`);
  return subject("connection", c.label, facts);
}

/** A finding as the engine read it: the one-line fact, the full numbers sentence by sentence, and the studies. */
export function findingSubject(f: Finding): AskSubject {
  // Split at a full stop before a capital, so decimals ("1.79 g") stay whole.
  const sentences = f.data.replace(/\.\s+(?=[A-Z])/g, ".\u0000").split("\u0000").map((s) => s.trim()).filter(Boolean);
  return subject("finding", f.title, [f.fact, ...sentences.slice(0, ASK_MAX_FACTS - 2), `Studies: ${f.evidence}`]);
}

/** The question the assistant receives with the subject. */
export function askPrompt(s: AskSubject): string {
  return `Why does Progress show "${s.title}"? Explain it from my numbers.`;
}
