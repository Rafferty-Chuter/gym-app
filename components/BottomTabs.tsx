"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

const ICON = "h-[20px] w-[20px]";
const ICON_PROPS = { viewBox: "0 0 24 24", fill: "none", stroke: "currentColor", strokeWidth: 1.75, strokeLinecap: "round" as const, strokeLinejoin: "round" as const };

function HomeIcon() {
  return (
    <svg {...ICON_PROPS} className={ICON} aria-hidden>
      <path d="M3 9l9-7 9 7v11a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z" />
      <polyline points="9 22 9 12 15 12 15 22" />
    </svg>
  );
}

/** A bowl: the Food tab. */
function FoodIcon() {
  return (
    <svg {...ICON_PROPS} className={ICON} aria-hidden>
      <path d="M3 11h18a9 9 0 0 1-18 0z" />
      <path d="M8 11V7M12 11V5M16 11V8" />
    </svg>
  );
}

/** A bathroom scale: the Body tab. */
function BodyIcon() {
  return (
    <svg {...ICON_PROPS} className={ICON} aria-hidden>
      <rect x="4" y="3" width="16" height="18" rx="3" />
      <path d="M8.5 9.5a3.5 3.5 0 0 1 7 0" />
      <path d="M12 9.5l1.6-2.2" />
    </svg>
  );
}

/** A moon: the Sleep tab. */
function SleepIcon() {
  return (
    <svg {...ICON_PROPS} className={ICON} aria-hidden>
      <path d="M20 14.5A8 8 0 0 1 9.5 4a8 8 0 1 0 10.5 10.5z" />
    </svg>
  );
}

/** A dumbbell: the Train tab. */
function TrainIcon() {
  return (
    <svg {...ICON_PROPS} className={ICON} aria-hidden>
      <path d="M6 8v8M18 8v8M3 10v4M21 10v4M6 12h12" />
    </svg>
  );
}

type BottomTab = {
  href: string;
  label: string;
  matchPrefixes?: string[];
  Icon: React.ComponentType;
};

/** Five tabs (DESIGN.md rev 2): Home, Food, Body, Sleep, Train. Templates and History live under Train. */
const TABS: BottomTab[] = [
  { href: "/", label: "Home", Icon: HomeIcon },
  { href: "/food", label: "Food", matchPrefixes: ["/food"], Icon: FoodIcon },
  { href: "/body", label: "Body", matchPrefixes: ["/body"], Icon: BodyIcon },
  { href: "/sleep", label: "Sleep", matchPrefixes: ["/sleep"], Icon: SleepIcon },
  { href: "/train", label: "Train", matchPrefixes: ["/train", "/templates", "/history", "/workout", "/progress", "/volume"], Icon: TrainIcon },
];

export default function BottomTabs() {
  const pathname = usePathname();
  // The welcome screen stands alone; the tabs would only invite skipping it.
  if (pathname === "/welcome") return null;

  function isActive(tab: BottomTab) {
    if (tab.href === "/") return pathname === "/";
    return (tab.matchPrefixes ?? [tab.href]).some((p) => pathname === p || pathname.startsWith(`${p}/`));
  }

  return (
    <nav
      className="fixed left-[env(safe-area-inset-left,0px)] right-[env(safe-area-inset-right,0px)] bottom-0 z-40 pb-[env(safe-area-inset-bottom,0px)]"
      style={{
        background: "var(--tab-bg)",
        borderTop: "1px solid var(--border)",
      }}
      aria-label="Main"
    >
      <div className="mx-auto grid max-w-2xl grid-cols-5 px-2 pt-2 pb-3">
        {TABS.map((tab) => {
          const active = isActive(tab);
          return (
            <Link
              key={tab.href}
              href={tab.href}
              aria-current={active ? "page" : undefined}
              className={`flex flex-col items-center gap-1.5 rounded-xl px-1 py-1.5 transition-colors duration-150 ${
                active ? "" : "hover:opacity-80 active:scale-95"
              }`}
              style={{ color: active ? "var(--text)" : "var(--text-tertiary)" }}
            >
              <tab.Icon />
              <span className="text-[11px] tracking-[0.04em]" style={{ fontWeight: 500 }}>
                {tab.label}
              </span>
            </Link>
          );
        })}
      </div>
    </nav>
  );
}
