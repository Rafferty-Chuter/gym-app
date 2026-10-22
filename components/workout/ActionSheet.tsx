"use client";

import type { ReactNode } from "react";
import Sheet from "@/components/ui/Sheet";
import { CheckIcon } from "@/components/workout/icons";

/** One row of an action sheet. */
export type ActionItem = {
  label: string;
  onSelect: () => void;
  /** A 20px line icon, or a set mark, on the left. */
  icon?: ReactNode;
  /** The current value, quiet on the right (a rest time). */
  value?: string;
  /** The ticked choice in a group of options (the set type). */
  selected?: boolean;
  /** Removes something: label and icon in the attention colour, as Hevy's and Strong's remove rows. */
  destructive?: boolean;
  ariaLabel?: string;
};

/**
 * Action sheet (Hevy's exercise and set-type sheets, Strong's "…" menu):
 * a bottom sheet of grouped rows, each an icon and a 15px label split by
 * hairlines, with the remove row last in a group of its own. Replaces
 * the logger's small drop-downs, which read as developer menus.
 */
export default function ActionSheet({ open, onClose, title, subtitle, groups }: { open: boolean; onClose: () => void; title: string; subtitle?: string; groups: ActionItem[][] }) {
  return (
    <Sheet open={open} onClose={onClose} title={title}>
      {subtitle && (
        <p className="-mt-1 mb-3 truncate text-[13px]" style={{ color: "var(--text-secondary)" }}>
          {subtitle}
        </p>
      )}
      <div className="flex flex-col gap-3 pb-2">
        {groups
          .filter((g) => g.length > 0)
          .map((group, gi) => (
            <div key={gi} className="overflow-hidden rounded-[16px] divide-y divide-[var(--border-strong)]" style={{ background: "var(--surface-raised)" }}>
              {group.map((item) => {
                const tone = item.destructive ? "var(--status-attention)" : "var(--text)";
                return (
                  <button
                    key={item.label}
                    type="button"
                    onClick={item.onSelect}
                    aria-label={item.ariaLabel}
                    aria-current={item.selected || undefined}
                    className="flex min-h-[52px] w-full items-center gap-3 px-4 text-left transition-colors active:bg-[var(--surface-pressed)]"
                  >
                    {item.icon && (
                      <span className="flex h-6 w-6 shrink-0 items-center justify-center" style={{ color: item.destructive ? tone : "var(--text-secondary)" }}>
                        {item.icon}
                      </span>
                    )}
                    <span className={`min-w-0 flex-1 truncate text-[15px] ${item.selected ? "font-semibold" : "font-medium"}`} style={{ color: tone }}>
                      {item.label}
                    </span>
                    {item.value && (
                      <span className="shrink-0 text-[15px]" style={{ color: "var(--text-secondary)", fontVariantNumeric: "tabular-nums" }}>
                        {item.value}
                      </span>
                    )}
                    {item.selected && (
                      <span className="shrink-0" style={{ color: "var(--text)" }}>
                        <CheckIcon className="h-5 w-5" />
                      </span>
                    )}
                  </button>
                );
              })}
            </div>
          ))}
      </div>
    </Sheet>
  );
}

/** A set's mark in a 24px tile (Hevy's set-type sheet): "W", "D", "F" or the set number. */
export function SetMark({ mark }: { mark: string }) {
  return (
    <span className="flex h-6 w-6 items-center justify-center rounded-[7px] text-[13px] font-bold" style={{ background: "var(--surface)", color: "var(--text)", fontVariantNumeric: "tabular-nums" }}>
      {mark}
    </span>
  );
}
