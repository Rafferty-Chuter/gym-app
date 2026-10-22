/**
 * Spotted (IN10, 08-insights.md): what the engines found, at most three
 * facts, biggest and newest first, at the top of Progress and the weekly
 * report. Apple Health's Highlights and WHOOP's insight rows put the few
 * things worth reading first and the full data below; here the facts come
 * from the engines as they are, never recomputed:
 *
 * - a scale jump this morning or yesterday (IN2, `scaleJump.ts`),
 * - a main lift flat or dropping (IN4, `liftPlateau.ts`),
 * - one clear link between a condition and the lifts (IN5,
 *   `connections.ts`), only while it is news: a session on its weaker side
 *   in the last week (the lift card under Spotted lists every link),
 * - the four-week findings (E1, `findings.ts`), which fold in here.
 *
 * Each fact is sized against its own floor (how far past the gate that let
 * it speak) and halves in weight each week it gets older; the top three
 * are kept, one per topic. Each carries its working (the numbers behind
 * it, shown on a tap) and the days or weeks behind it, which the charts
 * mark. Words come from each engine's own words file; the B rule (08)
 * holds: facts that point at the person's own lever, never advice.
 *
 * Pure: engine results, `today` and the unit in, ranked facts out.
 */

import { addDays, dayDiff, type LocalDate } from "@/lib/dates";
import { CONN_MIN_EFFECT_PCT, type Connection, type ConnectionId, type ConnectionsResult } from "@/lib/physique/connections";
import { FIND_WINDOW_DAYS, type Finding, type FindingId } from "@/lib/physique/findings";
import { formatEffect, type ReferenceLift } from "@/lib/physique/liftEffect";
import { linkCharts, linkOnLift, linkTitle, weakerDays, weakerLabel, weakerPhrase, weakerRecent } from "@/lib/physique/liftLinks";
import { DROP_MIN_PCT, FLAT_MIN_SESSIONS, type StuckChange, type StuckLift } from "@/lib/physique/liftPlateau";
import { stuckChangesLine, stuckTitle, stuckValue } from "@/lib/physique/liftPlateauWords";
import { JUMP_MIN_KG, JUMP_SPREAD_MULT, scaleJump, type ScaleJump, type ScaleJumpInputs } from "@/lib/physique/scaleJump";
import { jumpCauseLine, jumpHeadline, jumpSettleLine } from "@/lib/physique/scaleJumpWords";
import { formatBodyWeight, formatWeight, type WeightUnit } from "@/lib/units";

// ── Thresholds ──

/** Facts shown at most. OURS (08 IN10): three; a fourth makes a list, not a headline. */
export const SPOTTED_MAX = 3;
/** Facts of one kind at most, so one stalled lift after another doesn't hide the rest. OURS. */
export const SPOTTED_MAX_PER_KIND = 2;
/** Links shown at most; the lift card right under Spotted lists every one. OURS. */
export const SPOTTED_MAX_LINKS = 1;
/** Days over which a fact's weight halves. OURS: a week, the app's review cycle; today's fact counts twice a week-old one of the same size. */
export const SPOTTED_HALF_LIFE_DAYS = 7;
/** Most a fact's size counts, in times past its own floor. OURS: three times its floor is plainly real; more should not bury a newer fact. */
export const SPOTTED_SIZE_CAP = 3;
/** Days a scale jump stays news. OURS: its water is usually gone in 2 to 3 days (IN2), so it shows that morning and the next. */
export const SPOTTED_JUMP_DAYS = 1;
/** Days a link stays news after a session on its weaker side, and the days its recent weaker sessions are counted over. OURS: a week; past it the link is a standing fact, and the lift card holds those. */
export const SPOTTED_LINK_DAYS = 7;

// ── Types ──

export type SpottedKind = "jump" | "stuck" | "link" | "finding";

/** One line of the working: a label and its number (Garmin's detail sheet), or a sentence alone. */
export type WorkingRow = { label: string; value?: string };

type Base = {
  /** Stable across renders: "jump", "stuck:<lift key>", "link:<condition>", "finding:<id>". */
  key: string;
  /** Facts on the same topic are one fact: the stronger stays. */
  topic: string;
  /** The newest day the fact covers. */
  date: LocalDate;
  /** Times past its own floor (1 is just past it). */
  size: number;
  /** Size, capped, halved for each SPOTTED_HALF_LIFE_DAYS of age. */
  score: number;
  /** The plain finding, a few words. */
  title: string;
  /** Its numbers, one line. */
  detail: string;
  /** What a tap shows. */
  working: WorkingRow[];
  /** Days behind it, marked on the charts, and what they are. */
  days: LocalDate[];
  daysLabel: string | null;
  /** Or the first day of a stretch behind it, its weeks marked. */
  from: LocalDate | null;
  /** The charts it is about (Timeline ids, or "strength" for the lifts). */
  charts: string[];
};

export type SpottedItem = Base & ({ kind: "jump"; jump: ScaleJump } | { kind: "stuck"; stuck: StuckLift } | { kind: "link"; connection: Connection } | { kind: "finding"; finding: Finding });

export type SpottedInputs = {
  today: LocalDate;
  unit: WeightUnit;
  /** The latest weigh-in's jump (IN2), when it jumped. */
  jump: ScaleJump | null;
  stuck: readonly StuckLift[];
  connections: ConnectionsResult | null;
  findings: readonly Finding[];
  /** The lift a link's kilos are put on. */
  lift: ReferenceLift | null;
};

// ── Charts each fact is about ──

/** The charts each finding is about (PR2). */
export const FINDING_CHARTS: Record<FindingId, string[]> = {
  underlog: ["calories", "weight"],
  "sleep-lifts": ["sleep", "strength"],
  "protein-low": ["protein"],
  "gain-fast": ["weight", "calories"],
  "cut-fast-lifts": ["weight", "strength"],
};

const FINDING_TOPIC: Record<FindingId, string> = { underlog: "food-log", "sleep-lifts": "sleep", "protein-low": "protein", "gain-fast": "rate", "cut-fast-lifts": "rate" };

/** Sleep's conditions are one topic with the sleep finding. */
const SLEEP_IDS: ReadonlySet<ConnectionId> = new Set(["sleep", "wake", "shortRun", "hrv"]);

const CHANGE_CHART: Record<StuckChange["kind"], string> = { sets: "training", frequency: "training", reps: "training", deload: "training", sleep: "sleep", shortNights: "sleep", balance: "calories", protein: "protein", cutPace: "weight" };

// ── Helpers ──

const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
/** "1 Sep", kept on one line. */
const shortDate = (d: LocalDate) => `${Number(d.slice(8, 10))}\u00a0${MONTHS[Number(d.slice(5, 7)) - 1] ?? ""}`;
const unsigned = (s: string) => s.replace(/^[+−]/, "");

function score(size: number, date: LocalDate, today: LocalDate): number {
  const age = Math.max(0, dayDiff(date, today));
  return Math.min(size, SPOTTED_SIZE_CAP) * 0.5 ** (age / SPOTTED_HALF_LIFE_DAYS);
}

// ── Each kind ──

function jumpItem(j: ScaleJump, today: LocalDate, unit: WeightUnit): SpottedItem | null {
  const age = dayDiff(j.date, today);
  if (age < 0 || age > SPOTTED_JUMP_DAYS) return null;
  const isToday = age === 0;
  const size = Math.abs(j.deltaKg) / Math.max(JUMP_MIN_KG, JUMP_SPREAD_MULT * j.spreadKg);
  // Causes read from a day before (food, legs, and any added later) mark that day; events mark nothing.
  const causeDays = j.causes.flatMap((c) => ("daysAgo" in c ? [addDays(j.date, -c.daysAgo)] : []));
  const settle = jumpSettleLine(j);
  const working: WorkingRow[] = [
    { label: isToday ? "Scale today" : "Scale", value: formatBodyWeight(j.scaleKg, unit) },
    { label: "Expected from the last 3 weeks", value: formatBodyWeight(j.expectedKg, unit) },
    { label: "Your usual day-to-day", value: `± ${formatWeight(j.spreadKg, unit, 1)}` },
    ...(settle ? [{ label: settle }] : []),
  ];
  return {
    kind: "jump",
    jump: j,
    key: "jump",
    topic: "scale",
    date: j.date,
    size,
    score: score(size, j.date, today),
    title: jumpHeadline(j, unit, isToday),
    detail: jumpCauseLine(j, isToday),
    working,
    days: [...new Set([j.date, ...causeDays])].sort(),
    daysLabel: causeDays.length ? "the weigh-in and the day before" : "the weigh-in",
    from: null,
    charts: ["weight", "calories", ...(j.causes.some((c) => c.kind === "legs") ? ["training"] : [])],
  };
}

function stuckItem(l: StuckLift, today: LocalDate, unit: WeightUnit): SpottedItem {
  const size = l.state === "flat" ? l.sessions / FLAT_MIN_SESSIONS : Math.abs(l.changePct) / DROP_MIN_PCT;
  const changes = l.changes ?? [];
  const working: WorkingRow[] = [{ label: "Est. 1RM", value: `${stuckValue(l, unit)} since ${shortDate(l.since)}` }];
  if (changes.length > 2) working.push({ label: stuckChangesLine(l, unit, changes.length) });
  return {
    kind: "stuck",
    stuck: l,
    key: `stuck:${l.key}`,
    topic: `lift:${l.key}`,
    // A stall is the state of the lift now, not something that happened on its first day.
    date: today,
    size,
    score: score(size, today, today),
    title: stuckTitle(l, unit),
    detail: stuckChangesLine(l, unit, 2),
    working,
    days: [],
    daysLabel: null,
    from: l.since,
    charts: ["strength", ...new Set(changes.map((c) => CHANGE_CHART[c.kind]))],
  };
}

function linkItem(c: Connection, today: LocalDate, lift: ReferenceLift | null, unit: WeightUnit): SpottedItem | null {
  const on = linkOnLift(c, lift);
  const size = Math.abs(on.pct) / CONN_MIN_EFFECT_PCT;
  const days = weakerDays(c, on.pct);
  const date = days.filter((d) => d <= today).at(-1);
  if (!date || dayDiff(date, today) >= SPOTTED_LINK_DAYS) return null;
  const kg = on.kg != null ? unsigned(formatEffect(Math.abs(on.kg), unit)) : null;
  const way = on.pct > 0 ? "higher" : "lower";
  const effect = kg && !/^0 /.test(kg) && lift ? `${lift.name} est. 1RM about ${kg} ${way}` : `Est. 1RM about ${Math.abs(on.pct).toFixed(1)}% ${way}`;
  // What is new: how many sessions this week were on the weaker side, the person's own lever (B, 08).
  const recent = weakerRecent(c, today, SPOTTED_LINK_DAYS, on.pct);
  return {
    kind: "link",
    connection: c,
    key: `link:${c.id}`,
    topic: SLEEP_IDS.has(c.id) ? "sleep" : `link:${c.id}`,
    date,
    size,
    score: score(size, date, today),
    title: linkTitle(c, on.pct),
    detail: `${effect} · ${recent} ${recent === 1 ? "session" : "sessions"} ${weakerPhrase(c, on.pct)} in the last 7 days`,
    // The working is the sessions themselves, drawn as dots on the lift (the lift card's strip).
    working: [],
    days,
    daysLabel: weakerLabel(c, on.pct),
    from: null,
    charts: linkCharts(c.id),
  };
}

function findingItem(f: Finding, today: LocalDate): SpottedItem {
  // Findings carry no size of their own: each is just past its evidence threshold.
  const size = 1;
  return {
    kind: "finding",
    finding: f,
    key: `finding:${f.id}`,
    topic: FINDING_TOPIC[f.id],
    date: today,
    size,
    score: score(size, today, today),
    title: f.title,
    detail: f.fact,
    working: [{ label: `Studies: ${f.evidence}` }],
    days: [],
    daysLabel: null,
    from: addDays(today, -(FIND_WINDOW_DAYS - 1)),
    charts: FINDING_CHARTS[f.id],
  };
}

/** The latest weigh-in's jump to `today` while it is still news (SPOTTED_JUMP_DAYS), else null. */
export function latestJump(i: ScaleJumpInputs, today: LocalDate): ScaleJump | null {
  const last = i.weighIns.reduce<LocalDate>((m, w) => (w.date <= today && w.date > m ? w.date : m), "");
  if (!last || dayDiff(last, today) > SPOTTED_JUMP_DAYS) return null;
  return scaleJump(i, last);
}

// ── Ranking ──

const KIND_ORDER: Record<SpottedKind, number> = { jump: 0, stuck: 1, link: 2, finding: 3 };

/**
 * Every fact the engines found, ranked: the highest score first (on a tie,
 * a jump, then a stall, a link, a finding), one per topic, at most
 * SPOTTED_MAX_PER_KIND of a kind and SPOTTED_MAX_LINKS links, SPOTTED_MAX
 * in all. Empty when nothing was found.
 */
export function spotted(i: SpottedInputs): SpottedItem[] {
  const all: SpottedItem[] = [];
  const j = i.jump ? jumpItem(i.jump, i.today, i.unit) : null;
  if (j) all.push(j);
  for (const l of i.stuck) all.push(stuckItem(l, i.today, i.unit));
  for (const c of i.connections?.items ?? []) {
    const l = c.state === "linked" ? linkItem(c, i.today, i.lift, i.unit) : null;
    if (l) all.push(l);
  }
  for (const f of i.findings) all.push(findingItem(f, i.today));
  all.sort((a, b) => b.score - a.score || KIND_ORDER[a.kind] - KIND_ORDER[b.kind]);
  const out: SpottedItem[] = [];
  const topics = new Set<string>();
  const kinds = new Map<SpottedKind, number>();
  for (const s of all) {
    if (out.length >= SPOTTED_MAX) break;
    const k = kinds.get(s.kind) ?? 0;
    if (topics.has(s.topic) || k >= SPOTTED_MAX_PER_KIND || (s.kind === "link" && k >= SPOTTED_MAX_LINKS)) continue;
    topics.add(s.topic);
    kinds.set(s.kind, k + 1);
    out.push(s);
  }
  return out;
}
