"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

function HomeIcon() {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round" className="h-[20px] w-[20px]">
      <path d="M3 9l9-7 9 7v11a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z" />
      <polyline points="9 22 9 12 15 12 15 22" />
    </svg>
  );
}

function TemplatesIcon() {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round" className="h-[20px] w-[20px]">
      <rect x="3" y="3" width="7" height="7" rx="1.5" />
      <rect x="14" y="3" width="7" height="7" rx="1.5" />
      <rect x="3" y="14" width="7" height="7" rx="1.5" />
      <rect x="14" y="14" width="7" height="7" rx="1.5" />
    </svg>
  );
}

function HistoryIcon() {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round" className="h-[20px] w-[20px]">
      <path d="M3 12a9 9 0 1 0 3-6.7" />
      <polyline points="3 4 3 9 8 9" />
      <polyline points="12 7 12 12 15 14" />
    </svg>
  );
}

function ProfileIcon() {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round" className="h-[20px] w-[20px]">
      <circle cx="12" cy="8" r="4" />
      <path d="M4 20c0-4 3.6-7 8-7s8 3 8 7" />
    </svg>
  );
}

type BottomTab = {
  href: string;
  label: string;
  matchPrefix?: string;
  Icon: React.ComponentType;
};

const TABS: BottomTab[] = [
  { href: "/", label: "Home", Icon: HomeIcon },
  { href: "/templates", label: "Templates", matchPrefix: "/templates", Icon: TemplatesIcon },
  { href: "/history", label: "History", matchPrefix: "/history", Icon: HistoryIcon },
  { href: "/profile", label: "Profile", matchPrefix: "/profile", Icon: ProfileIcon },
];

export default function BottomTabs() {
  const pathname = usePathname();

  function isActive(href: string, matchPrefix?: string) {
    if (href === "/") return pathname === "/";
    if (matchPrefix) return pathname === href || pathname.startsWith(`${matchPrefix}/`) || pathname === matchPrefix;
    return pathname === href || pathname.startsWith(`${href}/`);
  }

  return (
    <nav
      className="fixed left-[env(safe-area-inset-left,0px)] right-[env(safe-area-inset-right,0px)] bottom-0 z-40 pb-[env(safe-area-inset-bottom,0px)]"
      style={{
        background: "#0e1420",
        borderTop: "1px solid rgba(255,255,255,0.06)",
      }}
    >
      <div className="mx-auto grid max-w-2xl grid-cols-4 px-2 pt-2 pb-3">
        {TABS.map((tab) => {
          const active = isActive(tab.href, tab.matchPrefix);
          return (
            <Link
              key={tab.href}
              href={tab.href}
              className={`flex flex-col items-center gap-1.5 py-1.5 px-1 rounded-xl transition-colors duration-200 ${
                active ? "" : "hover:opacity-80 active:scale-95"
              }`}
              style={{ color: active ? "#00e5b0" : "rgba(100,120,140,0.70)" }}
            >
              <tab.Icon />
              <span
                className="text-[10px] tracking-[0.03em] transition-colors duration-200"
                style={{ fontWeight: active ? 700 : 500 }}
              >
                {tab.label}
              </span>
            </Link>
          );
        })}
      </div>
    </nav>
  );
}
