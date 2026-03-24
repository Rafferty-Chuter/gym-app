"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

const TABS = [
  { href: "/", label: "Home" },
  { href: "/workout", label: "Workout" },
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
    <nav className="fixed inset-x-0 bottom-0 z-40 border-t border-teal-900/35 bg-zinc-950/95 backdrop-blur supports-[backdrop-filter]:bg-zinc-950/80">
      <div className="mx-auto grid max-w-3xl grid-cols-4 px-3 py-2">
        {TABS.map((tab) => {
          const active = isActive(tab.href);
          return (
            <Link
              key={tab.href}
              href={tab.href}
              className={`rounded-xl px-2 py-2 text-center text-xs font-semibold transition ${
                active
                  ? "bg-teal-500/20 text-teal-200"
                  : "text-app-tertiary hover:text-app-secondary hover:bg-zinc-900/70"
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

