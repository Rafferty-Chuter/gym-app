/**
 * The words for a scale jump (IN2), kept apart from the engine as
 * `connectionWords.ts` is. Kilos first; the cause in its own units
 * ("160 g more carbs"), which is the person's own lever (B, 08); never
 * fat, never advice. Pure.
 */

import { formatWeight, type WeightUnit } from "@/lib/units";
import { CARB_WATER_KG_PER_G, FOOD_MASS_KG_PER_KCAL, LIST_CARBS_G, LIST_KCAL, type JumpCause, type ScaleJump } from "@/lib/physique/scaleJump";
import { addDays, weekday, type LocalDate } from "@/lib/dates";

const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
const DAYS = ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"];
const n = (v: number) => Math.round(Math.abs(v)).toLocaleString("en-GB");
const shortDate = (d: LocalDate) => `${Number(d.slice(8, 10))} ${MONTHS[Number(d.slice(5, 7)) - 1] ?? ""}`;

/** "Yesterday" / "2 days ago" for today's weigh-in; "The day before" / "2 days before" for a past one. */
function when(daysAgo: 1 | 2, isToday: boolean): string {
  if (isToday) return daysAgo === 1 ? "Yesterday" : "2 days ago";
  return daysAgo === 1 ? "The day before" : "2 days before";
}

/** The last weigh-in, named: "yesterday" for today's, "the day before" for a past one's, else its weekday. */
function previous(j: ScaleJump, isToday: boolean): string {
  if (j.previousDate === addDays(j.date, -1)) return isToday ? "yesterday" : "the day before";
  return DAYS[weekday(j.previousDate)];
}

/** "Up 1.0 kg on yesterday": the move the person saw on the scale. */
export function jumpHeadline(j: ScaleJump, unit: WeightUnit, isToday: boolean): string {
  return `${j.direction === "up" ? "Up" : "Down"} ${formatWeight(Math.abs(j.changeKg), unit, 1)} on ${previous(j, isToday)}`;
}

/** The food parts in the jump's direction: "160 g more carbs", "700 more kcal". */
function foodParts(c: Extract<JumpCause, { kind: "food" }>, up: boolean): string[] {
  const sign = up ? 1 : -1;
  const parts: string[] = [];
  if (sign * c.carbsDeltaG >= LIST_CARBS_G) parts.push(`${n(c.carbsDeltaG)} g ${up ? "more" : "fewer"} carbs`);
  if (sign * c.kcalDelta >= LIST_KCAL) parts.push(`${n(c.kcalDelta)} ${up ? "more" : "fewer"} kcal`);
  // Neither past its listing floor: the one that moved the scale more, by the evidence's sizes.
  if (!parts.length) parts.push(sign * c.carbsDeltaG * CARB_WATER_KG_PER_G >= sign * c.kcalDelta * FOOD_MASS_KG_PER_KCAL ? `${n(c.carbsDeltaG)} g ${up ? "more" : "fewer"} carbs` : `${n(c.kcalDelta)} ${up ? "more" : "fewer"} kcal`);
  return parts;
}

function eventWords(c: Extract<JumpCause, { kind: "event" }>): string {
  switch (c.type) {
    case "creatine_start":
      return `Creatine started ${shortDate(c.date)}`;
    case "period":
      return "Period logged";
    case "illness":
      return "Illness logged";
    case "travel":
      return "Travel logged";
    case "carb_switch":
      return `Carbs changed ${shortDate(c.date)}`;
  }
}

/** One cause in a line: "Yesterday: 160 g more carbs and 700 more kcal than usual". */
function causeWords(c: JumpCause, up: boolean, isToday: boolean): string {
  if (c.kind === "food") return `${when(c.daysAgo, isToday)}: ${foodParts(c, up).join(" and ")} than usual`;
  if (c.kind === "legs") return `${when(c.daysAgo, isToday)}: legs, ${c.hardSets} hard sets`;
  return eventWords(c);
}

/**
 * What was logged behind the move, the largest first, or what wasn't:
 * "Yesterday's food isn't logged", "Nothing logged yesterday stands out".
 */
export function jumpCauseLine(j: ScaleJump, isToday: boolean): string {
  const up = j.direction === "up";
  if (j.causes.length) return j.causes.map((c) => causeWords(c, up, isToday)).join(" · ");
  if (j.foodLog === "unlogged") return isToday ? "Yesterday's food isn't logged" : "The day before isn't logged";
  if (j.foodLog === "partial") return isToday ? "Yesterday's log looks incomplete" : "The day before's log looks incomplete";
  return isToday ? "Nothing logged yesterday stands out" : "Nothing logged the day before stands out";
}

/** "Your last 4 jumps like this were gone in 2 to 3 days"; null below `SETTLE_MIN_JUMPS`. */
export function jumpSettleLine(j: ScaleJump): string | null {
  const s = j.settle;
  if (!s) return null;
  const days = s.minDays === s.maxDays ? `${s.minDays} ${s.minDays === 1 ? "day" : "days"}` : `${s.minDays} to ${s.maxDays} days`;
  return j.direction === "up" ? `Your last ${s.jumps} jumps like this were gone in ${days}` : `Your last ${s.jumps} drops like this were back in ${days}`;
}

/** One line for small spaces (the weigh-in sheet, the weigh-in list): "Up 1.0 kg · 160 g more carbs yesterday". */
export function jumpShort(j: ScaleJump, unit: WeightUnit, isToday: boolean): string {
  const up = j.direction === "up";
  const head = `${up ? "Up" : "Down"} ${formatWeight(Math.abs(j.changeKg), unit, 1)}`;
  const c = j.causes[0];
  if (!c) return head;
  if (c.kind === "food") return `${head} · ${foodParts(c, up)[0]} ${when(c.daysAgo, isToday).toLowerCase()}`;
  if (c.kind === "legs") return `${head} · legs ${when(c.daysAgo, isToday).toLowerCase()}`;
  return `${head} · ${eventWords(c).charAt(0).toLowerCase()}${eventWords(c).slice(1)}`;
}
