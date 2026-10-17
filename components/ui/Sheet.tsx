"use client";

import { useEffect, useId, useRef, useState, type ReactNode } from "react";
import { createPortal } from "react-dom";
import { useIsHydrated } from "@/lib/ui/useIsHydrated";

/**
 * Bottom sheet (DESIGN.md "Bottom sheet"): surface panel with a grabber,
 * a title, content and an optional footer action. Dismiss by the scrim,
 * Escape, or a downward swipe on the header. Focus is trapped inside and
 * returned on close; the page behind doesn't scroll.
 */

type Props = {
  open: boolean;
  onClose: () => void;
  title?: string;
  children: ReactNode;
  /** Pinned under the content, above the safe area. Usually one primary button. */
  footer?: ReactNode;
  /** Mark the close affordance; `aria-label` for the scrim button. */
  closeLabel?: string;
  /** Custom header under the grabber (replaces `title`). */
  header?: ReactNode;
  /** Full height (92dvh) rather than content height: the food logger. */
  full?: boolean;
  /** Accessible name when `header` replaces the title. */
  ariaLabel?: string;
};

/** Swipe distance (px) on the header that dismisses the sheet. */
const SWIPE_CLOSE_PX = 80;

const FOCUSABLE = 'a[href], button:not([disabled]), textarea, input, select, [tabindex]:not([tabindex="-1"])';

export default function Sheet({ open, onClose, title, children, footer, closeLabel = "Close", header, full = false, ariaLabel }: Props) {
  const mounted = useIsHydrated();
  const panelRef = useRef<HTMLDivElement | null>(null);
  const restoreRef = useRef<HTMLElement | null>(null);
  const [dragY, setDragY] = useState(0);
  const [isDragging, setIsDragging] = useState(false);
  const dragStart = useRef<number | null>(null);
  const titleId = useId();

  // Scroll lock, initial focus and focus restore.
  useEffect(() => {
    if (!open) return;
    restoreRef.current = (document.activeElement as HTMLElement | null) ?? null;
    const prevOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    const raf = requestAnimationFrame(() => {
      const panel = panelRef.current;
      if (!panel) return;
      const first = panel.querySelector<HTMLElement>("[data-sheet-autofocus]") ?? panel.querySelector<HTMLElement>(FOCUSABLE);
      (first ?? panel).focus({ preventScroll: true });
    });
    return () => {
      cancelAnimationFrame(raf);
      document.body.style.overflow = prevOverflow;
      restoreRef.current?.focus?.({ preventScroll: true });
    };
  }, [open]);

  // Escape closes; Tab stays inside.
  useEffect(() => {
    if (!open) return;
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape") {
        e.preventDefault();
        onClose();
        return;
      }
      if (e.key !== "Tab" || !panelRef.current) return;
      const items = Array.from(panelRef.current.querySelectorAll<HTMLElement>(FOCUSABLE)).filter((el) => el.offsetParent !== null);
      if (items.length === 0) {
        e.preventDefault();
        panelRef.current.focus();
        return;
      }
      const first = items[0];
      const last = items[items.length - 1];
      const activeEl = document.activeElement;
      if (e.shiftKey && (activeEl === first || activeEl === panelRef.current)) {
        e.preventDefault();
        last.focus();
      } else if (!e.shiftKey && activeEl === last) {
        e.preventDefault();
        first.focus();
      }
    }
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [open, onClose]);

  if (!mounted || !open) return null;

  return createPortal(
    <div className="fixed inset-0 z-[60]" data-sheet-root>
      <button
        type="button"
        aria-label={closeLabel}
        onClick={onClose}
        className="absolute inset-0 h-full w-full cursor-default sheet-scrim"
        style={{ background: "rgba(0,0,0,0.6)" }}
        tabIndex={-1}
      />
      <div
        ref={panelRef}
        role="dialog"
        aria-modal="true"
        aria-labelledby={title ? titleId : undefined}
        aria-label={!title ? ariaLabel : undefined}
        tabIndex={-1}
        className="sheet-panel absolute inset-x-0 bottom-0 mx-auto flex max-h-[92dvh] w-full max-w-[560px] flex-col outline-none"
        style={{
          background: "#141416",
          color: "#f2f2f0",
          borderTopLeftRadius: 20,
          borderTopRightRadius: 20,
          boxShadow: "0 -8px 32px rgba(0,0,0,0.5)",
          transform: dragY > 0 ? `translateY(${dragY}px)` : undefined,
          transition: isDragging ? "none" : "transform 200ms cubic-bezier(0.16, 1, 0.3, 1)",
          paddingBottom: "env(safe-area-inset-bottom, 0px)",
          height: full ? "92dvh" : undefined,
        }}
      >
        <div
          className="shrink-0 px-5 pt-2"
          style={{ touchAction: "none" }}
          onPointerDown={(e) => {
            // Controls in the header (close, time chip) must keep their click: capturing the pointer would swallow it.
            if ((e.target as Element).closest("button, a, input, textarea, select")) return;
            dragStart.current = e.clientY;
            setIsDragging(true);
            (e.currentTarget as Element).setPointerCapture?.(e.pointerId);
          }}
          onPointerMove={(e) => {
            if (dragStart.current === null) return;
            setDragY(Math.max(0, e.clientY - dragStart.current));
          }}
          onPointerUp={(e) => {
            const dy = dragStart.current === null ? 0 : e.clientY - dragStart.current;
            dragStart.current = null;
            setIsDragging(false);
            if (dy > SWIPE_CLOSE_PX) onClose();
            else setDragY(0);
          }}
          onPointerCancel={() => {
            dragStart.current = null;
            setIsDragging(false);
            setDragY(0);
          }}
        >
          <div className="mx-auto h-1 w-10 rounded-full" style={{ background: "#3a3a40" }} aria-hidden />
          {title && (
            <h2 id={titleId} className="pb-2 pt-3 text-[20px] font-semibold leading-tight tracking-[-0.01em]">
              {title}
            </h2>
          )}
          {header}
        </div>
        <div className="min-h-0 flex-1 overflow-y-auto px-5 pb-4 pt-1">{children}</div>
        {footer && <div className="shrink-0 px-5 pb-6 pt-2">{footer}</div>}
      </div>
    </div>,
    document.body
  );
}
