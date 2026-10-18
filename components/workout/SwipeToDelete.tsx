"use client";

import { useRef, useState, type ReactNode } from "react";

/** Width of the Delete button a part swipe leaves open, px. OURS, iOS's row-action width. */
export const SWIPE_ACTION_PX = 88;
/** Share of the row width past which letting go deletes outright, as a full swipe does in Mail, Strong and Hevy. OURS. */
export const SWIPE_DELETE_SHARE = 0.5;
/** Movement before a drag counts as a swipe rather than a tap or a scroll, px. OURS. */
const SWIPE_SLOP_PX = 10;

/**
 * A set row that swipes left to delete (C4, as Strong and Hevy): a part
 * swipe leaves a Delete button open, a long one deletes on release, and a
 * swipe back or a tap elsewhere closes it. Vertical drags stay with the
 * page's scroll. Long-press and the row's own tap keep working.
 */
export default function SwipeToDelete({ children, onDelete, onSwipeStart, label }: { children: ReactNode; onDelete: () => void; onSwipeStart?: () => void; label: string }) {
  const rowRef = useRef<HTMLDivElement | null>(null);
  const start = useRef<{ x: number; y: number; base: number } | null>(null);
  const swiping = useRef(false);
  const justSwiped = useRef(false);
  const [dx, setDx] = useState(0);
  const [dragging, setDragging] = useState(false);
  const open = dx <= -SWIPE_ACTION_PX + 1;

  const settle = (to: number) => {
    setDragging(false);
    setDx(to);
  };

  return (
    <div className="relative overflow-hidden rounded-lg" onBlur={(e) => !e.currentTarget.contains(e.relatedTarget as Node | null) && dx !== 0 && settle(0)}>
      <button
        type="button"
        onClick={() => {
          settle(0);
          onDelete();
        }}
        tabIndex={dx === 0 ? -1 : 0}
        aria-hidden={dx === 0}
        className="absolute inset-y-0 right-0 flex items-center justify-end rounded-lg pr-5 text-[13px] font-semibold"
        style={{ width: Math.max(SWIPE_ACTION_PX, -dx), background: "var(--status-attention)", color: "var(--text-on-primary)", opacity: dx === 0 ? 0 : 1 }}
        aria-label={label}
      >
        Delete
      </button>
      <div
        ref={rowRef}
        className="relative"
        style={{ transform: `translateX(${dx}px)`, transition: dragging ? "none" : "transform 220ms cubic-bezier(0.22, 1, 0.36, 1)", touchAction: "pan-y", background: "var(--surface)" }}
        onPointerDown={(e) => {
          if (e.pointerType === "mouse" && e.button !== 0) return;
          start.current = { x: e.clientX, y: e.clientY, base: dx };
          swiping.current = false;
        }}
        onPointerMove={(e) => {
          const s = start.current;
          if (!s) return;
          const mx = e.clientX - s.x;
          const my = e.clientY - s.y;
          if (!swiping.current) {
            if (Math.abs(mx) < SWIPE_SLOP_PX || Math.abs(mx) < Math.abs(my) * 1.2) {
              if (Math.abs(my) > SWIPE_SLOP_PX) start.current = null;
              return;
            }
            swiping.current = true;
            setDragging(true);
            onSwipeStart?.();
            try {
              e.currentTarget.setPointerCapture(e.pointerId);
            } catch {
              /* ignore */
            }
          }
          setDx(Math.min(0, s.base + mx));
        }}
        onPointerUp={() => {
          const was = swiping.current;
          start.current = null;
          swiping.current = false;
          if (!was) {
            if (dx !== 0) settle(0);
            return;
          }
          // Swallow the click this release may fire, and only that one.
          justSwiped.current = true;
          window.setTimeout(() => (justSwiped.current = false), 80);
          const width = rowRef.current?.getBoundingClientRect().width ?? 320;
          if (-dx > width * SWIPE_DELETE_SHARE) {
            settle(0);
            onDelete();
          } else settle(-dx > SWIPE_ACTION_PX / 2 ? -SWIPE_ACTION_PX : 0);
        }}
        onPointerCancel={() => {
          start.current = null;
          if (swiping.current) {
            swiping.current = false;
            settle(dx < -SWIPE_ACTION_PX / 2 ? -SWIPE_ACTION_PX : 0);
          }
        }}
        onClickCapture={(e) => {
          // The click that ends a swipe, or a tap on an open row, only closes it.
          if (justSwiped.current || open) {
            justSwiped.current = false;
            e.stopPropagation();
            e.preventDefault();
            if (open) settle(0);
          }
        }}
      >
        {children}
      </div>
    </div>
  );
}
