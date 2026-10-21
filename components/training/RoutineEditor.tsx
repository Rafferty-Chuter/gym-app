"use client";

import { useRef, useState } from "react";
import { useRouter } from "next/navigation";
import Sheet from "@/components/ui/Sheet";
import ExercisePickerSheet, { type PickedExercise } from "@/components/training/ExercisePickerSheet";
import { ErrorLine, PrimaryButton, Row, RowGroup } from "@/components/physique/ui";
import { useUnit } from "@/lib/unit-preference";
import { displayToKg, kgToDisplay, type WeightUnit } from "@/lib/units";
import { deleteTemplateById, upsertTemplate, type TemplateExercise, type TemplateSet, type WorkoutTemplate } from "@/lib/templateStorage";
import { addRow, DEFAULT_REST_SEC, DEFAULT_WORKING_SETS, estimateMinutes, moveItem, plannedRows, removeRow, REST_PRESETS, restLabel, withRows, workingSetCount, newRoutineId } from "@/lib/training/routine";
import { targetsForExercise } from "@/lib/training/targets";

type Draft = TemplateExercise & { key: string };

let keySeq = 0;
const nextKey = () => `ex-${Date.now().toString(36)}-${(keySeq += 1)}`;

function toDraft(ex: TemplateExercise): Draft {
  return { ...ex, sets: plannedRows(ex), key: nextKey() };
}

function fromPicked(p: PickedExercise): Draft {
  const targets = targetsForExercise(p.name);
  return {
    ...(p.exerciseId ? { exerciseId: p.exerciseId } : {}),
    name: p.name,
    targetSets: DEFAULT_WORKING_SETS,
    restSec: DEFAULT_REST_SEC,
    ...targets,
    sets: Array.from({ length: DEFAULT_WORKING_SETS }, () => ({})),
    key: nextKey(),
  };
}

const fmtNum = (n: number) => String(Math.round(n * 10) / 10).replace(/\.0$/, "");

/** A number cell that keeps what is typed until blur, then commits the parsed value (or clears it). */
function NumberCell({ value, placeholder, onCommit, label, decimal }: { value: number | undefined; placeholder: string; onCommit: (n: number | undefined) => void; label: string; decimal: boolean }) {
  const [text, setText] = useState(value != null ? fmtNum(value) : "");
  const [prev, setPrev] = useState(value);
  if (prev !== value) {
    setPrev(value);
    setText(value != null ? fmtNum(value) : "");
  }
  return (
    <input
      inputMode={decimal ? "decimal" : "numeric"}
      value={text}
      placeholder={placeholder}
      aria-label={label}
      onChange={(e) => setText(e.target.value.replace(decimal ? /[^0-9.,]/g : /[^0-9]/g, "").replace(",", "."))}
      onBlur={() => {
        const n = Number(text);
        onCommit(text.trim() && Number.isFinite(n) && n > 0 ? n : undefined);
      }}
      className="h-[36px] w-full rounded-[8px] text-center text-[15px] font-semibold outline-none placeholder:font-normal placeholder:text-[var(--text-tertiary)]"
      style={{ background: "var(--surface-raised)", color: "var(--text)", fontVariantNumeric: "tabular-nums" }}
    />
  );
}

function Stepper({ label, value, min, max, onChange }: { label: string; value: number; min: number; max: number; onChange: (n: number) => void }) {
  const btn = "flex h-10 w-10 items-center justify-center rounded-full text-[18px] font-semibold disabled:opacity-30";
  return (
    <div className="flex items-center justify-between gap-3 px-4 py-2.5" role="group" aria-label={label}>
      <span className="text-[15px]" style={{ color: "var(--text-secondary)" }}>
        {label}
      </span>
      <div className="flex items-center gap-2">
        <button type="button" className={btn} style={{ background: "var(--surface-raised)", color: "var(--text)" }} onClick={() => onChange(Math.max(min, value - 1))} disabled={value <= min} aria-label={`Decrease ${label}`}>
          −
        </button>
        <span className="w-8 text-center text-[17px] font-semibold" style={{ color: "var(--text)", fontVariantNumeric: "tabular-nums" }}>
          {value}
        </span>
        <button type="button" className={btn} style={{ background: "var(--surface-raised)", color: "var(--text)" }} onClick={() => onChange(Math.min(max, value + 1))} disabled={value >= max} aria-label={`Increase ${label}`}>
          +
        </button>
      </div>
    </div>
  );
}

const chipCls = "h-[30px] rounded-full px-3 text-[12px] font-medium";

/**
 * Create or edit a routine (TR2, after Hevy's Create Routine): a name, then
 * each exercise with its planned sets as rows (warm-ups marked W), a rest
 * timer, the rep target and a note. "Add exercises" opens the picker; the
 * exercise menu replaces, moves or removes. Planned weight and reps are
 * optional: blank rows log as usual with last time's numbers alongside.
 */
export default function RoutineEditor({ mode, initialTemplate }: { mode: "create" | "edit"; initialTemplate?: WorkoutTemplate }) {
  const router = useRouter();
  const { unit: rawUnit } = useUnit();
  const unit: WeightUnit = rawUnit === "lb" ? "lb" : "kg";
  const [routineId] = useState(() => initialTemplate?.id ?? newRoutineId(Date.now(), Math.random));
  const [name, setName] = useState(initialTemplate?.name ?? "");
  const [items, setItems] = useState<Draft[]>(() => (initialTemplate?.exercises ?? []).map(toDraft));
  const [picker, setPicker] = useState<{ mode: "add" } | { mode: "replace"; key: string } | null>(null);
  const [menuKey, setMenuKey] = useState<string | null>(null);
  const [restKey, setRestKey] = useState<string | null>(null);
  const [targetKey, setTargetKey] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [dirty, setDirty] = useState(false);
  const [confirmLeave, setConfirmLeave] = useState(false);
  const [confirmDelete, setConfirmDelete] = useState(false);
  const nameRef = useRef<HTMLInputElement | null>(null);

  const change = (fn: (cur: Draft[]) => Draft[]) => {
    setItems(fn);
    setDirty(true);
    setError(null);
  };
  const update = (key: string, fn: (d: Draft) => Draft) => change((cur) => cur.map((d) => (d.key === key ? fn(d) : d)));
  const byKey = (key: string | null) => items.find((d) => d.key === key) ?? null;

  function save() {
    const trimmed = name.trim();
    if (!trimmed) {
      setError("Give the routine a name.");
      nameRef.current?.focus();
      return;
    }
    if (items.length === 0) {
      setError("Add at least one exercise.");
      return;
    }
    const exercises: TemplateExercise[] = items.map((d) => {
      const rest = { ...d } as Partial<Draft>;
      delete rest.key;
      return withRows(rest as TemplateExercise, plannedRows(d));
    });
    try {
      upsertTemplate({ id: routineId, name: trimmed, exercises });
      router.push("/train");
    } catch {
      setError("Couldn't save. Export a backup from Profile, then free up space.");
    }
  }

  function cancel() {
    if (dirty && !confirmLeave) {
      setConfirmLeave(true);
      window.setTimeout(() => setConfirmLeave(false), 3000);
      return;
    }
    router.back();
  }

  function remove() {
    if (!confirmDelete) {
      setConfirmDelete(true);
      window.setTimeout(() => setConfirmDelete(false), 3000);
      return;
    }
    deleteTemplateById(routineId);
    router.push("/train");
  }

  function picked(list: PickedExercise[]) {
    if (!picker) return;
    if (picker.mode === "add") change((cur) => [...cur, ...list.map(fromPicked)]);
    else if (list[0]) {
      const p = list[0];
      update(picker.key, (d) => ({ ...d, ...(p.exerciseId ? { exerciseId: p.exerciseId } : { exerciseId: undefined }), name: p.name, ...targetsForExercise(p.name) }));
    }
  }

  const menuItem = byKey(menuKey);
  const menuIndex = menuItem ? items.indexOf(menuItem) : -1;
  const restItem = byKey(restKey);
  const targetItem = byKey(targetKey);
  const totalSets = workingSetCount({ exercises: items });

  return (
    <main className="min-h-screen pb-28" style={{ background: "var(--page)", color: "var(--text)" }}>
      <header className="sticky top-0 z-30" style={{ background: "var(--background)", borderBottom: "1px solid var(--surface-raised)" }}>
        <div className="mx-auto flex max-w-2xl items-center justify-between gap-3 px-5 py-3 sm:px-6">
          <button type="button" onClick={cancel} className="min-w-[64px] text-left text-[15px]" style={{ color: confirmLeave ? "var(--status-attention)" : "var(--text-secondary)" }}>
            {confirmLeave ? "Discard?" : "Cancel"}
          </button>
          <span className="text-[17px] font-semibold">{mode === "create" ? "New routine" : "Edit routine"}</span>
          <button type="button" onClick={save} className="h-[34px] min-w-[64px] rounded-full px-4 text-[15px] font-semibold" style={{ background: "var(--primary)", color: "var(--text-on-primary)" }}>
            Save
          </button>
        </div>
      </header>

      <div className="mx-auto flex max-w-2xl flex-col gap-4 px-5 pt-4 sm:px-6">
        <input
          ref={nameRef}
          value={name}
          onChange={(e) => {
            setName(e.target.value);
            setDirty(true);
            setError(null);
          }}
          placeholder="Routine name"
          aria-label="Routine name"
          maxLength={60}
          className="w-full bg-transparent text-[28px] font-semibold tracking-[-0.02em] outline-none placeholder:text-[var(--border-strong)]"
          style={{ color: "var(--text)" }}
        />
        {items.length > 0 && (
          <p className="-mt-2 text-[12px]" style={{ color: "var(--text-tertiary)", fontVariantNumeric: "tabular-nums" }}>
            {items.length} {items.length === 1 ? "exercise" : "exercises"} · {totalSets} working sets · about {estimateMinutes({ exercises: items })} min
          </p>
        )}
        <ErrorLine text={error} />

        {items.length === 0 && (
          <div className="flex flex-col items-center gap-1 rounded-[16px] px-4 py-8 text-center" style={{ background: "var(--surface)" }}>
            <span className="text-[15px] font-semibold">No exercises yet</span>
            <span className="text-[13px]" style={{ color: "var(--text-secondary)" }}>
              Add them, then set the sets for each. Weights are optional.
            </span>
          </div>
        )}

        {items.map((d) => {
          const rows = plannedRows(d);
          const workingCount = rows.filter((r) => r.type !== "warmup").length;
          let n = 0;
          const repHint = d.repMin != null && d.repMax != null ? (d.repMin === d.repMax ? String(d.repMin) : `${d.repMin}–${d.repMax}`) : "–";
          return (
            <section key={d.key} className="rounded-[16px] p-4" style={{ background: "var(--surface)" }} aria-label={d.name}>
              <div className="flex items-center justify-between gap-2">
                <span className="min-w-0 truncate text-[17px] font-semibold">{d.name}</span>
                <button type="button" onClick={() => setMenuKey(d.key)} className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full" style={{ background: "var(--surface-raised)", color: "var(--text)" }} aria-label={`${d.name} options`}>
                  <svg viewBox="0 0 24 24" fill="currentColor" className="h-4 w-4" aria-hidden>
                    <circle cx="5" cy="12" r="1.8" />
                    <circle cx="12" cy="12" r="1.8" />
                    <circle cx="19" cy="12" r="1.8" />
                  </svg>
                </button>
              </div>
              <input
                value={d.notes ?? ""}
                onChange={(e) => update(d.key, (x) => ({ ...x, notes: e.target.value.slice(0, 500) }))}
                placeholder="Add a note"
                aria-label={`Note for ${d.name}`}
                className="mt-1 w-full bg-transparent text-[13px] outline-none placeholder:text-[var(--text-tertiary)]"
                style={{ color: "var(--text-secondary)" }}
              />
              <div className="mt-2 flex flex-wrap gap-1.5">
                <button type="button" onClick={() => setRestKey(d.key)} className={chipCls} style={{ background: "var(--surface-raised)", color: "var(--text)" }} aria-label={`Rest timer ${restLabel(d.restSec)}. Change`}>
                  Rest {restLabel(d.restSec)}
                </button>
                <button type="button" onClick={() => setTargetKey(d.key)} className={chipCls} style={{ background: "var(--surface-raised)", color: "var(--text)" }} aria-label="Change rep target and reps in reserve">
                  {repHint} reps · RIR {d.rir ?? 2}
                </button>
              </div>

              <div className="mt-3 grid grid-cols-[40px_1fr_1fr_32px] items-center gap-x-2 gap-y-1.5 text-[11px] font-medium uppercase tracking-[0.04em]" style={{ color: "var(--text-tertiary)" }}>
                <span className="text-center">Set</span>
                <span className="text-center">{unit}</span>
                <span className="text-center">Reps</span>
                <span />
                {rows.map((r, i) => {
                  const warm = r.type === "warmup";
                  if (!warm) n += 1;
                  const label = warm ? "W" : String(n);
                  const setRow = (patch: Partial<TemplateSet>) =>
                    update(d.key, (x) => {
                      const next = plannedRows(x);
                      next[i] = { ...next[i], ...patch };
                      for (const k of Object.keys(patch) as Array<keyof TemplateSet>) if (patch[k] === undefined) delete next[i][k];
                      return withRows(x, next);
                    });
                  return (
                    <div key={i} className="contents">
                      <button
                        type="button"
                        onClick={() => (warm ? setRow({ type: undefined }) : workingCount > 1 ? setRow({ type: "warmup" }) : undefined)}
                        className="h-[36px] rounded-[8px] text-[15px] font-semibold"
                        style={{ background: "transparent", color: warm ? "var(--text-tertiary)" : "var(--text)" }}
                        aria-label={warm ? `Warm-up set. Make it a working set` : `Set ${label}. Make it a warm-up`}
                      >
                        {label}
                      </button>
                      <NumberCell value={r.kg != null ? kgToDisplay(r.kg, unit) : undefined} placeholder="–" decimal label={`Set ${label} ${unit}`} onCommit={(v) => setRow({ kg: v != null ? Math.round(displayToKg(v, unit) * 100) / 100 : undefined })} />
                      <NumberCell value={r.reps} placeholder={warm ? "–" : repHint} decimal={false} label={`Set ${label} reps`} onCommit={(v) => setRow({ reps: v != null ? Math.round(v) : undefined })} />
                      <button
                        type="button"
                        onClick={() => update(d.key, (x) => removeRow(x, i))}
                        disabled={!warm && workingCount <= 1}
                        className="flex h-[32px] w-[32px] items-center justify-center rounded-full text-[18px] disabled:opacity-20"
                        style={{ color: "var(--text-tertiary)" }}
                        aria-label={`Remove set ${label}`}
                      >
                        ×
                      </button>
                    </div>
                  );
                })}
              </div>

              <div className="mt-3 flex gap-2">
                <button type="button" onClick={() => update(d.key, (x) => addRow(x))} className="h-[38px] flex-1 rounded-[10px] text-[13px] font-semibold" style={{ background: "var(--surface-raised)", color: "var(--text)" }}>
                  + Add set
                </button>
                <button type="button" onClick={() => update(d.key, (x) => addRow(x, "warmup"))} className="h-[38px] rounded-[10px] px-3 text-[13px] font-semibold" style={{ background: "var(--surface-raised)", color: "var(--text-secondary)" }}>
                  + Warm-up
                </button>
              </div>
            </section>
          );
        })}

        <PrimaryButton onClick={() => setPicker({ mode: "add" })}>Add exercises</PrimaryButton>

        {mode === "edit" && (
          <button type="button" onClick={remove} className="mx-auto mt-2 text-[13px] font-semibold" style={{ color: "var(--status-attention)" }}>
            {confirmDelete ? "Tap again to delete this routine" : "Delete routine"}
          </button>
        )}
      </div>

      <ExercisePickerSheet
        open={picker != null}
        onClose={() => setPicker(null)}
        mode={picker?.mode === "replace" ? "single" : "multi"}
        onPick={picked}
        inRoutine={items.map((d) => d.name)}
      />

      <Sheet open={menuItem != null} onClose={() => setMenuKey(null)} title={menuItem?.name}>
        {menuItem && (
          <RowGroup>
            <Row label="Replace exercise" value="" onClick={() => (setMenuKey(null), setPicker({ mode: "replace", key: menuItem.key }))} />
            {menuIndex > 0 && <Row label="Move up" value="" onClick={() => (change((cur) => moveItem(cur, menuIndex, menuIndex - 1)), setMenuKey(null))} />}
            {menuIndex < items.length - 1 && <Row label="Move down" value="" onClick={() => (change((cur) => moveItem(cur, menuIndex, menuIndex + 1)), setMenuKey(null))} />}
            <Row label="Remove from routine" value="" onClick={() => (change((cur) => cur.filter((x) => x.key !== menuItem.key)), setMenuKey(null))} ariaLabel={`Remove ${menuItem.name} from the routine`} />
          </RowGroup>
        )}
      </Sheet>

      <Sheet open={restItem != null} onClose={() => setRestKey(null)} title="Rest timer">
        {restItem && (
          <div className="grid grid-cols-5 gap-2 pb-2">
            {REST_PRESETS.map((sec) => {
              const on = (restItem.restSec ?? DEFAULT_REST_SEC) === sec;
              return (
                <button
                  key={sec}
                  type="button"
                  onClick={() => (update(restItem.key, (x) => ({ ...x, restSec: sec })), setRestKey(null))}
                  aria-pressed={on}
                  className="h-[44px] rounded-[10px] text-[15px] font-semibold"
                  style={on ? { background: "var(--primary)", color: "var(--text-on-primary)" } : { background: "var(--surface-raised)", color: "var(--text)" }}
                >
                  {restLabel(sec)}
                </button>
              );
            })}
          </div>
        )}
      </Sheet>

      <Sheet open={targetItem != null} onClose={() => setTargetKey(null)} title="Rep target">
        {targetItem && (
          <div className="flex flex-col gap-3 pb-2">
            <RowGroup>
              <Stepper label="Fewest reps" value={targetItem.repMin ?? 8} min={1} max={targetItem.repMax ?? 30} onChange={(v) => update(targetItem.key, (x) => ({ ...x, repMin: v }))} />
              <Stepper label="Most reps" value={targetItem.repMax ?? 12} min={targetItem.repMin ?? 1} max={30} onChange={(v) => update(targetItem.key, (x) => ({ ...x, repMax: v }))} />
              <Stepper label="Reps in reserve" value={targetItem.rir ?? 2} min={0} max={5} onChange={(v) => update(targetItem.key, (x) => ({ ...x, rir: v }))} />
            </RowGroup>
            <p className="text-[12px] leading-snug" style={{ color: "var(--text-tertiary)" }}>
              The next-set suggestion works inside this range: add reps until the top, then add weight.
            </p>
          </div>
        )}
      </Sheet>
    </main>
  );
}
