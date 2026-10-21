"use client";

import { useCallback, useEffect, useRef, useState, type RefObject } from "react";

/**
 * The width of an element, kept current as it resizes, so a chart can draw
 * at its real size. The ref is a callback, so an element that appears after
 * the first render (a chart once its data arrives) is measured too; the
 * third item reads the element itself.
 */
export function useContainerWidth<T extends HTMLElement>(): [(node: T | null) => void, number, RefObject<T | null>] {
  const ref = useRef<T | null>(null);
  const [el, setEl] = useState<T | null>(null);
  const [width, setWidth] = useState(0);
  const attach = useCallback((node: T | null) => {
    ref.current = node;
    setEl(node);
    if (node) setWidth(node.getBoundingClientRect().width);
  }, []);
  useEffect(() => {
    if (!el || typeof ResizeObserver === "undefined") return;
    const ro = new ResizeObserver((entries) => {
      for (const e of entries) setWidth(e.contentRect.width);
    });
    ro.observe(el);
    return () => ro.disconnect();
  }, [el]);
  return [attach, width, ref];
}

export type TipRow = { label: string; value: string };

/**
 * The picked point's numbers (T1), in the same small card as the weight
 * chart's: the date on top, then one line per value. It sits over the top
 * of the chart, centred on the point and kept inside the chart's width, and
 * drops to the foot when the point itself is up where the card would cover it.
 */
export function ChartTip({ x, y, width, title, rows, w = 136, sleep = false }: { x: number; /** The point's height from the chart's top, px, when it has one. */ y?: number; width: number; title: string; rows: TipRow[]; w?: number; /** The Sleep tab's own palette. */ sleep?: boolean }) {
  const v = (name: string) => `var(--${sleep ? "sl-" : ""}${name})`;
  // About 17px a line plus padding: the card's height, to tell whether it would sit on the point.
  const low = y != null && y < 14 + 17 * (rows.length + 1);
  return (
    <div
      role="status"
      className={`pointer-events-none absolute z-10 rounded-[8px] px-2.5 py-1.5 text-[11px] leading-snug ${low ? "bottom-0" : "top-0"}`}
      style={{
        left: Math.min(Math.max(x - w / 2, 0), Math.max(0, width - w)),
        width: w,
        background: v("surface-raised"),
        border: `1px solid ${v("border")}`,
        color: v("text-secondary"),
        fontVariantNumeric: "tabular-nums",
      }}
    >
      <div style={{ color: v("text-tertiary"), letterSpacing: "0.04em" }}>{title}</div>
      {rows.map((r) => (
        <div key={r.label} className="flex justify-between gap-2">
          <span className="truncate">{r.label}</span>
          <span className="shrink-0" style={{ color: v("text"), fontWeight: 600 }}>
            {r.value}
          </span>
        </div>
      ))}
    </div>
  );
}
