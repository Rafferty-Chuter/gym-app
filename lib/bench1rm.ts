import type { BenchContextSummary, BenchSessionSummary } from "@/lib/benchContext";

export type BenchEstimateConfidence = "high" | "medium" | "low";
export type BenchPrimaryAnchorKind = "heavy" | "volume" | "general";

export type Bench1RMEstimate = {
  estimated1RM: number;
  estimateLow: number;
  estimateHigh: number;
  confidence: BenchEstimateConfidence;
  primaryAnchorUsed: {
    kind: BenchPrimaryAnchorKind;
    date?: string;
    sessionName?: string;
    exerciseName?: string;
    set: { weight: number; reps: number; rir?: number };
    effectiveRTF: number;
    formulaUsed: "bench_specific_4_10" | "epley_low_rep";
    estimateFromAnchor: number;
  };
  supportingEvidenceUsed: {
    used: boolean;
    date?: string;
    sessionName?: string;
    exerciseName?: string;
    set?: { weight: number; reps: number; rir?: number };
    effectiveRTF?: number;
    estimateFromSupport?: number;
    agreement: "supports" | "neutral" | "conflicts" | "none";
  };
  reasoningSummary: string;
};

function round1(n: number): number {
  return Number(n.toFixed(1));
}

function setEstimate(weight: number, reps: number, rir?: number): {
  effectiveRTF: number;
  estimate: number;
  formulaUsed: "bench_specific_4_10" | "epley_low_rep";
} {
  const eff = reps + (typeof rir === "number" && Number.isFinite(rir) ? Math.max(0, rir) : 0);
  if (eff >= 4 && eff <= 10) {
    // Product-specific bench model for moderate rep ranges.
    return {
      effectiveRTF: eff,
      estimate: eff * 0.1 * weight + 1.49,
      formulaUsed: "bench_specific_4_10",
    };
  }
  return {
    effectiveRTF: eff,
    estimate: weight * (1 + eff / 30),
    formulaUsed: "epley_low_rep",
  };
}

function pickBestSet(session: BenchSessionSummary | null): { weight: number; reps: number; rir?: number } | null {
  if (!session) return null;
  if (!session.sets.length) return null;
  return session.sets.reduce((a, b) =>
    b.weight > a.weight || (b.weight === a.weight && b.reps > a.reps) ? b : a
  );
}

function pickPrimaryAnchorKind(message: string): BenchPrimaryAnchorKind {
  const t = message.trim().toLowerCase();
  if (/\b(heavy)\s+(bench|bench press|session|day)\b/.test(t)) return "heavy";
  if (/\b(volume)\s+(bench|bench press|session|day)\b/.test(t)) return "volume";
  return "general";
}

function isRecent(iso?: string): boolean {
  if (!iso) return false;
  const ms = new Date(iso).getTime();
  if (!Number.isFinite(ms)) return false;
  const days = (Date.now() - ms) / (1000 * 60 * 60 * 24);
  return days <= 21;
}

export function buildBench1RMEstimate(params: {
  message: string;
  benchContext: BenchContextSummary;
}): Bench1RMEstimate | null {
  const primaryKind = pickPrimaryAnchorKind(params.message);
  const heavy = params.benchContext.latestHeavyBenchSession;
  const volume = params.benchContext.latestVolumeBenchSession;
  const heavySet = pickBestSet(heavy);
  const volumeSet = pickBestSet(volume);

  const primary =
    primaryKind === "heavy"
      ? heavySet
        ? { kind: "heavy" as const, session: heavy, set: heavySet }
        : volumeSet
          ? { kind: "volume" as const, session: volume, set: volumeSet }
          : null
      : primaryKind === "volume"
        ? volumeSet
          ? { kind: "volume" as const, session: volume, set: volumeSet }
          : heavySet
            ? { kind: "heavy" as const, session: heavy, set: heavySet }
            : null
        : heavySet
          ? { kind: "heavy" as const, session: heavy, set: heavySet }
          : volumeSet
            ? { kind: "volume" as const, session: volume, set: volumeSet }
            : null;

  if (!primary) return null;

  const primaryCalc = setEstimate(primary.set.weight, primary.set.reps, primary.set.rir);
  const primaryStrengthFloor = primary.set.weight * (1 + primaryCalc.effectiveRTF / 30);
  const primaryEstimate = Math.max(primaryCalc.estimate, primaryStrengthFloor);
  const support =
    primary.kind === "heavy"
      ? volumeSet && volume
        ? { session: volume, set: volumeSet }
        : null
      : heavySet && heavy
        ? { session: heavy, set: heavySet }
        : null;
  const supportCalc = support ? setEstimate(support.set.weight, support.set.reps, support.set.rir) : null;
  const supportEstimate =
    supportCalc && support
      ? Math.max(supportCalc.estimate, support.set.weight * (1 + supportCalc.effectiveRTF / 30))
      : null;

  const base = primaryEstimate;
  let center = base;
  let band = 2.5;
  let agreement: "supports" | "neutral" | "conflicts" | "none" = "none";

  if (supportCalc) {
    const diff = Math.abs((supportEstimate ?? supportCalc.estimate) - base);
    if (diff <= 3) {
      agreement = "supports";
      center = primary.kind === "heavy" ? base * 0.75 + (supportEstimate ?? supportCalc.estimate) * 0.25 : base * 0.8 + (supportEstimate ?? supportCalc.estimate) * 0.2;
      band = 2.5;
    } else if (diff <= 6) {
      agreement = "neutral";
      center = primary.kind === "heavy" ? base * 0.85 + (supportEstimate ?? supportCalc.estimate) * 0.15 : base * 0.9 + (supportEstimate ?? supportCalc.estimate) * 0.1;
      band = 3.5;
    } else {
      agreement = "conflicts";
      center = primary.kind === "heavy" ? base * 0.9 + (supportEstimate ?? supportCalc.estimate) * 0.1 : base * 0.92 + (supportEstimate ?? supportCalc.estimate) * 0.08;
      band = 5;
    }
  }

  const primaryImplies = primaryEstimate;
  if (center < primaryImplies - 1.5) center = primaryImplies - 1.5;

  const hasKnownPrimaryRir = typeof primary.set.rir === "number";
  const confidence: BenchEstimateConfidence =
    primary.kind === "heavy" && isRecent(primary.session?.completedAt) && hasKnownPrimaryRir && agreement === "supports"
      ? "high"
      : primary.kind === "heavy" && isRecent(primary.session?.completedAt)
        ? "medium"
        : "low";

  const estimated1RM = round1(center);
  const estimateLow = round1(center - band);
  const estimateHigh = round1(center + band);

  const reasoningSummary =
    primary.kind === "heavy"
      ? `Primary estimate from heavy bench ${primary.set.weight}x${primary.set.reps}${hasKnownPrimaryRir ? ` @~${primary.set.rir} RIR` : ""}; strength-floor guardrail applied to avoid undercutting the anchor; support from volume ${support?.set.weight ?? "n/a"}x${support?.set.reps ?? "n/a"} (${agreement}).`
      : `Primary estimate from volume bench ${primary.set.weight}x${primary.set.reps}; strength-floor guardrail applied; support from heavy ${support?.set.weight ?? "n/a"}x${support?.set.reps ?? "n/a"} (${agreement}).`;

  return {
    estimated1RM,
    estimateLow,
    estimateHigh,
    confidence,
    primaryAnchorUsed: {
      kind: primary.kind,
      date: primary.session?.completedAt,
      sessionName: primary.session?.sessionName,
      exerciseName: primary.session?.exerciseName,
      set: primary.set,
      effectiveRTF: round1(primaryCalc.effectiveRTF),
      formulaUsed: primaryCalc.formulaUsed,
      estimateFromAnchor: round1(primaryEstimate),
    },
    supportingEvidenceUsed: {
      used: Boolean(supportCalc),
      date: support?.session.completedAt,
      sessionName: support?.session.sessionName,
      exerciseName: support?.session.exerciseName,
      set: support?.set,
      effectiveRTF: supportCalc ? round1(supportCalc.effectiveRTF) : undefined,
      estimateFromSupport: supportEstimate != null ? round1(supportEstimate) : undefined,
      agreement,
    },
    reasoningSummary,
  };
}

