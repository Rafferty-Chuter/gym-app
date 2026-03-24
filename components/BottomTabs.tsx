"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

const TABS = [
  { href: "/", label: "Home" },
  { href: "/workout", label: "Templates" },
  { href: "/coach", label: "Coach" },
  { href: "/profile", label: "Profile" },
];

export default function BottomTabs() {
  const pathname = usePathname();

  function isActive(href: string) {
    if (href === "/") return pathname === "/";
    if (href === "/coach") return pathname === "/coach" || pathname === "/analysis";
    return pathname.startsWith(href);
  }

  return (
    <nav className="fixed inset-x-0 bottom-0 z-40 border-t-2 border-teal-500/35 bg-zinc-950/98 shadow-[0_-12px_28px_-14px_rgba(0,0,0,0.8)] backdrop-blur supports-[backdrop-filter]:bg-zinc-950/88">
      <div className="mx-auto grid max-w-3xl grid-cols-4 gap-2 px-3 py-2.5">
        {TABS.map((tab) => {
          const active = isActive(tab.href);
          return (
            <Link
              key={tab.href}
              href={tab.href}
              className={`rounded-xl px-2 py-2.5 text-center text-[13px] font-bold tracking-[0.01em] transition-all duration-150 ${
                active
                  ? "bg-gradient-to-br from-teal-400/35 via-teal-500/25 to-cyan-500/25 text-teal-100 border border-teal-300/40 shadow-[0_8px_22px_-12px_rgba(20,184,166,0.65)]"
                  : "text-zinc-300 border border-zinc-700/70 bg-zinc-900/60 hover:text-white hover:border-teal-500/35 hover:bg-zinc-900/85"
              }`}
            >
              {tab.label}
            </Link>
          );
        })}
      </div>
    </nav>
  );
}

