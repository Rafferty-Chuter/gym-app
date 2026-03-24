"use client";

import { getExerciseByName } from "@/lib/exerciseLibrary";

export const TEMPLATE_STORAGE_KEY = "workoutTemplates";

export type TemplateExercise = {
  exerciseId?: string;
  name: string;
  targetSets: number;
  restSec?: number;
};

export type WorkoutTemplate = {
  id: string;
  name: string;
  exercises: TemplateExercise[];
};

function fallbackIdFromName(name: string, index: number) {
  return `tpl_${index}_${name
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "_")
    .replace(/^_+|_+$/g, "")}`;
}

function normalizeTemplate(
  raw: { id?: string; name: string; exercises: unknown[] },
  index: number
): WorkoutTemplate {
  const templateName = typeof raw.name === "string" ? raw.name : `Template ${index + 1}`;
  return {
    id:
      typeof raw.id === "string" && raw.id.trim()
        ? raw.id.trim()
        : fallbackIdFromName(templateName, index),
    name: templateName,
    exercises: (Array.isArray(raw.exercises) ? raw.exercises : []).map((ex) => {
      if (typeof ex === "string") {
        const byName = getExerciseByName(ex);
        return {
          ...(byName ? { exerciseId: byName.id } : {}),
          name: byName?.name ?? ex,
          targetSets: 3,
          restSec: 90,
        };
      }
      if (!ex || typeof ex !== "object" || !("name" in ex)) {
        return { name: "Exercise", targetSets: 3, restSec: 90 };
      }
      const e = ex as Record<string, unknown>;
      const rawName = String(e.name ?? "Exercise");
      const byName = getExerciseByName(rawName);
      const targetSets = Number.isFinite(Number(e.targetSets))
        ? Math.max(1, Math.min(20, Number(e.targetSets)))
        : 3;
      const restSec = Number.isFinite(Number(e.restSec))
        ? Math.max(0, Math.min(600, Number(e.restSec)))
        : 90;
      const exerciseId =
        typeof e.exerciseId === "string" && e.exerciseId.trim()
          ? e.exerciseId.trim()
          : byName?.id;
      return {
        ...(exerciseId ? { exerciseId } : {}),
        name: byName?.name ?? rawName,
        targetSets,
        restSec,
      };
    }),
  };
}

export function getStoredTemplates(): WorkoutTemplate[] {
  if (typeof window === "undefined") return [];
  try {
    const raw = localStorage.getItem(TEMPLATE_STORAGE_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw) as unknown;
    if (!Array.isArray(parsed)) return [];
    return parsed.map((t, i) => normalizeTemplate(t as { id?: string; name: string; exercises: unknown[] }, i));
  } catch {
    return [];
  }
}

export function saveTemplates(templates: WorkoutTemplate[]) {
  if (typeof window === "undefined") return;
  localStorage.setItem(TEMPLATE_STORAGE_KEY, JSON.stringify(templates));
}

export function getTemplateById(templateId: string): WorkoutTemplate | null {
  return getStoredTemplates().find((t) => t.id === templateId) ?? null;
}

export function upsertTemplate(template: WorkoutTemplate) {
  const all = getStoredTemplates();
  const idx = all.findIndex((t) => t.id === template.id);
  const next = idx === -1 ? [...all, template] : all.map((t, i) => (i === idx ? template : t));
  saveTemplates(next);
}

export function deleteTemplateById(templateId: string) {
  const all = getStoredTemplates().filter((t) => t.id !== templateId);
  saveTemplates(all);
}

