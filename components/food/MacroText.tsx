"use client";

/**
 * A food's numbers on one line (polish, after MacroFactor's log): kcal in
 * the text colour, then protein, fat and carbs with their letters in the
 * macro colours the Home ring and bars use, so a row reads at a glance.
 */
export default function MacroText({ kcal, proteinG, fatG, carbsG, showKcal = true, size = 11 }: { kcal: number; proteinG: number; fatG: number; carbsG: number; showKcal?: boolean; size?: 11 | 12 | 13 | 15 }) {
  const part = (v: number, letter: string, color: string) => (
    <span className="whitespace-nowrap">
      {Math.round(v)}
      <span className="font-semibold" style={{ color }}>
        {letter}
      </span>
    </span>
  );
  return (
    <span className="inline-flex flex-wrap items-baseline gap-x-1.5" style={{ fontSize: size, color: "var(--text-tertiary)", fontVariantNumeric: "tabular-nums" }}>
      {showKcal && (
        <span className="whitespace-nowrap font-medium" style={{ color: "var(--text-secondary)" }}>
          {Math.round(kcal).toLocaleString("en-GB")} kcal
        </span>
      )}
      {part(proteinG, "P", "var(--macro-protein)")}
      {part(fatG, "F", "var(--macro-fat)")}
      {part(carbsG, "C", "var(--macro-carb)")}
    </span>
  );
}
