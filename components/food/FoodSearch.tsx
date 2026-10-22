"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import SavedFoodRow, { PlusButton } from "@/components/food/SavedFoodRow";
import MacroText from "@/components/food/MacroText";
import NutrientList from "@/components/food/NutrientList";
import BarcodeScanner from "@/components/food/BarcodeScanner";
import { ErrorLine, PrimaryButton } from "@/components/physique/ui";
import { loadCofid, searchFoods } from "@/lib/food/cofid";
import { portionChoices, scaleMacros } from "@/lib/food/portions";
import { amountAfterSwitch, formatAmount, gramsFor, servingName, stepAmount, type ServingUnit } from "@/lib/food/servings";
import type { FoodItem } from "@/lib/food/types";
import { pickExtras } from "@/lib/food/extras";
import { hourLabel } from "@/lib/physique/food/timeline";
import { recentLists } from "@/lib/physique/food/goTos";
import { savedFoodInput, type FoodInput } from "@/lib/physique/io/foodData";
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
    // IN6: the extras, the weight and the database food ride along, so they can be read (and filled in) later.
    return onLog({ label: labelFor(item), kcal: m.kcal, proteinG: m.proteinG, fatG: m.fatG, carbsG: m.carbsG, fibreG: m.fibreG, ...pickExtras(m), grams: Math.round(grams), sourceId: item.id, serving, method: viaBarcode ? "barcode" : "search" });
  }

  const resultRow = (item: FoodItem) => {
    const usual = portionChoices(item)[0];
    const m = scaleMacros(item, usual.grams);
    return (
      <li key={item.id} className="flex items-center gap-2 pr-3">
        <button type="button" onClick={() => setSelected({ item, viaBarcode: false })} className="flex min-w-0 flex-1 flex-col gap-0.5 py-3 pl-4 text-left transition-colors active:opacity-70" aria-label={`${labelFor(item)}. Choose amount`}>
          <span className="truncate text-[15px]" style={{ color: "var(--text)" }}>
            {item.name}
          </span>
          <span className="truncate text-[11px]" style={{ color: "var(--text-tertiary)" }}>
            {item.brand ? `${item.brand} · ` : ""}
            {usual.label}
          </span>
          <MacroText kcal={m.kcal} proteinG={m.proteinG} fatG={m.fatG} carbsG={m.carbsG} />
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
      <p className="mb-1.5 px-1 text-[11px] font-medium uppercase tracking-[0.04em]" style={{ color: "var(--text-tertiary)" }}>
        {title}
      </p>
      {children}
    </section>
  );
  // Results and recents in one card with hairlines, as the Food tab lists them (polish).
  const list = "flex flex-col divide-y divide-[var(--border)] overflow-hidden rounded-[16px]";
  const listStyle = { background: "var(--surface)" };

  return (
    <div className="flex flex-col gap-3">
      <div className="flex gap-2">
        <label className="flex h-12 min-w-0 flex-1 items-center gap-2 rounded-full px-4" style={{ background: "var(--surface)", border: "1px solid var(--border)" }}>
          <svg viewBox="0 0 24 24" fill="none" stroke="var(--text-tertiary)" strokeWidth={2} strokeLinecap="round" className="h-[18px] w-[18px] shrink-0" aria-hidden>
            <circle cx="11" cy="11" r="6.5" />
            <path d="M16 16l4 4" />
          </svg>
          <input ref={inputRef} type="search" value={query} onChange={(e) => setQuery(e.target.value)} placeholder="Search foods" className="h-full min-w-0 flex-1 bg-transparent text-[15px] outline-none" style={{ color: "var(--text)" }} aria-label="Search foods" autoComplete="off" autoCorrect="off" spellCheck={false} />
        </label>
        <button type="button" onClick={() => setScanning(true)} className="flex h-12 shrink-0 items-center gap-1.5 rounded-full px-4 text-[13px] font-semibold transition-colors active:bg-[var(--surface-pressed)]" style={{ background: "var(--surface-raised)", color: "var(--text)" }} aria-label="Scan a barcode">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.8} strokeLinecap="round" className="h-[18px] w-[18px]" aria-hidden>
            <path d="M4 7V4h3M17 4h3v3M20 17v3h-3M7 20H4v-3M7 8v8M10 8v8M13 8v8M17 8v8" />
          </svg>
          Scan
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
            section("Foods", <ul className={list} style={listStyle}>{local.map(resultRow)}</ul>)
          ) : null}
          {q.length >= OFF_MIN_CHARS &&
            section(
              "Products",
              off.items.length > 0 ? (
                <ul className={list} style={listStyle}>{off.items.map(resultRow)}</ul>
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
          {recent.goTos.length > 0 && section(`Go-tos for ${hourLabel(hour)}`, <ul className={list} style={listStyle}>{recent.goTos.map((s) => <SavedFoodRow key={s.id} food={s} onPrefill={onPrefill} trailing={<PlusButton onClick={() => void onLog(savedFoodInput(s), s.id)} label={`Log ${s.label}`} disabled={busy} />} />)}</ul>)}
          {section(
            "Latest",
            recent.latest.length === 0 && recent.goTos.length === 0 ? (
              <p className="px-1 py-2 text-[13px]" style={{ color: "var(--text-tertiary)" }}>
                Foods you log show here for one tap next time.
              </p>
            ) : (
              <ul className={list} style={listStyle}>{recent.latest.map((s) => <SavedFoodRow key={s.id} food={s} onPrefill={onPrefill} trailing={<PlusButton onClick={() => void onLog(savedFoodInput(s), s.id)} label={`Log ${s.label}`} disabled={busy} />} />)}</ul>
            )
          )}
        </div>
      )}
      <BarcodeScanner open={scanning} onClose={() => setScanning(false)} onCode={onCode} />
    </div>
  );
}

/** The serving sizes offered for an item: its own portions (without "100 g", which grams cover), then grams and ounces (C6). */
function servingUnits(item: FoodItem): ServingUnit[] {
  const own = portionChoices(item).filter((p) => p.label !== "100 g");
  return [...own.map((portion) => ({ kind: "portion", portion }) as const), { kind: "g" } as const, { kind: "oz" } as const];
}

const unitKey = (u: ServingUnit) => (u.kind === "portion" ? `p:${u.portion.label}:${u.portion.grams}` : u.kind);
const unitChip = (u: ServingUnit) => (u.kind === "portion" ? u.portion.label : u.kind);

/**
 * How much (C6, after MacroFactor's food page): pick a serving size (the
 * food's own portions, g or oz), then the amount of it with − / + or the
 * keypad. The grams it comes to, and the macros, update as you go.
 */
function AmountPanel({ item, busy, onBack, onLog }: { item: FoodItem; busy: boolean; onBack: () => void; onLog: (grams: number, portionLabel: string | null) => Promise<void> }) {
  const units = useMemo(() => servingUnits(item), [item]);
  const [unit, setUnit] = useState<ServingUnit>(units[0]);
  const [amountText, setAmountText] = useState(units[0].kind === "g" ? "100" : "1");
  const [error, setError] = useState<string | null>(null);
  const amount = Number(amountText);
  const grams = gramsFor(amount, unit);
  const m = scaleMacros(item, grams);
  const label = servingName(amount, unit);

  function pick(u: ServingUnit) {
    if (unitKey(u) === unitKey(unit)) return;
    setAmountText(formatAmount(amountAfterSwitch(grams, u)));
    setUnit(u);
  }

  const stepBtn = (dir: 1 | -1) => (
    <button type="button" onClick={() => setAmountText(formatAmount(stepAmount(amount, unit, dir)))} className="h-full w-11 text-[19px]" style={{ color: "var(--text-secondary)" }} aria-label={dir < 0 ? "Less" : "More"}>
      {dir < 0 ? "\u2212" : "+"}
    </button>
  );

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
        <span className="flex flex-wrap items-baseline gap-x-1.5 text-[12px]" style={{ color: "var(--text-tertiary)" }}>
          {item.brand ? `${item.brand} · ` : ""}per 100 g
          <MacroText kcal={item.per100.kcal} proteinG={item.per100.proteinG} fatG={item.per100.fatG} carbsG={item.per100.carbsG} size={12} />
        </span>
      </div>
      <div className="flex flex-col gap-1.5">
        <span className="text-[11px] font-medium uppercase tracking-[0.04em]" style={{ color: "var(--text-tertiary)" }}>
          Serving size
        </span>
        <div className="flex flex-wrap gap-2" role="radiogroup" aria-label="Serving size">
          {units.map((u) => {
            const on = unitKey(u) === unitKey(unit);
            return (
              <button key={unitKey(u)} type="button" role="radio" aria-checked={on} onClick={() => pick(u)} className="h-9 rounded-full px-3 text-[13px] font-medium transition-colors" style={{ background: on ? "var(--primary)" : "var(--surface-raised)", color: on ? "var(--text-on-primary)" : "var(--text-secondary)" }}>
                {unitChip(u)}
              </button>
            );
          })}
        </div>
      </div>
      <div className="flex items-center gap-3">
        <div className="flex h-11 items-center rounded-[12px]" style={{ background: "var(--surface-raised)", border: "1px solid var(--border)" }} role="group" aria-label="Amount">
          {stepBtn(-1)}
          <input
            type="text"
            inputMode="decimal"
            value={amountText}
            onChange={(e) => setAmountText(e.target.value.replace(/[^\d.]/g, ""))}
            className="h-full w-16 bg-transparent text-center text-[17px] font-semibold outline-none"
            style={{ color: "var(--text)", fontVariantNumeric: "tabular-nums" }}
            aria-label={`Amount in ${unit.kind === "portion" ? unit.portion.label : unit.kind}`}
            autoComplete="off"
          />
          {stepBtn(1)}
        </div>
        <span className="min-w-0 text-[13px] leading-snug" style={{ color: "var(--text-secondary)", fontVariantNumeric: "tabular-nums" }}>
          {unit.kind === "portion" ? `\u00d7 ${unit.portion.label}` : unit.kind}
          {unit.kind !== "g" && grams > 0 ? ` · ${Math.round(grams)} g` : ""}
        </span>
      </div>
      <p className="flex flex-wrap items-baseline gap-x-3 text-[15px] font-semibold" style={{ color: "var(--text)", fontVariantNumeric: "tabular-nums" }} aria-live="polite">
        <span>{n(m.kcal)} kcal</span>
        <MacroText kcal={m.kcal} proteinG={m.proteinG} fatG={m.fatG} carbsG={m.carbsG} showKcal={false} size={15} />
      </p>
      <NutrientList food={m} />
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
