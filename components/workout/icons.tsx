/** Line icons for the logger, drawn like the tab bar's (24 grid, 1.75 stroke, currentColor). */

const PROPS = { viewBox: "0 0 24 24", fill: "none", stroke: "currentColor", strokeWidth: 1.75, strokeLinecap: "round" as const, strokeLinejoin: "round" as const, "aria-hidden": true };

type IconProps = { className?: string };

/** Three dots in a row: an exercise's options. */
export function MoreIcon({ className = "h-5 w-5" }: IconProps) {
  return (
    <svg viewBox="0 0 24 24" fill="currentColor" className={className} aria-hidden>
      <circle cx="5.5" cy="12" r="1.75" />
      <circle cx="12" cy="12" r="1.75" />
      <circle cx="18.5" cy="12" r="1.75" />
    </svg>
  );
}

export function CheckIcon({ className = "h-5 w-5", strokeWidth = 2.5 }: IconProps & { strokeWidth?: number }) {
  return (
    <svg {...PROPS} strokeWidth={strokeWidth} className={className}>
      <path d="M5 12.5l4.5 4.5L19 7.5" />
    </svg>
  );
}

export function PlusIcon({ className = "h-4 w-4" }: IconProps) {
  return (
    <svg {...PROPS} strokeWidth={2.25} className={className}>
      <path d="M12 5v14M5 12h14" />
    </svg>
  );
}

/** Two opposed arrows: replace an exercise. */
export function ReplaceIcon({ className = "h-5 w-5" }: IconProps) {
  return (
    <svg {...PROPS} className={className}>
      <path d="M4 8h13l-3.5-3.5M20 16H7l3.5 3.5" />
    </svg>
  );
}

/** A stopwatch: rest time. */
export function TimerIcon({ className = "h-5 w-5" }: IconProps) {
  return (
    <svg {...PROPS} className={className}>
      <circle cx="12" cy="13.5" r="7.5" />
      <path d="M12 9.5v4l2.5 1.5M10 2.5h4" />
    </svg>
  );
}

/** Up and down arrows: reorder. */
export function ReorderIcon({ className = "h-5 w-5" }: IconProps) {
  return (
    <svg {...PROPS} className={className}>
      <path d="M8 20V4L4.5 7.5M16 4v16l3.5-3.5" />
    </svg>
  );
}

/** A rising line: history and records. */
export function HistoryIcon({ className = "h-5 w-5" }: IconProps) {
  return (
    <svg {...PROPS} className={className}>
      <path d="M4 19h16" />
      <path d="M5 15l4.5-4.5 3.5 3 6-6.5" />
    </svg>
  );
}

export function TrashIcon({ className = "h-5 w-5" }: IconProps) {
  return (
    <svg {...PROPS} className={className}>
      <path d="M4 7h16M10 3.5h4M6.5 7l.8 12.2a1.5 1.5 0 0 0 1.5 1.3h6.4a1.5 1.5 0 0 0 1.5-1.3L17.5 7M10 11v6M14 11v6" />
    </svg>
  );
}

/** A page with a folded corner and lines: a note. */
export function NoteIcon({ className = "h-5 w-5" }: IconProps) {
  return (
    <svg {...PROPS} className={className}>
      <path d="M14 3.5H6.5a1.5 1.5 0 0 0-1.5 1.5v14a1.5 1.5 0 0 0 1.5 1.5h11a1.5 1.5 0 0 0 1.5-1.5V8.5z" />
      <path d="M14 3.5v5h5M8.5 13h7M8.5 16.5h4.5" />
    </svg>
  );
}

/** A bar end with two plates: the plate calculator. */
export function PlatesIcon({ className = "h-5 w-5" }: IconProps) {
  return (
    <svg {...PROPS} className={className}>
      <path d="M2.5 12h3M18.5 12h3" />
      <rect x="5.5" y="5" width="3.5" height="14" rx="1" />
      <rect x="9" y="7.5" width="2.5" height="9" rx="1" />
      <path d="M11.5 12h7" />
    </svg>
  );
}
