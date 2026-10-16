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

/** Tile, pill and chart colours per state (unchanged from the Signals UI). */
export const STATE_COLOR: Record<SignalState, StateColor> = {
  good: {
    stroke: "#00e5b0",
    iconBg: "rgba(0,229,176,0.10)",
    iconBorder: "rgba(0,229,176,0.30)",
    statusText: "#00e5b0",
    statusBg: "rgba(0,229,176,0.10)",
    statusBorder: "rgba(0,229,176,0.30)",
    chartLine: "#00e5b0",
    chartFill: "rgba(0,229,176,0.10)",
  },
  watch: {
    stroke: "#fbbf24",
    iconBg: "rgba(251,191,36,0.10)",
    iconBorder: "rgba(251,191,36,0.32)",
    statusText: "#fbbf24",
    statusBg: "rgba(251,191,36,0.10)",
    statusBorder: "rgba(251,191,36,0.32)",
    chartLine: "#fbbf24",
    chartFill: "rgba(251,191,36,0.10)",
  },
  attention: {
    stroke: "#fb7185",
    iconBg: "rgba(251,113,133,0.10)",
    iconBorder: "rgba(251,113,133,0.32)",
    statusText: "#fb7185",
    statusBg: "rgba(251,113,133,0.10)",
    statusBorder: "rgba(251,113,133,0.32)",
    chartLine: "#fb7185",
    chartFill: "rgba(251,113,133,0.10)",
  },
  unknown: {
    stroke: "rgba(140,200,196,0.50)",
    iconBg: "rgba(140,200,196,0.06)",
    iconBorder: "rgba(140,200,196,0.18)",
    statusText: "rgba(140,200,196,0.65)",
    statusBg: "rgba(140,200,196,0.05)",
    statusBorder: "rgba(140,200,196,0.16)",
    chartLine: "rgba(140,200,196,0.50)",
    chartFill: "rgba(140,200,196,0.06)",
  },
};

/** DESIGN.md status tokens: the 8px dot and pill colours on physique surfaces. */
export const STATUS_HEX: Record<SignalState, string> = {
  good: "#00e5b0",
  watch: "#f5b544",
  attention: "#f26d7d",
  unknown: "#6f6f76",
};

/** One word per state for summary surfaces (DESIGN.md: states, not scores). */
export const STATE_WORD: Record<SignalState, string> = {
  good: "On track",
  watch: "Watch",
  attention: "Attention",
  unknown: "Calibrating",
};
