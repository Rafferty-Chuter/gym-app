/**
 * Local-date helpers. Dates are `YYYY-MM-DD` strings in the user's own
 * timezone. Arithmetic runs on UTC midnights so DST never shifts a day.
 *
 * Every function is pure except `clientNow()`, which is the one place the
 * browser clock is read. Engines take `{today, tz}` as an argument.
 */

export type LocalDate = string;

export type Now = { today: LocalDate; tz: string };

const DATE_RE = /^(\d{4})-(\d{2})-(\d{2})$/;

export function isLocalDate(s: unknown): s is LocalDate {
  return typeof s === "string" && DATE_RE.test(s);
}

/** Format an instant as the local calendar date in `tz` (IANA). */
export function localDateKey(date: Date, tz: string): LocalDate {
  try {
    const parts = new Intl.DateTimeFormat("en-CA", {
      timeZone: tz,
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
    }).formatToParts(date);
    const get = (t: string) => parts.find((p) => p.type === t)?.value ?? "";
    return `${get("year")}-${get("month")}-${get("day")}`;
  } catch {
    // Unknown tz: fall back to the runtime's local date.
    const y = date.getFullYear();
    const m = String(date.getMonth() + 1).padStart(2, "0");
    const d = String(date.getDate()).padStart(2, "0");
    return `${y}-${m}-${d}`;
  }
}

function toUtcMs(key: LocalDate): number {
  const m = DATE_RE.exec(key);
  if (!m) return NaN;
  return Date.UTC(Number(m[1]), Number(m[2]) - 1, Number(m[3]));
}

function fromUtcMs(ms: number): LocalDate {
  return new Date(ms).toISOString().slice(0, 10);
}

export function addDays(key: LocalDate, n: number): LocalDate {
  return fromUtcMs(toUtcMs(key) + n * 86_400_000);
}

/** Whole days from `a` to `b` (positive when b is later). */
export function dayDiff(a: LocalDate, b: LocalDate): number {
  return Math.round((toUtcMs(b) - toUtcMs(a)) / 86_400_000);
}

/** Inclusive range of dates from `from` to `to`. Empty when `to` < `from`. */
export function dateRange(from: LocalDate, to: LocalDate): LocalDate[] {
  const n = dayDiff(from, to);
  if (!Number.isFinite(n) || n < 0) return [];
  const out: LocalDate[] = [];
  for (let i = 0; i <= n; i++) out.push(addDays(from, i));
  return out;
}

/** 0 = Sunday … 6 = Saturday. */
export function weekday(key: LocalDate): number {
  return new Date(toUtcMs(key)).getUTCDay();
}

/** Monday to Friday. */
export function isWeekday(key: LocalDate): boolean {
  const d = weekday(key);
  return d >= 1 && d <= 5;
}

export function maxDate(a: LocalDate, b: LocalDate): LocalDate {
  return a >= b ? a : b;
}

export function minDate(a: LocalDate, b: LocalDate): LocalDate {
  return a <= b ? a : b;
}

/** The only clock read. Client-side; the server receives `now` in payloads. */
export function clientNow(): Now {
  let tz = "UTC";
  try {
    tz = Intl.DateTimeFormat().resolvedOptions().timeZone || "UTC";
  } catch {
    /* keep UTC */
  }
  return { today: localDateKey(new Date(), tz), tz };
}
