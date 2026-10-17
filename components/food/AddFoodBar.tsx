"use client";

/**
 * The add-food bar (05-design §9.4): a search-style pill pinned above the
 * tab bar. Tapping it opens the logger; the right icon opens Describe.
 */
export default function AddFoodBar({ onOpen, onDescribe }: { onOpen: () => void; onDescribe: () => void }) {
  return (
    <div className="pointer-events-none fixed inset-x-0 z-30 flex justify-center px-5" style={{ bottom: "calc(80px + env(safe-area-inset-bottom, 0px))" }}>
      <div className="pointer-events-auto flex h-[48px] w-full max-w-[560px] items-center rounded-full pl-4 pr-1.5" style={{ background: "#1d1d20", border: "1px solid #2a2a2e", boxShadow: "0 8px 24px rgba(0,0,0,0.45)" }}>
        <button type="button" onClick={onOpen} className="flex h-full flex-1 items-center gap-2 text-left" aria-label="Add a food">
          <svg viewBox="0 0 24 24" fill="none" stroke="#a3a3a8" strokeWidth={2} strokeLinecap="round" className="h-4 w-4" aria-hidden>
            <circle cx="11" cy="11" r="7" />
            <path d="M20 20l-3.5-3.5" />
          </svg>
          <span className="text-[15px]" style={{ color: "#a3a3a8" }}>
            Add a food
          </span>
        </button>
        <button type="button" onClick={onDescribe} className="flex h-9 w-9 items-center justify-center rounded-full transition-colors active:bg-[#26262a]" style={{ color: "#f2f2f0" }} aria-label="Describe a meal">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.8} strokeLinecap="round" strokeLinejoin="round" className="h-[18px] w-[18px]" aria-hidden>
            <path d="M12 3l1.8 4.7L18.5 9.5l-4.7 1.8L12 16l-1.8-4.7L5.5 9.5l4.7-1.8z" />
            <path d="M19 15l.8 2.2 2.2.8-2.2.8L19 21l-.8-2.2-2.2-.8 2.2-.8z" />
          </svg>
        </button>
      </div>
    </div>
  );
}
