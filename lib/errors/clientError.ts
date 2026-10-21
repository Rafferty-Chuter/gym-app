/**
 * Client error reports (TR3): what a crash on the phone sends to
 * `POST /api/client-error`, and the scrubbing that keeps the person's data
 * out of it. Pure: no storage, no `window`; the caller passes the route and
 * the app version in.
 *
 * A report carries five fields and nothing else: where it was caught, the
 * error's name and message, the stack frames, the page's path and the app
 * version. Stored values (weights, food, sleep, dates) can only reach a
 * report through an error message or a stack, so both are scrubbed here on
 * the phone and again on the server (CLAUDE.md rule 10).
 */

// ── Limits ──

/** A message longer than this is cut. Real messages are one line; anything longer is usually data. */
export const MAX_MESSAGE_CHARS = 300;
/** Frames kept from the top of a stack. The crash site is in the first few; the rest is React and Next. */
export const MAX_STACK_FRAMES = 25;
/** One frame is a function name and a script URL; longer means something else got in. */
export const MAX_FRAME_CHARS = 300;
/** Upper bound on the joined stack: every frame at its cap plus a newline. */
export const MAX_STACK_CHARS = MAX_STACK_FRAMES * (MAX_FRAME_CHARS + 1);
/** Paths in this app are short (`/signal/volume`); a longer one is cut. */
export const MAX_ROUTE_CHARS = 120;
/** "1.0 beta (2c2c083)" or "1.0 beta (2026-10-21 14:05)". */
export const MAX_VERSION_CHARS = 60;

// ── Types ──

/** Where the error was caught: the page's error screen, the root error screen, or outside React. */
export const CLIENT_ERROR_SOURCES = ["boundary", "global", "window", "rejection"] as const;
export type ClientErrorSource = (typeof CLIENT_ERROR_SOURCES)[number];

export type ClientErrorPayload = {
  source: ClientErrorSource;
  /** "TypeError: Cannot read properties of undefined (reading 'kcal')", scrubbed. */
  message: string;
  /** Stack frames only, one per line, scrubbed; "" when the browser gave none. */
  stack: string;
  /** The page's path, without its query or hash (`/food?date=…` carries a date). */
  route: string;
  appVersion: string;
};

// ── Scrubbing ──

/** V8 property errors name the property the code read ("reading 'kcal'"); that name comes from code, so it stays. */
const CODE_QUOTE_CONTEXT = /\((?:reading|setting|evaluating)\s*$/;
const IDENTIFIER_PATH = /^[A-Za-z_$][\w$]*(?:\.[A-Za-z_$][\w$]*)*$/;

/**
 * Removes anything in an error message that could be the person's data:
 * every line after the first (dumps and row listings), URL queries and
 * hashes, email addresses, quoted text (JSON snippets, food names) unless
 * it is a property name V8 quotes, and every number (weights, kcal, dates,
 * times). React's error codes ("#418") stay, since they come from React.
 * Whitespace is collapsed and the result capped. Idempotent, so the server
 * can run it again on what the phone sent.
 *
 * Unquoted words can't be told from code words, so app code must never
 * put a stored value into an error message; none does today (its messages
 * carry statuses and storage error codes).
 */
export function scrubMessage(text: string): string {
  let s = String(text).split(/\r?\n/).find((line) => line.trim() !== "") ?? "";
  s = s.replace(/(https?:\/\/[^\s?#'"`)]*)[?#][^\s'"`)]*/g, "$1");
  s = s.replace(/[\w.+-]+@[\w-]+(?:\.[\w-]+)+/g, "<email>");
  s = s.replace(/"[^"]*"|'[^']*'|`[^`]*`/g, (quoted, offset: number) => {
    const inner = quoted.slice(1, -1);
    const keep = inner.length <= 40 && IDENTIFIER_PATH.test(inner) && CODE_QUOTE_CONTEXT.test(s.slice(Math.max(0, offset - 12), offset));
    return keep ? quoted : `${quoted[0]}…${quoted[0]}`;
  });
  s = s.replace(/(?<![A-Za-z_$#\d.])\d+(?:[.,:]\d+)*/g, "#");
  s = s.replace(/\s+/g, " ").trim();
  return s.length > MAX_MESSAGE_CHARS ? `${s.slice(0, MAX_MESSAGE_CHARS - 1)}…` : s;
}

/** Chrome and Node: "    at fn (https://host/chunk.js:1:2)". */
const V8_FRAME = /^\s*at\s+\S/;
/** Safari and Firefox: "fn@https://host/chunk.js:1:2", "global code@…", "forEach@[native code]". */
const AT_FRAME = /^[^\s@]*(?: code)?@(?:\[native code\]|\S+:\d+:\d+)$/;

/** "https://host/chunk.js?dpl=abc:12:3" → "https://host/chunk.js:12:3". */
function withoutQuery(url: string): string {
  const at = /^(.*?)((?::\d+){1,2})$/.exec(url);
  const [body, position] = at ? [at[1], at[2]] : [url, ""];
  return body.split(/[?#]/)[0] + position;
}

/**
 * Keeps only the frames of a stack. Chrome puts the message on the stack's
 * first line (and a multi-line message on several), so every line that is
 * not a frame is dropped; the message travels scrubbed in its own field.
 * Script URLs lose their query and hash (Vercel adds `?dpl=…`; an inline
 * script's URL is the page's, with its `?date=`).
 */
export function scrubStack(stack: string | undefined | null): string {
  if (!stack) return "";
  const frames: string[] = [];
  for (const raw of String(stack).split("\n")) {
    const line = raw.trim();
    if (!V8_FRAME.test(line) && !AT_FRAME.test(line)) continue;
    const clean = line.replace(/https?:\/\/[^\s)]+/g, withoutQuery);
    frames.push(clean.length > MAX_FRAME_CHARS ? clean.slice(0, MAX_FRAME_CHARS) : clean);
    if (frames.length >= MAX_STACK_FRAMES) break;
  }
  return frames.join("\n");
}

/** A path with its query and hash removed, capped. Anything that isn't a path becomes "/". */
export function scrubRoute(pathname: string): string {
  const path = String(pathname).split(/[?#]/)[0].replace(/\s/g, "");
  if (!path.startsWith("/")) return "/";
  return path.length > MAX_ROUTE_CHARS ? path.slice(0, MAX_ROUTE_CHARS) : path;
}

/** An error's name if it looks like one ("TypeError", "ChunkLoadError"); otherwise "Error". */
function errorName(name: unknown): string {
  return typeof name === "string" && /^[A-Za-z_$][\w$]{0,39}$/.test(name) ? name : "Error";
}

// ── Building a report ──

/**
 * The report for anything thrown. An `Error` (or an object shaped like
 * one) gives its name, scrubbed message and frames. Anything else thrown
 * or rejected (a string, a record) is described by its type alone, since
 * the value itself may be the person's data.
 */
export function buildClientErrorPayload(thrown: unknown, ctx: { source: ClientErrorSource; route: string; appVersion: string }): ClientErrorPayload {
  const base = { source: ctx.source, route: scrubRoute(ctx.route), appVersion: String(ctx.appVersion).slice(0, MAX_VERSION_CHARS) };
  if (thrown && typeof thrown === "object" && typeof (thrown as { message?: unknown }).message === "string") {
    const e = thrown as { name?: unknown; message: string; stack?: unknown };
    const message = scrubMessage(`${errorName(e.name)}: ${e.message}`);
    return { ...base, message, stack: scrubStack(typeof e.stack === "string" ? e.stack : "") };
  }
  const kind = thrown === null ? "null" : Array.isArray(thrown) ? "array" : typeof thrown;
  return { ...base, message: `Non-error thrown (${kind})`, stack: "" };
}

/**
 * Errors not worth a report: the browser's resize-observer warning, a
 * cross-origin "Script error." with nothing to go on, and anything thrown
 * from a browser extension.
 */
export function isNoiseError(p: ClientErrorPayload): boolean {
  if (/ResizeObserver loop/.test(p.message)) return true;
  if (/^Error: Script error\.?$/.test(p.message) && !p.stack) return true;
  return /(?:chrome|moz|safari(?:-web)?)-extension:\/\//.test(p.stack);
}
