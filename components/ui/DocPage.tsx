import Link from "next/link";
import type { ReactNode } from "react";

export type DocSection = { title: string; body: ReactNode };

/**
 * A plain reading page (privacy policy, support): a back link, the title,
 * the date it was last changed, then titled sections. Server-rendered so
 * the App Store and testers can open it without the app's data.
 */
export default function DocPage({ title, updated, intro, sections }: { title: string; updated: string; intro: ReactNode; sections: readonly DocSection[] }) {
  return (
    <main className="min-h-screen pb-16" style={{ background: "var(--page)", color: "var(--text)" }}>
      <div className="mx-auto flex max-w-2xl flex-col gap-6 px-5 pt-6 sm:px-6">
        <Link href="/profile" className="flex w-fit items-center gap-1 text-[13px] font-medium" style={{ color: "var(--text-secondary)" }}>
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" className="h-4 w-4" aria-hidden>
            <path d="M15 6l-6 6 6 6" />
          </svg>
          Profile
        </Link>
        <header className="flex flex-col gap-1">
          <span className="text-[11px] font-medium uppercase tracking-[0.04em]" style={{ color: "var(--text-tertiary)" }}>
            Gym AI · Updated {updated}
          </span>
          <h1 className="text-[34px] font-semibold leading-[1.05] tracking-[-0.02em]">{title}</h1>
        </header>
        <div className="text-[15px] leading-relaxed" style={{ color: "var(--text-secondary)" }}>
          {intro}
        </div>
        {sections.map((s) => (
          <section key={s.title} className="flex flex-col gap-2" aria-label={s.title}>
            <h2 className="text-[17px] font-semibold" style={{ color: "var(--text)" }}>
              {s.title}
            </h2>
            <div className="flex flex-col gap-2 text-[15px] leading-relaxed [&_li]:ml-4 [&_li]:list-disc [&_ul]:flex [&_ul]:flex-col [&_ul]:gap-1" style={{ color: "var(--text-secondary)" }}>
              {s.body}
            </div>
          </section>
        ))}
      </div>
    </main>
  );
}
