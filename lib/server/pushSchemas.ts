import { z } from "zod";
import type { GapSummary } from "@/lib/physique/reminder";

const dateStr = z.string().regex(/^\d{4}-\d{2}-\d{2}$/);

/** The phone's summary of logged days (lib/physique/reminder.ts). */
export const summarySchema = z.object({
  logged: z.object({ food: z.array(dateStr).max(31), weight: z.array(dateStr).max(31), sleep: z.array(dateStr).max(31) }),
  first: z.object({ food: dateStr.nullable(), weight: dateStr.nullable(), sleep: dateStr.nullable() }),
});

export const settingsSchema = z.object({
  tz: z.string().min(1).max(64),
  reminderHHMM: z.string().regex(/^([01]\d|2[0-3]):[0-5]\d$/),
  summary: summarySchema,
  /** The Health Auto Export token, so the server can count nights it already holds. Hashed, never stored raw. */
  healthToken: z.string().min(32).max(256).nullable().optional(),
});

export const subscribeSchema = settingsSchema.extend({
  subscription: z.object({
    endpoint: z.url().max(2048),
    keys: z.object({ p256dh: z.string().min(1).max(512), auth: z.string().min(1).max(256) }),
  }),
});

export type SettingsBody = z.infer<typeof settingsSchema>;
export type SubscribeBody = z.infer<typeof subscribeSchema>;

export function asSummary(v: unknown): GapSummary | null {
  const r = summarySchema.safeParse(v);
  return r.success ? r.data : null;
}
