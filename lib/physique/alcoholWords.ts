/**
 * The words for the alcohol read (IN9), kept apart from the engine as
 * `connectionWords.ts` is. After WHOOP's behaviour rows and Bevel's 5-yes,
 * 5-no counters: each outcome a label, one number, and the lag and counts
 * under it ("Next day · 7 vs 40 nights"). Says what followed, never why;
 * nothing about how much to drink (02 §10 rule 15). Pure.
 */

import { ALC_MIN_EACH, type AlcoholLink, type AlcoholOutcome, type AlcoholRead } from "@/lib/physique/alcohol";
import { SHAW, type ConnectionEvidence } from "@/lib/physique/connections";
import { formatHoursMin } from "@/lib/physique/dayTotals";
import { kgToDisplay, type WeightUnit } from "@/lib/units";

/** What studies found, for the card's small print and the assistant. */
export const ALCOHOL_EVIDENCE: { nights: ConnectionEvidence; strength: ConnectionEvidence } = {
  nights: { text: "In 4,098 people wearing heart-rate monitors, resting heart rate rose and HRV fell in the first hours of sleep after drinking, more with more alcohol.", source: "Pietilä J et al. JMIR Ment Health 2018;5:e23" },
  strength: SHAW,
};

const LABEL: Record<AlcoholOutcome, string> = {
  rhr: "Resting heart rate",
  hrv: "HRV",
  sleep: "Sleep",
  scale1: "Scale the morning after",
  scale2: "Scale two mornings after",
};

/** The lag, said outright (Oura: "measured during your next night of sleep"). */
const WHEN: Record<AlcoholOutcome, string> = {
  rhr: "Next day",
  hrv: "Next day",
  sleep: "That night",
  scale1: "Against your line",
  scale2: "Against your line",
};

const isScale = (id: AlcoholOutcome) => id === "scale1" || id === "scale2";
const sign = (v: number) => (v > 0 ? "+" : v < 0 ? "−" : "");

/** The difference in its unit, signed: "+6 bpm", "−11 ms", "−25 min", "+0.6 kg". */
function signedValue(l: AlcoholLink, unit: WeightUnit): string {
  const d = l.diff ?? 0;
  if (isScale(l.id)) {
    const v = Math.round(kgToDisplay(Math.abs(d), unit) * 10) / 10;
    return `${v === 0 ? "" : sign(d)}${v.toFixed(1)} ${unit}`;
  }
  const r = Math.round(Math.abs(d));
  if (l.id === "sleep") return `${r === 0 ? "" : sign(d)}${r >= 60 ? formatHoursMin(r) : `${r} min`}`;
  return `${r === 0 ? "" : sign(d)}${r} ${l.id === "rhr" ? "bpm" : "ms"}`;
}

/** One row of the card: the outcome, its number (or how far along, or "No clear link"), and the lag with the counts. */
export function alcoholRow(l: AlcoholLink, unit: WeightUnit): { label: string; value: string; sub: string } {
  const what = isScale(l.id) ? "mornings" : "nights";
  if (l.state === "building") {
    // Past the count, a link waiting a week to hold.
    if (l.drink >= ALC_MIN_EACH && l.dry >= ALC_MIN_EACH) return { label: LABEL[l.id], value: "Checking", sub: `${WHEN[l.id]} · ${l.drink} vs ${l.dry} ${what}` };
    return l.drink < ALC_MIN_EACH
      ? { label: LABEL[l.id], value: `${l.drink} of ${ALC_MIN_EACH}`, sub: `${what === "nights" ? "Nights" : "Mornings"} after drinking so far · ${l.dry} after none` }
      : { label: LABEL[l.id], value: `${l.dry} of ${ALC_MIN_EACH}`, sub: `${what === "nights" ? "Nights" : "Mornings"} after none so far · ${l.drink} after drinking` };
  }
  return { label: LABEL[l.id], value: l.state === "linked" ? signedValue(l, unit) : "No clear link", sub: `${WHEN[l.id]} · ${l.drink} vs ${l.dry} ${what}` };
}

/** The linked outcomes as part of one sentence: "resting HR 6 bpm higher". */
function phrase(l: AlcoholLink, unit: WeightUnit): string {
  const d = l.diff ?? 0;
  const v = signedValue(l, unit).replace(/^[+−]/, "");
  switch (l.id) {
    case "rhr":
      return `resting HR ${v} ${d > 0 ? "higher" : "lower"}`;
    case "hrv":
      return `HRV ${v} ${d > 0 ? "higher" : "lower"}`;
    case "sleep":
      return `sleep ${v} ${d > 0 ? "longer" : "shorter"}`;
    case "scale1":
      return `the scale ${v} ${d > 0 ? "above" : "below"} your line the next morning`;
    case "scale2":
      return `the scale ${v} ${d > 0 ? "above" : "below"} your line two mornings after`;
  }
}

/**
 * The clear links in one line, for a list of what was spotted (IN10) and
 * the assistant: "After drinking: resting HR 6 bpm higher, HRV 11 ms lower ·
 * 7 vs 40 nights". Night outcomes first; the scale on its own when no night
 * outcome is linked. Null with nothing linked.
 */
export function alcoholHeadline(r: AlcoholRead, unit: WeightUnit): string | null {
  const linked = r.items.filter((x) => x.state === "linked");
  const nights = linked.filter((x) => !isScale(x.id));
  const pick = nights.length ? nights : linked;
  if (!pick.length) return null;
  const counts = `${pick[0].drink} vs ${pick[0].dry} ${nights.length ? "nights" : "mornings"}`;
  return `After drinking: ${pick.map((x) => phrase(x, unit)).join(", ")} · ${counts}`;
}

/** At this share of Fridays and Saturdays, the drinking nights are called the weekend. OURS. */
export const WEEKEND_WORDS_SHARE = 0.8;

/**
 * When a link couldn't be set against dry evenings on the same weekdays
 * (too few of them), the honest caveat, as Connections' "so it could be
 * either"; null otherwise.
 */
export function alcoholSameDaysNote(r: Pick<AlcoholRead, "items" | "weekendShare">): string | null {
  if (!r.items.some((x) => x.state === "linked" && x.sameDays === "unchecked")) return null;
  return (r.weekendShare ?? 0) >= WEEKEND_WORDS_SHARE
    ? "Your drinking nights were mostly Fridays and Saturdays, with too few dry ones to compare, so the weekend may be part of it."
    : "Your drinking nights fell on days of the week with too few dry ones to compare, so the day may be part of it.";
}
