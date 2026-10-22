"use client";

import { nutrientRows, type Extras } from "@/lib/food/extras";

/**
 * A food's other nutrients in its detail (IN6): saturated fat, sugars,
 * fibre, salt and alcohol as a plain two-column list, the way a pack's
 * label or HelloFresh's nutrition facts read. Nothing when none is known.
 */
export default function NutrientList({ food }: { food: (Extras & { fibreG?: number }) | null | undefined }) {
  const rows = nutrientRows(food);
  if (rows.length === 0) return null;
  return (
    <dl className="grid grid-cols-2 gap-x-5 text-[13px]" style={{ fontVariantNumeric: "tabular-nums" }} aria-label="Other nutrients">
      {rows.map((r) => (
        <div key={r.key} className="flex items-baseline justify-between gap-2 py-1.5" style={{ borderBottom: "1px solid var(--border)" }}>
          <dt style={{ color: "var(--text-secondary)" }}>{r.label}</dt>
          <dd className="font-medium" style={{ color: "var(--text)" }}>
            {r.value}
          </dd>
        </div>
      ))}
    </dl>
  );
}
