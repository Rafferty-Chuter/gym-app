"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import SavedFoodRow, { PlusButton } from "@/components/food/SavedFoodRow";
import BarcodeScanner from "@/components/food/BarcodeScanner";
import { ErrorLine, PrimaryButton } from "@/components/physique/ui";
import { loadCofid, searchFoods } from "@/lib/food/cofid";
import { portionChoices, scaleMacros } from "@/lib/food/portions";
import type { FoodItem, Portion } from "@/lib/food/types";
import { hourLabel } from "@/lib/physique/food/timeline";
import { recentLists } from "@/lib/physique/food/goTos";
import type { FoodInput } from "@/lib/physique/io/foodData";
import type { FoodEntry, SavedFood } from "@/lib/physique/types";
import type { LocalDate } from "@/lib/dates";

type Props = {
  hour: number;
  today: LocalDate;
  tz: string;
  entries: readonly FoodEntry[];
  saved: readonly SavedFood[];
  busy: boolean;
  onLog: (food: FoodInput, savedFoodId?: string) => Promise<boolean>;
  onPrefill: (s: SavedFood) => void;
};

/** Wait this long after typing stops before asking Open Food Facts. OURS. */
export const OFF_DEBOUNCE_MS = 350;
/** Products are searched from this many characters; the base list from one. OURS. */
export const OFF_MIN_CHARS = 3;
/** Base-list rows shown. OURS. */
export const LOCAL_LIMIT = 8;

const n = (v: number) => Math.round(v).toLocaleString("en-GB");
const inputClass = "h-11 rounded-[12px] px-3 text-[15px] outline-none focus:ring-1";
const inputStyle = { background: "var(--surface-raised)", color: "var(--text)", border: "1px solid var(--border)" };

type OffState = { status: "idle" | "loading" | "error"; items: FoodItem[] };

/**
 * The logger's Search tab (M4): the UK base list answers as you type, UK
 * products from Open Food Facts follow, a barcode goes straight to its
 * product. Empty, it shows the go-tos for the hour and the latest foods.
 * A row's plus logs the usual portion; the row itself opens the amount.
 */
export default function FoodSearch({ hour, today, tz, entries, saved, busy, onLog, onPrefill }: Props) {
  const [query, setQuery] = useState("");
  const [cofid, setCofid] = useState<FoodItem[] | null>(null);
  const [off, setOff] = useState<OffState>({ status: "idle", items: [] });
  const [selected, setSelected] = useState<{ item: FoodItem; viaBarcode: boolean } | null>(null);
  const [scanning, setScanning] = useState(false);
  const [lookup, setLookup] = useState<"idle" | "loading" | "missing" | "error">("idle");
  const inputRef = useRef<HTMLInputElement | null>(null);

  useEffect(() => {
    let live = true;
    loadCofid().then((items) => {
      if (live) setCofid(items);
    });
    return () => {
      live = false;
    };
  }, []);

  const q = query.trim();
  const local = useMemo(() => (cofid && q ? searchFoods(cofid, q, LOCAL_LIMIT) : []), [cofid, q]);

  useEffect(() => {
    if (q.length < OFF_MIN_CHARS) {
      setOff({ status: "idle", items: [] });
      return;
    }
    const ctrl = new AbortController();
    const t = window.setTimeout(async () => {
      setOff((s) => ({ ...s, status: "loading" }));
      try {
        const res = await fetch(`/api/food/search?q=${encodeURIComponent(q)}`, { signal: ctrl.signal });
        if (!res.ok) throw new Error(String(res.status));
        const json = (await res.json()) as { items?: FoodItem[] };
        setOff({ status: "idle", items: json.items ?? [] });
      } catch (e) {
        if ((e as { name?: string })?.name !== "AbortError") setOff({ status: "error", items: [] });
      }
    }, OFF_DEBOUNCE_MS);
    return () => {
      window.clearTimeout(t);
      ctrl.abort();
    };
  }, [q]);

  const recent = useMemo(() => recentLists(entries, saved, hour, today, tz), [entries, saved, hour, today, tz]);

  async function onCode(code: string) {
    setScanning(false);
    setLookup("loading");
    try {
      const res = await fetch(`/api/food/barcode?code=${encodeURIComponent(code)}`);
      if (res.status === 404) {
        setLookup("missing");
        return;
      }
      if (!res.ok) throw new Error(String(res.status));
      const json = (await res.json()) as { item: FoodItem };
      setLookup("idle");
      setSelected({ item: json.item, viaBarcode: true });
    } catch {
      setLookup("error");
    }
  }

  function labelFor(item: FoodItem): string {
    return item.brand ? `${item.name} (${item.brand})` : item.name;
  }

  async function logAmount(item: FoodItem, grams: number, portionLabel: string | null, viaBarcode: boolean): Promise<boolean> {
    const m = scaleMacros(item, grams);
    const serving = portionLabel && portionLabel !== "100 g" ? `${portionLabel} · ${Math.round(grams)} g` : `${Math.round(grams)} g`;
    return onLog({ label: labelFor(item), kcal: m.kcal, proteinG: m.proteinG, fatG: m.fatG, carbsG: m.carbsG, serving, method: viaBarcode ? "barcode" : "search" });
  }

  const resultRow = (item: FoodItem) => {
    const usual = portionChoices(item)[0];
    const m = scaleMacros(item, usual.grams);
    return (
      <li key={item.id} className="flex items-center gap-2">
        <button type="button" onClick={() => setSelected({ item, viaBarcode: false })} className="flex min-w-0 flex-1 flex-col rounded-[12px] px-3 py-2.5 text-left transition-colors active:bg-[var(--surface-raised)]" aria-label={`${labelFor(item)}. Choose amount`}>
          <span className="truncate text-[15px]" style={{ color: "var(--text)" }}>
            {item.name}
          </span>
          <span className="truncate text-[11px]" style={{ color: "var(--text-tertiary)", fontVariantNumeric: "tabular-nums" }}>
            {item.brand ? `${item.brand} · ` : ""}
            {usual.label} · {n(m.kcal)} kcal · {Math.round(m.proteinG)}P {Math.round(m.fatG)}F {Math.round(m.carbsG)}C
          </span>
        </button>
        <PlusButton onClick={() => void logAmount(item, usual.grams, usual.label, false)} label={`Log ${usual.label} of ${labelFor(item)}`} disabled={busy} />
      </li>
    );
  };

  if (selected) {
    return (
      <AmountPanel
        item={selected.item}
        busy={busy}
        onBack={() => setSelected(null)}
        onLog={async (grams, label) => {
          const ok = await logAmount(selected.item, grams, label, selected.viaBarcode);
          if (ok) setSelected(null);
        }}
      />
    );
  }

  const section = (title: string, children: React.ReactNode) => (
    <section aria-label={title}>
      <p className="mb-1 text-[11px] font-medium uppercase tracking-[0.04em]" style={{ color: "var(--text-tertiary)" }}>
        {title}
      </p>
      {children}
    </section>
  );

  return (
    <div className="flex flex-col gap-3">
      <div className="flex gap-2">
        <input ref={inputRef} type="search" value={query} onChange={(e) => setQuery(e.target.value)} placeholder="Search foods and products" className={`${inputClass} min-w-0 flex-1`} style={inputStyle} aria-label="Search foods" autoComplete="off" autoCorrect="off" spellCheck={false} />
        <button type="button" onClick={() => setScanning(true)} className="flex h-11 w-11 shrink-0 items-center justify-center rounded-[12px]" style={{ background: "var(--surface-raised)", color: "var(--text)", border: "1px solid var(--border)" }} aria-label="Scan a barcode">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.8} strokeLinecap="round" className="h-5 w-5" aria-hidden>
            <path d="M4 7V4h3M17 4h3v3M20 17v3h-3M7 20H4v-3M7 8v8M10 8v8M13 8v8M17 8v8" />
          </svg>
        </button>
      </div>
      {lookup !== "idle" && (
        <p className="text-[13px]" style={{ color: "var(--text-secondary)" }}>
          {lookup === "loading" ? "Looking it up" : lookup === "missing" ? "That barcode is not in the database yet. Quick add it with the label's numbers." : "Could not reach the database. Try again, or quick add it."}
        </p>
      )}
      {q ? (
        <div className="flex flex-col gap-4">
          {cofid === null ? (
            <p className="py-2 text-[13px]" style={{ color: "var(--text-tertiary)" }}>
              Loading the food list
            </p>
          ) : local.length > 0 ? (
            section("Foods", <ul className="flex flex-col">{local.map(resultRow)}</ul>)
          ) : null}
          {q.length >= OFF_MIN_CHARS &&
            section(
              "Products",
              off.items.length > 0 ? (
                <ul className="flex flex-col">{off.items.map(resultRow)}</ul>
              ) : (
                <p className="py-2 text-[13px]" style={{ color: "var(--text-tertiary)" }}>
                  {off.status === "loading" ? "Searching products" : off.status === "error" ? "Could not reach the product database." : "No UK products match. Try a brand name, or scan the barcode."}
                </p>
              )
            )}
          {cofid !== null && local.length === 0 && q.length < OFF_MIN_CHARS && (
            <p className="py-2 text-[13px]" style={{ color: "var(--text-tertiary)" }}>
              Keep typing for products.
            </p>
          )}
        </div>
      ) : (
        <div className="flex flex-col gap-4">
          {recent.goTos.length > 0 && section(`Go-tos for ${hourLabel(hour)}`, <ul className="flex flex-col">{recent.goTos.map((s) => <SavedFoodRow key={s.id} food={s} onPrefill={onPrefill} trailing={<PlusButton onClick={() => void onLog({ label: s.label, kcal: s.kcal, proteinG: s.proteinG, fatG: s.fatG, carbsG: s.carbsG, serving: s.serving, method: "saved" }, s.id)} label={`Log ${s.label}`} disabled={busy} />} />)}</ul>)}
          {section(
            "Latest",
            recent.latest.length === 0 && recent.goTos.length === 0 ? (
              <p className="py-2 text-[13px]" style={{ color: "var(--text-tertiary)" }}>
                Nothing logged yet. Search a food above, or scan a barcode.
              </p>
            ) : (
              <ul className="flex flex-col">{recent.latest.map((s) => <SavedFoodRow key={s.id} food={s} onPrefill={onPrefill} trailing={<PlusButton onClick={() => void onLog({ label: s.label, kcal: s.kcal, proteinG: s.proteinG, fatG: s.fatG, carbsG: s.carbsG, serving: s.serving, method: "saved" }, s.id)} label={`Log ${s.label}`} disabled={busy} />} />)}</ul>
            )
          )}
          <p className="text-[11px]" style={{ color: "var(--text-tertiary)" }}>
            Generic foods: McCance and Widdowson&apos;s Composition of Foods (UK, Open Government Licence). Products: Open Food Facts.
          </p>
        </div>
      )}
      <BarcodeScanner open={scanning} onClose={() => setScanning(false)} onCode={onCode} />
    </div>
  );
}

/** Quantity steps for the amount panel. OURS. */
const QUANTITY_STEP = 0.5;

function AmountPanel({ item, busy, onBack, onLog }: { item: FoodItem; busy: boolean; onBack: () => void; onLog: (grams: number, portionLabel: string | null) => Promise<void> }) {
  const choices = useMemo(() => portionChoices(item), [item]);
  const [portion, setPortion] = useState<Portion>(choices[0]);
  const [quantity, setQuantity] = useState(1);
  const [customGrams, setCustomGrams] = useState<string>("");
  const [error, setError] = useState<string | null>(null);
  const custom = customGrams.trim() !== "" ? Number(customGrams) : null;
  const grams = custom != null && Number.isFinite(custom) && custom > 0 ? custom : portion.grams * quantity;
  const m = scaleMacros(item, grams);
  const label = custom != null && Number.isFinite(custom) && custom > 0 ? null : quantity === 1 ? portion.label : `${quantity} × ${portion.label}`;

  return (
    <div className="flex flex-col gap-3">
      <button type="button" onClick={onBack} className="flex w-fit items-center gap-1 text-[13px] font-medium" style={{ color: "var(--text-secondary)" }} aria-label="Back to results">
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" className="h-4 w-4" aria-hidden>
          <path d="M15 6l-6 6 6 6" />
        </svg>
        Results
      </button>
      <div className="flex flex-col">
        <span className="text-[17px] font-semibold" style={{ color: "var(--text)" }}>
          {item.name}
        </span>
        <span className="text-[12px]" style={{ color: "var(--text-tertiary)", fontVariantNumeric: "tabular-nums" }}>
          {item.brand ? `${item.brand} · ` : ""}per 100 g: {n(item.per100.kcal)} kcal · {Math.round(item.per100.proteinG)}P {Math.round(item.per100.fatG)}F {Math.round(item.per100.carbsG)}C
        </span>
      </div>
      <div className="flex flex-wrap gap-2" role="radiogroup" aria-label="Portion">
        {choices.map((c) => {
          const on = custom == null && c.grams === portion.grams;
          return (
            <button key={c.label} type="button" role="radio" aria-checked={on} onClick={() => { setPortion(c); setCustomGrams(""); }} className="h-9 rounded-full px-3 text-[13px] font-medium transition-colors" style={{ background: on ? "var(--primary)" : "var(--surface-raised)", color: on ? "var(--text-on-primary)" : "var(--text-secondary)" }}>
              {c.label}
            </button>
          );
        })}
      </div>
      <div className="flex items-center gap-2">
        <div className="flex h-11 items-center rounded-[12px]" style={{ background: "var(--surface-raised)", border: "1px solid var(--border)" }} role="group" aria-label="Quantity">
          <button type="button" onClick={() => { setQuantity((x) => Math.max(QUANTITY_STEP, Math.round((x - QUANTITY_STEP) * 2) / 2)); setCustomGrams(""); }} className="h-full w-10 text-[17px]" style={{ color: "var(--text-secondary)" }} aria-label="Less">
            −
          </button>
          <span className="w-10 text-center text-[15px] font-semibold" style={{ color: "var(--text)", fontVariantNumeric: "tabular-nums" }}>
            {custom != null ? "–" : `×${quantity}`}
          </span>
          <button type="button" onClick={() => { setQuantity((x) => Math.round((x + QUANTITY_STEP) * 2) / 2); setCustomGrams(""); }} className="h-full w-10 text-[17px]" style={{ color: "var(--text-secondary)" }} aria-label="More">
            +
          </button>
        </div>
        <div className="relative min-w-0 flex-1">
          <input type="text" inputMode="decimal" value={customGrams} onChange={(e) => setCustomGrams(e.target.value.replace(/[^\d.]/g, ""))} placeholder={`${Math.round(portion.grams * quantity)}`} className={`${inputClass} w-full pr-8`} style={inputStyle} aria-label="Grams" autoComplete="off" />
          <span className="pointer-events-none absolute right-3 top-1/2 -translate-y-1/2 text-[13px]" style={{ color: "var(--text-tertiary)" }}>
            g
          </span>
        </div>
      </div>
      <p className="text-[15px] font-semibold" style={{ color: "var(--text)", fontVariantNumeric: "tabular-nums" }} aria-live="polite">
        {n(m.kcal)} kcal · {Math.round(m.proteinG)}P {Math.round(m.fatG)}F {Math.round(m.carbsG)}C
      </p>
      <ErrorLine text={error} />
      <PrimaryButton
        onClick={async () => {
          setError(null);
          if (!(grams > 0)) {
            setError("Enter an amount.");
            return;
          }
          await onLog(grams, label);
        }}
        disabled={busy || !(grams > 0)}
      >
        Log {n(m.kcal)} kcal
      </PrimaryButton>
    </div>
  );
}
