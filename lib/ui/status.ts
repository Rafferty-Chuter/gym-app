/**
 * Shared status vocabulary for every judgement surface: the Signals tiles on
 * Home, the signal detail pages and the physique layer (Body page, home
 * card). One palette so the same state always looks the same.
 */

export type SignalState = "good" | "watch" | "attention" | "unknown";

export type SignalKey = "plateau" | "volume" | "progress";

export type StateColor = {
  stroke: string;
  iconBg: string;
  iconBorder: string;
  statusText: string;
  statusBg: string;
  statusBorder: string;
  chartLine: string;
  chartFill: string;
};

/** Tile, pill and chart colours per state (good/watch/attention as the Signals UI had them). */
export const STATE_COLOR: Record<SignalState, StateColor> = {
  good: {
    stroke: "var(--status-good)",
    iconBg: "color-mix(in srgb, var(--status-good) 10%, transparent)",
    iconBorder: "color-mix(in srgb, var(--status-good) 30%, transparent)",
    statusText: "var(--status-good)",
    statusBg: "color-mix(in srgb, var(--status-good) 10%, transparent)",
    statusBorder: "color-mix(in srgb, var(--status-good) 30%, transparent)",
    chartLine: "var(--status-good)",
    chartFill: "color-mix(in srgb, var(--status-good) 10%, transparent)",
  },
  watch: {
    stroke: "var(--status-watch)",
    iconBg: "color-mix(in srgb, var(--status-watch) 10%, transparent)",
    iconBorder: "color-mix(in srgb, var(--status-watch) 32%, transparent)",
    statusText: "var(--status-watch)",
    statusBg: "color-mix(in srgb, var(--status-watch) 10%, transparent)",
    statusBorder: "color-mix(in srgb, var(--status-watch) 32%, transparent)",
    chartLine: "var(--status-watch)",
    chartFill: "color-mix(in srgb, var(--status-watch) 10%, transparent)",
  },
  attention: {
    stroke: "var(--status-attention)",
    iconBg: "color-mix(in srgb, var(--status-attention) 10%, transparent)",
    iconBorder: "color-mix(in srgb, var(--status-attention) 32%, transparent)",
    statusText: "var(--status-attention)",
    statusBg: "color-mix(in srgb, var(--status-attention) 10%, transparent)",
    statusBorder: "color-mix(in srgb, var(--status-attention) 32%, transparent)",
    chartLine: "var(--status-attention)",
    chartFill: "color-mix(in srgb, var(--status-attention) 10%, transparent)",
  },
  // Unknown is a neutral grey (DESIGN.md status-unknown), not a tinted teal.
  unknown: {
    stroke: "var(--text-tertiary)",
    iconBg: "color-mix(in srgb, var(--text-tertiary) 10%, transparent)",
    iconBorder: "color-mix(in srgb, var(--text-tertiary) 28%, transparent)",
    statusText: "var(--text-secondary)",
    statusBg: "color-mix(in srgb, var(--text-tertiary) 10%, transparent)",
    statusBorder: "color-mix(in srgb, var(--text-tertiary) 28%, transparent)",
    chartLine: "var(--text-tertiary)",
    chartFill: "color-mix(in srgb, var(--text-tertiary) 8%, transparent)",
  },
};

/** DESIGN.md status tokens: the 8px dot and pill colours on physique surfaces. */
export const STATUS_HEX: Record<SignalState, string> = {
  good: "var(--status-good)",
  watch: "var(--status-watch)",
  attention: "var(--status-attention)",
  unknown: "var(--text-tertiary)",
};

/** One word per state for summary surfaces (DESIGN.md: states, not scores). */
export const STATE_WORD: Record<SignalState, string> = {
  good: "On track",
  watch: "Watch",
  attention: "Attention",
  unknown: "Calibrating",
};
