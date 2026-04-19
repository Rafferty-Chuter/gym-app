"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

function HomeIcon() {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round" className="h-[19px] w-[19px]">
      <path d="M3 9l9-7 9 7v11a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z" />
      <polyline points="9 22 9 12 15 12 15 22" />
    </svg>
  );
}

function TemplatesIcon() {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round" className="h-[19px] w-[19px]">
      <rect x="3" y="3" width="7" height="7" rx="1.5" />
      <rect x="14" y="3" width="7" height="7" rx="1.5" />
      <rect x="3" y="14" width="7" height="7" rx="1.5" />
      <rect x="14" y="14" width="7" height="7" rx="1.5" />
    </svg>
  );
}

function CoachIcon() {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round" className="h-[19px] w-[19px]">
      <path d="M13 2L3 14h9l-1 8 10-12h-9l1-8z" />
    </svg>
  );
}

function ProfileIcon() {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round" className="h-[19px] w-[19px]">
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
  { href: "/coach", label: "Coach", Icon: CoachIcon },
  { href: "/profile", label: "Profile", Icon: ProfileIcon },
];

export default function BottomTabs() {
  const pathname = usePathname();

  function isActive(href: string, matchPrefix?: string) {
    if (href === "/") return pathname === "/";
    if (href === "/coach") return pathname === "/coach" || pathname.startsWith("/coach/") || pathname === "/analysis";
    if (matchPrefix) return pathname === href || pathname.startsWith(`${matchPrefix}/`) || pathname === matchPrefix;
    return pathname === href || pathname.startsWith(`${href}/`);
  }

  return (
    <nav
      className="fixed left-[env(safe-area-inset-left,0px)] right-[env(safe-area-inset-right,0px)] bottom-0 z-40 pb-[env(safe-area-inset-bottom,0px)]"
      style={{
        background: "rgba(7, 9, 15, 0.97)",
        backdropFilter: "blur(28px)",
        WebkitBackdropFilter: "blur(28px)",
        borderTop: "1px solid rgba(255, 255, 255, 0.055)",
        boxShadow: "0 -1px 0 rgba(20, 184, 166, 0.08), 0 -12px 40px -8px rgba(0,0,0,0.75)",
      }}
    >
      <div className="mx-auto grid max-w-3xl grid-cols-4 px-2 pt-1.5 pb-2">
        {TABS.map((tab) => {
          const active = isActive(tab.href, tab.matchPrefix);
          return (
            <Link
              key={tab.href}
              href={tab.href}
              className={`flex flex-col items-center gap-1 rounded-2xl py-2 px-1 transition-all duration-200 ${
                active
                  ? "text-teal-300"
                  : "text-zinc-500 hover:text-zinc-400 active:scale-95"
              }`}
            >
              <div
                className={`flex h-8 w-8 items-center justify-center rounded-xl transition-all duration-200 ${
                  active ? "bg-teal-500/14 shadow-[0_0_12px_-2px_rgba(20,184,166,0.25)]" : ""
                }`}
              >
                <tab.Icon />
              </div>
              <span
                className={`text-[10px] font-bold tracking-[0.04em] transition-colors duration-200 ${
                  active ? "text-teal-300" : "text-zinc-600"
                }`}
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
