/**
 * What moves your lift (IN10, 08-insights.md): the Connections read (IN5)
 * for one main lift at a time, laid out as WHOOP's Behavior Insights lays
 * out behaviours. Each clear link is a row on one axis, weaker to the left
 * and stronger to the right, in kilos of estimated 1RM on that lift,
 * largest first, led by the plain finding ("Weaker after two short
 * nights"; the founder, 22 Oct: kilos alone read like one set). The rest
 * fold into two lines instead of a row each (the IN5 card could list 14,
 * most "No clear link"):
 *
 * - "Not enough to tell yet": a condition the engine left out (too few
 *   days in a group, its own count gate), or one it read whose groups
 *   could not yet have shown a 3 kg difference on this lift, with about
 *   how many more sessions until they could (the signal gate, 08 "Two
 *   gates, both visible").
 * - "No clear link": read, could have shown 3 kg, and didn't.
 *
 * The signal gate is a display rule over the engine's own groups, not a
 * second test: nothing is made a link here, a quiet row is only told
 * apart from "too little to tell". Condition ids are read generically, so
 * ones added later (alcohol, salt) need no work here.
 *
 * Pure: the connections result, the lift and the unit in, rows out.
 */

import { CONN_MIN_EFFECT_PCT, CONNECTION_IDS, type Connection, type ConnectionId, type ConnectionsResult } from "@/lib/physique/connections";
import { CONNECTION_NOUN } from "@/lib/physique/connectionWords";
import { effectKg, formatEffect, type ReferenceLift } from "@/lib/physique/liftEffect";
import { stdev } from "@/lib/stats";
import { addDays, type LocalDate } from "@/lib/dates";
import type { WeightUnit } from "@/lib/units";

// ── Thresholds ──

/** z the engine's test needs, about, for its strongest condition. OURS: Benjamini–Hochberg at q 0.10 across 14 conditions puts the first at p ≈ 0.007, z ≈ 2.45. */
export const GATE_Z = 2.5;
/** z for an 80% chance of seeing a real difference of the target size. PUB: the usual power convention. */
export const GATE_POWER_Z = 0.84;
/** The difference on the lift the groups must be able to show before "No clear link" is said, kg of estimated 1RM. OURS (08 IN10): 3 kg, a plate pair a lifter feels. */
export const GATE_SEE_KG = 3;
/** The same in percent when there is no lift to put it on. EVID: research L §3, short nights cost about 3% of a top set. */
export const GATE_SEE_PCT = 3;
/** More sessions past which the count is not given. OURS: two years at three a week is not a promise worth making. */
export const GATE_MAX_MORE = 300;

// ── Words ──

/**
 * The upper third (or the yes group) as the end of a plain finding:
 * "Weaker after two short nights", "Stronger after longer nights". A
 * condition missing here reads from its label.
 */
const UPPER: Partial<Record<ConnectionId, string>> = {
  sleep: "after longer nights",
  wake: "after waking early",
  shortRun: "after two short nights",
  hrv: "when HRV is above your usual",
  carbs: "after higher-carb days",
  balance: "after higher-calorie days",
  balance3: "after three higher-calorie days",
  protein: "after higher-protein days",
  time: "in later sessions",
  awake: "longer after waking",
  rest: "after longer breaks",
  lastSame: "after longer gaps between sessions of a lift",
  load: "after weeks with more hard sets",
};

/** The weight trend's upper third depends on which side of zero both thirds sit (as `connectionWords`). */
function rateUpper(high: number, low: number): string {
  if (high <= 0) return "when losing more slowly";
  if (low >= 0) return "when gaining faster";
  return "when gaining rather than losing";
}

/** "Weaker after two short nights": the direction first, then the upper group. */
export function linkTitle(c: Connection, pct: number = c.diffPct): string {
  const dir = pct > 0 ? "Stronger" : "Weaker";
  const upper = c.id === "rate" ? rateUpper(c.high.mean, c.low.mean) : UPPER[c.id];
  if (upper) return `${dir} ${upper}`;
  const label = c.label.charAt(0).toLowerCase() + c.label.slice(1);
  return c.kind === "yesno" ? `${dir}: ${label}` : `${dir} with more ${label}`;
}

/** A condition's name in a list ("carbs", "early wakes"), for one the words don't know yet its label. */
export function conditionNoun(id: ConnectionId, label?: string): string {
  return (CONNECTION_NOUN as Partial<Record<ConnectionId, string>>)[id] ?? (label ? label.charAt(0).toLowerCase() + label.slice(1) : id);
}

/** "sleep, carbs and protein", "sleep, carbs and 4 more". */
export function nameList(names: readonly string[], max = 3): string {
  if (names.length <= max) return names.length < 2 ? (names[0] ?? "") : `${names.slice(0, -1).join(", ")} and ${names.at(-1)}`;
  return `${names.slice(0, max).join(", ")} and ${names.length - max} more`;
}

/** A number kept on one line with what follows it ("7h 42m", "312 g", "3 kg"), for lines that wrap. */
export function glueNumbers(s: string): string {
  return s.replace(/(\d\w*) (?=\d|g\b|kg\b|lb\b|kcal\b|SD\b)/g, "$1\u00a0");
}

// ── One lift ──

/** A link's size on a lift: its own read once it has the sessions (IN5), else the read across lifts on its level. */
export function linkOnLift(c: Connection, lift: ReferenceLift | null): { pct: number; kg: number | null; own: boolean } {
  const per = lift ? c.perLift.find((p) => p.name === lift.name) : undefined;
  if (per) return { pct: per.pct, kg: per.kg, own: per.own };
  return { pct: c.diffPct, kg: lift ? effectKg(c.diffPct, lift.levelKg) : null, own: false };
}

/** "+4.5 kg", or "−1.8%" when there is no lift or it rounds to nothing on it. */
export function linkValue(c: Connection, lift: ReferenceLift | null, unit: WeightUnit): string {
  const { pct, kg } = linkOnLift(c, lift);
  const v = kg != null ? formatEffect(kg, unit) : null;
  if (v && !/^0 /.test(v)) return v;
  return `${pct > 0 ? "+" : pct < 0 ? "−" : ""}${Math.abs(pct).toFixed(1)}%`;
}

/**
 * The difference the two groups could show, %: 80% of the time a real
 * difference this size would clear about the engine's bar, from the spread
 * of each group's sessions against their lifts' own course. Null with
 * fewer than two sessions a group.
 */
export function detectablePct(c: Connection): number | null {
  const h = c.points.high.map((p) => p.pct);
  const l = c.points.low.map((p) => p.pct);
  if (h.length < 2 || l.length < 2) return null;
  const se = Math.sqrt(stdev(h) ** 2 / h.length + stdev(l) ** 2 / l.length);
  return (GATE_Z + GATE_POWER_Z) * se;
}

/** The difference that must be visible on this lift before "No clear link", %: GATE_SEE_KG on its level, never under the engine's own floor. */
export function seeTargetPct(lift: ReferenceLift | null): number {
  if (!lift || !(lift.levelKg > 0)) return GATE_SEE_PCT;
  return Math.max(CONN_MIN_EFFECT_PCT, (GATE_SEE_KG / lift.levelKg) * 100);
}

export type LinkRow = {
  c: Connection;
  /** Shrunk difference on this lift, upper group against lower, % and kg of estimated 1RM. */
  pct: number;
  kg: number | null;
  /** Read from this lift's own sessions. */
  own: boolean;
  title: string;
};

export type GateRow = {
  id: ConnectionId;
  noun: string;
  /** The engine's read; null when it left the condition out (its own count gate). */
  c: Connection | null;
  /** About how many more sessions until the groups could show GATE_SEE_KG; null when left out or past GATE_MAX_MORE. */
  more: number | null;
  /** How far along, 0 to 1; null when not known. */
  share: number | null;
};

export type LiftLinksModel = {
  lift: ReferenceLift | null;
  /** Clear links, the largest on this lift first. */
  linked: LinkRow[];
  /** Read, could have shown the target, and didn't. */
  noLink: Connection[];
  /** Too little to tell yet: the nearest first, then the ones left out. */
  notYet: GateRow[];
  /** The fewest more sessions among `notYet`, for its folded line. */
  soonest: number | null;
};

/** Sessions read for a condition: both groups, and for thirds the middle third too; never more than the sessions read in all (groups split at the median on ties hold nearly all of them). */
function readSessions(c: Connection, all: number): number {
  const groups = c.high.sessions + c.low.sessions;
  return c.kind === "yesno" ? groups : Math.min(Math.round(groups * 1.5), Math.max(groups, all));
}

/**
 * The Connections read for one lift: clear links as rows, then what isn't
 * clear yet and what has no clear link, each folded to a line.
 */
export function liftLinks(result: ConnectionsResult, lift: ReferenceLift | null): LiftLinksModel {
  const linked: LinkRow[] = [];
  const noLink: Connection[] = [];
  const notYet: GateRow[] = [];
  const target = seeTargetPct(lift);
  for (const c of result.items) {
    if (c.state === "linked") {
      const on = linkOnLift(c, lift);
      linked.push({ c, pct: on.pct, kg: on.kg, own: on.own, title: linkTitle(c, on.pct) });
      continue;
    }
    // Folded into a link that rose and fell with it (C7): said on that row, not here.
    if (result.items.some((x) => x.movedWith === c.id)) continue;
    const see = detectablePct(c);
    if (see != null && see <= target) {
      noLink.push(c);
      continue;
    }
    const n = readSessions(c, result.sessions);
    const ratio = see != null ? (see / target) ** 2 : null;
    const more = ratio != null ? Math.max(1, Math.ceil(n * (ratio - 1))) : null;
    notYet.push({ id: c.id, noun: conditionNoun(c.id, c.label), c, more: more != null && more <= GATE_MAX_MORE ? more : null, share: ratio != null ? Math.min(1, 1 / ratio) : null });
  }
  // Below the engine's own count gate nothing is read, so nothing is "not yet" per condition: the card shows the sessions so far instead.
  if (result.items.length) {
    const read = new Set(result.items.map((c) => c.id));
    for (const id of CONNECTION_IDS) if (!read.has(id)) notYet.push({ id, noun: conditionNoun(id), c: null, more: null, share: null });
  }
  linked.sort((a, b) => Math.abs(b.kg ?? b.pct) - Math.abs(a.kg ?? a.pct));
  notYet.sort((a, b) => (a.more ?? Infinity) - (b.more ?? Infinity));
  const soonest = notYet.reduce<number | null>((m, g) => (g.more != null && (m == null || g.more < m) ? g.more : m), null);
  return { lift, linked, noLink, notYet, soonest };
}

// ── For Spotted and the charts ──

/** The chart a condition is drawn on (Timeline ids); one missing here marks the lifts only. */
const CONDITION_CHART: Partial<Record<ConnectionId, string>> = { sleep: "sleep", wake: "sleep", shortRun: "sleep", awake: "sleep", hrv: "hrv", carbs: "calories", balance: "calories", balance3: "calories", protein: "protein", time: "training", rest: "training", lastSame: "training", load: "training", rate: "weight" };

/** The charts a link is about: its condition's and the lifts'. */
export function linkCharts(id: ConnectionId): string[] {
  const chart = CONDITION_CHART[id];
  return chart ? [chart, "strength"] : ["strength"];
}

/** The group a link's lifts were weaker in: the lower third (or no) when more helped, the upper (or yes) when it hurt. */
export function weakerSide(c: Connection, pct: number = c.diffPct): "high" | "low" {
  return pct > 0 ? "low" : "high";
}

/**
 * Each group's sessions in words that follow "2 sessions": the upper third
 * (or yes) first, then the lower (or no). A condition missing here reads
 * from its label.
 */
const SESSIONS: Partial<Record<ConnectionId, [upper: string, lower: string]>> = {
  sleep: ["after a longer night", "after a shorter night"],
  wake: ["after an early wake", "after a usual wake"],
  shortRun: ["after two short nights", "after other nights"],
  hrv: ["on a higher-HRV morning", "on a lower-HRV morning"],
  carbs: ["after a higher-carb day", "after a lower-carb day"],
  balance: ["after a higher-calorie day", "after a lower-calorie day"],
  balance3: ["after three higher-calorie days", "after three lower-calorie days"],
  protein: ["after higher-protein days", "after lower-protein days"],
  time: ["later in the day", "earlier in the day"],
  awake: ["long after waking", "soon after waking"],
  rest: ["after a longer break", "after a shorter break"],
  lastSame: ["after a longer gap since the lift", "after a shorter gap since the lift"],
  load: ["after a heavier week", "after a lighter week"],
  rate: ["with the weight trend higher", "with the weight trend lower"],
};

/** The weaker group's sessions in words: "after a shorter night", "after two short nights", "with more salt the day before". */
export function weakerPhrase(c: Connection, pct: number = c.diffPct): string {
  const side = weakerSide(c, pct);
  const known = SESSIONS[c.id];
  if (known) return known[side === "high" ? 0 : 1];
  const label = c.label.charAt(0).toLowerCase() + c.label.slice(1);
  if (c.kind === "yesno") return side === "high" ? `with ${label}` : `without ${label}`;
  return side === "high" ? `with more ${label}` : `with less ${label}`;
}

/** What the charts mark for a link: "sessions after a shorter night (6h 00m)", the group's average for a range. */
export function weakerLabel(c: Connection, pct: number = c.diffPct): string {
  const g = c[weakerSide(c, pct)];
  return `sessions ${weakerPhrase(c, pct)}${c.kind === "range" ? ` (${g.value})` : ""}`;
}

/** The days in the weaker group, oldest first: the days a chart marks for the link. */
export function weakerDays(c: Connection, pct: number = c.diffPct): LocalDate[] {
  return c.points[weakerSide(c, pct)].map((p) => p.date).sort();
}

/** Sessions in a link's weaker group within the last `days` to `through`: how often the person was on that side lately. */
export function weakerRecent(c: Connection, through: LocalDate, days: number, pct: number = c.diffPct): number {
  const from = addDays(through, -(days - 1));
  return weakerDays(c, pct).filter((d) => d >= from && d <= through).length;
}
