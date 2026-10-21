"use client";

import { useEffect, useRef, useState, type KeyboardEvent, type PointerEvent } from "react";

// ── Tap a point on a chart (T1) ──

/** How far (px) a press may land from the nearest point and still pick it, for charts that pass `snap`. OURS: a fingertip covers about 40px, so 28 either side forgives a near miss without picking from empty space. */
export const PICK_SNAP_PX = 28;

type PickOptions = {
  /** Where each point sits from the element's left edge: px, or a share of its width with `share`. A null cannot be picked. */
  xs: ReadonlyArray<number | null>;
  share?: boolean;
  /** A key for the data the points come from (dates and count, say). A new key lets the pick go without an effect; a re-render with the same data keeps it. */
  data: string;
  /** Follow a drag across the chart (the default). Off inside a horizontal swiper, where a tap picks and a swipe still swipes. */
  drag?: boolean;
  /** A press further than PICK_SNAP_PX from every point lets the pick go (sparse line charts). */
  snap?: boolean;
  /** For spans rather than points: the index under a press, px from the left edge, or null for none. */
  hit?: (px: number, width: number) => number | null;
};

/**
 * One picked point on a chart. Pressing picks the nearest point, dragging
 * follows the finger, pressing the picked point again lets it go, and the
 * arrow keys step through the points. Vertical scrolling keeps working
 * (`touch-action: pan-y`). Spread `bind` on the element the `xs` are
 * measured from.
 */
export function usePick<E extends HTMLElement = HTMLDivElement>({ xs, share = false, data, drag = true, snap = false, hit: under }: PickOptions) {
  const ref = useRef<E | null>(null);
  const [sel, setSel] = useState<{ data: string; i: number } | null>(null);
  const active = sel && sel.data === data && xs[sel.i] != null ? sel.i : null;
  const press = useRef<{ start: number | null; moved: boolean } | null>(null);
  // Handlers read the latest pick from here, as a drag can outrun a render.
  const live = useRef(active);
  useEffect(() => {
    live.current = active;
  }, [active]);

  const set = (i: number | null) => {
    live.current = i;
    setSel(i == null ? null : { data, i });
  };

  function nearest(clientX: number): { i: number; d: number } | null {
    const el = ref.current;
    if (!el) return null;
    const r = el.getBoundingClientRect();
    const px = clientX - r.left;
    if (under) {
      const i = under(px, r.width);
      return i == null ? null : { i, d: 0 };
    }
    let best: { i: number; d: number } | null = null;
    xs.forEach((x, i) => {
      if (x == null) return;
      const d = Math.abs((share ? x * r.width : x) - px);
      if (!best || d < best.d) best = { i, d };
    });
    return best;
  }

  const missed = (hit: { d: number } | null) => !hit || (snap && hit.d > PICK_SNAP_PX);

  function step(dir: 1 | -1) {
    const from = live.current ?? (dir === 1 ? -1 : xs.length);
    for (let i = from + dir; i >= 0 && i < xs.length; i += dir) {
      if (xs[i] != null) return set(i);
    }
  }

  const bind = {
    ref,
    tabIndex: 0,
    style: { touchAction: drag ? "pan-y" : undefined, WebkitUserSelect: "none", userSelect: "none", cursor: "pointer" } as const,
    onPointerDown(e: PointerEvent<E>) {
      if (e.pointerType === "mouse" && e.button !== 0) return;
      press.current = { start: live.current, moved: false };
      if (!drag) return;
      e.currentTarget.setPointerCapture?.(e.pointerId);
      const hit = nearest(e.clientX);
      if (missed(hit)) return set(null);
      if (hit!.i !== live.current) set(hit!.i);
    },
    onPointerMove(e: PointerEvent<E>) {
      if (!drag || !press.current) return;
      const hit = nearest(e.clientX);
      if (hit && hit.i !== live.current && !missed(hit)) {
        press.current.moved = true;
        set(hit.i);
      }
    },
    onPointerUp(e: PointerEvent<E>) {
      const p = press.current;
      press.current = null;
      if (!p) return;
      const hit = nearest(e.clientX);
      if (missed(hit)) return set(null);
      // Pressing the picked point without moving lets it go.
      if (drag) return void (!p.moved && hit!.i === p.start && set(null));
      set(hit!.i === p.start ? null : hit!.i);
    },
    onPointerCancel() {
      press.current = null;
    },
    onKeyDown(e: KeyboardEvent<E>) {
      if (e.key === "ArrowRight" || e.key === "ArrowLeft") {
        e.preventDefault();
        step(e.key === "ArrowRight" ? 1 : -1);
      } else if (e.key === "Escape" && live.current != null) {
        set(null);
      }
    },
  };

  return { active, set, bind };
}
