"use client";

import type { ReactNode } from "react";
import Link from "next/link";

/**
 * Page header (DESIGN.md rev 2): an 11px tracked caption above the title
 * in hero size, with the tab's primary log action as a white round + on
 * the right. Sticky over `bg`, hairline once scrolled.
 */
export default function PageHeader({
  caption,
  captionHref,
  title,
  action,
  secondary,
}: {
  caption?: ReactNode;
  /** Makes the caption a link (the Body page's goal caption opens the goal). */
  captionHref?: string;
  title: string;
  /** The + action: a label for assistive tech and a handler or href. */
  action?: { label: string; onClick?: () => void; href?: string };
  /** A quieter secondary control on the right (settings, profile). */
  secondary?: ReactNode;
}) {
  const captionNode = caption ? (
    <span className="block truncate text-[11px] font-medium uppercase tracking-[0.04em]" style={{ color: "#6f6f76" }}>
      {caption}
    </span>
  ) : null;
  const plus = (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2.2} strokeLinecap="round" className="h-5 w-5" aria-hidden>
      <path d="M12 5v14M5 12h14" />
    </svg>
  );
  const plusClass = "flex h-9 w-9 shrink-0 items-center justify-center rounded-full transition-colors active:bg-[#a3a3a8]";
  const plusStyle = { background: "#f2f2f0", color: "#0a0a0b" };
  return (
    <header className="sticky top-0 z-30 -mx-5 px-5 pb-3 pt-4 sm:-mx-6 sm:px-6" style={{ background: "#0a0a0b" }}>
      <div className="flex items-end justify-between gap-3">
        <div className="min-w-0">
          {captionHref && caption ? (
            <Link href={captionHref} className="block" aria-label={`${title} goal. Edit goal`}>
              {captionNode}
            </Link>
          ) : (
            captionNode
          )}
          <h1 className="mt-0.5 text-[34px] font-semibold leading-none tracking-[-0.02em]" style={{ color: "#f2f2f0" }}>
            {title}
          </h1>
        </div>
        <div className="flex shrink-0 items-center gap-2 pb-0.5">
          {secondary}
          {action &&
            (action.href ? (
              <Link href={action.href} className={plusClass} style={plusStyle} aria-label={action.label}>
                {plus}
              </Link>
            ) : (
              <button type="button" onClick={action.onClick} className={plusClass} style={plusStyle} aria-label={action.label}>
                {plus}
              </button>
            ))}
        </div>
      </div>
    </header>
  );
}
