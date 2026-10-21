/**
 * A small .xlsx reader for imports (TR7): MacroFactor exports a workbook,
 * not a CSV. Reads the zip with the platform's own `DecompressionStream`
 * (Safari 16.4+, every current browser, Node 18+) and the SpreadsheetML
 * parts with a few regular expressions, so no spreadsheet library ships to
 * the phone. Values only: no formulas, styles or merged cells. Pure apart
 * from the async inflate.
 */

import type { LocalDate } from "@/lib/dates";

// ── Limits ──

/** Largest file read. OURS: years of daily rows with every micronutrient are a few MB. */
export const XLSX_MAX_BYTES = 25 * 1024 * 1024;
/** Largest single part once inflated. OURS: stops a zip bomb long before memory does. */
export const XLSX_MAX_PART_BYTES = 80 * 1024 * 1024;

// ── Types ──

export type Cell = string | number | boolean | null;

export type XlsxWorkbook = {
  sheetNames: string[];
  /** True when the workbook counts dates from 1904 (old Mac Excel). */
  date1904: boolean;
  /** A sheet's rows, by name (case and outer spaces ignored); empty rows left out. Null when there is no such sheet. */
  sheet(name: string): Promise<Cell[][] | null>;
};

// ── Zip ──

type ZipEntry = { method: number; compSize: number; size: number; offset: number };

const u16 = (b: Uint8Array, o: number) => b[o] | (b[o + 1] << 8);
const u32 = (b: Uint8Array, o: number) => (b[o] | (b[o + 1] << 8) | (b[o + 2] << 16) | (b[o + 3] << 24)) >>> 0;

/** True when the bytes start like a zip file (every .xlsx is one). */
export function looksLikeZip(bytes: Uint8Array): boolean {
  return bytes.length > 4 && bytes[0] === 0x50 && bytes[1] === 0x4b && bytes[2] === 0x03 && bytes[3] === 0x04;
}

function zipEntries(b: Uint8Array): Map<string, ZipEntry> {
  // The end-of-central-directory record sits in the last 22 bytes plus an optional comment of up to 64 KB.
  let eocd = -1;
  for (let i = b.length - 22; i >= Math.max(0, b.length - 22 - 0xffff); i--) {
    if (u32(b, i) === 0x06054b50) {
      eocd = i;
      break;
    }
  }
  if (eocd < 0) throw new Error("not a zip");
  const count = u16(b, eocd + 10);
  let p = u32(b, eocd + 16);
  const names = new TextDecoder();
  const out = new Map<string, ZipEntry>();
  for (let n = 0; n < count; n++) {
    if (p + 46 > b.length || u32(b, p) !== 0x02014b50) throw new Error("bad zip directory");
    const nameLen = u16(b, p + 28);
    const name = names.decode(b.subarray(p + 46, p + 46 + nameLen));
    out.set(name, { method: u16(b, p + 10), compSize: u32(b, p + 20), size: u32(b, p + 24), offset: u32(b, p + 42) });
    p += 46 + nameLen + u16(b, p + 30) + u16(b, p + 32);
  }
  return out;
}

async function inflateRaw(data: Uint8Array): Promise<Uint8Array> {
  const stream = new ReadableStream<Uint8Array>({
    start(c) {
      c.enqueue(data);
      c.close();
    },
  }).pipeThrough(new DecompressionStream("deflate-raw") as unknown as ReadableWritablePair<Uint8Array, Uint8Array>);
  const reader = stream.getReader();
  const parts: Uint8Array[] = [];
  let total = 0;
  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    total += value.length;
    if (total > XLSX_MAX_PART_BYTES) throw new Error("part too large");
    parts.push(value);
  }
  const out = new Uint8Array(total);
  let o = 0;
  for (const part of parts) {
    out.set(part, o);
    o += part.length;
  }
  return out;
}

async function readEntry(b: Uint8Array, e: ZipEntry): Promise<string> {
  if (u32(b, e.offset) !== 0x04034b50) throw new Error("bad zip entry");
  if (e.size > XLSX_MAX_PART_BYTES) throw new Error("part too large");
  const start = e.offset + 30 + u16(b, e.offset + 26) + u16(b, e.offset + 28);
  const raw = b.subarray(start, start + e.compSize);
  const bytes = e.method === 0 ? raw : e.method === 8 ? await inflateRaw(raw) : null;
  if (!bytes) throw new Error("unsupported compression");
  return new TextDecoder().decode(bytes);
}

// ── XML ──

const ENTITIES: Record<string, string> = { lt: "<", gt: ">", amp: "&", quot: '"', apos: "'" };

function decodeXml(s: string): string {
  return s.replace(/&(#x[0-9a-f]+|#\d+|lt|gt|amp|quot|apos);/gi, (m, e: string) => {
    if (e[0] === "#") {
      const code = e[1] === "x" || e[1] === "X" ? parseInt(e.slice(2), 16) : parseInt(e.slice(1), 10);
      return Number.isFinite(code) ? String.fromCodePoint(code) : m;
    }
    return ENTITIES[e.toLowerCase()] ?? m;
  });
}

function attrs(s: string): Record<string, string> {
  const out: Record<string, string> = {};
  for (const m of s.matchAll(/([\w:.-]+)\s*=\s*(?:"([^"]*)"|'([^']*)')/g)) out[m[1]] = decodeXml(m[2] ?? m[3] ?? "");
  return out;
}

/** Every `<tag …>` (any namespace prefix) as its attributes. */
function tags(xml: string, tag: string): Record<string, string>[] {
  return [...xml.matchAll(new RegExp(`<(?:\\w+:)?${tag}\\b([^>]*?)\\/?>`, "g"))].map((m) => attrs(m[1]));
}

/** The text runs inside a string item, phonetic hints left out. */
function textOf(xml: string): string {
  const body = xml.replace(/<(?:\w+:)?rPh\b[\s\S]*?<\/(?:\w+:)?rPh>/g, "");
  let s = "";
  for (const m of body.matchAll(/<(?:\w+:)?t\b[^>]*>([\s\S]*?)<\/(?:\w+:)?t>/g)) s += m[1];
  return decodeXml(s);
}

function joinPath(dir: string, target: string): string {
  if (target.startsWith("/")) return target.slice(1);
  const parts = (dir ? dir.split("/") : []).concat(target.split("/"));
  const out: string[] = [];
  for (const p of parts) {
    if (p === "..") out.pop();
    else if (p && p !== ".") out.push(p);
  }
  return out.join("/");
}

function relsPathFor(part: string): string {
  const i = part.lastIndexOf("/");
  return `${part.slice(0, i + 1)}_rels/${part.slice(i + 1)}.rels`;
}

/** Column index from a cell reference ("B12" → 1), or null without one. */
function columnOf(ref: string | undefined): number | null {
  const m = /^([A-Z]+)\d*$/i.exec(ref ?? "");
  if (!m) return null;
  let n = 0;
  for (const ch of m[1].toUpperCase()) n = n * 26 + (ch.charCodeAt(0) - 64);
  return n - 1;
}

function parseSheet(xml: string, shared: readonly string[]): Cell[][] {
  const rows: Cell[][] = [];
  for (const rm of xml.matchAll(/<(?:\w+:)?row\b[^>]*?(?:\/>|>([\s\S]*?)<\/(?:\w+:)?row>)/g)) {
    const row: Cell[] = [];
    let next = 0;
    for (const cm of (rm[1] ?? "").matchAll(/<(?:\w+:)?c\b([^>]*?)(?:\/>|>([\s\S]*?)<\/(?:\w+:)?c>)/g)) {
      const a = attrs(cm[1]);
      const col = columnOf(a.r) ?? next;
      next = col + 1;
      const inner = cm[2] ?? "";
      const v = /<(?:\w+:)?v\b[^>]*>([\s\S]*?)<\/(?:\w+:)?v>/.exec(inner)?.[1];
      let cell: Cell = null;
      switch (a.t) {
        case "s":
          cell = v != null ? (shared[Number(v)] ?? null) : null;
          break;
        case "inlineStr":
          cell = textOf(inner);
          break;
        case "str":
        case "d":
          cell = v != null ? decodeXml(v) : null;
          break;
        case "b":
          cell = v != null ? v.trim() === "1" : null;
          break;
        case "e":
          cell = null;
          break;
        default:
          cell = v != null && v.trim() !== "" && Number.isFinite(Number(v)) ? Number(v) : null;
      }
      while (row.length < col) row.push(null);
      row[col] = cell;
    }
    if (row.some((c) => c !== null && c !== "")) rows.push(row);
  }
  return rows;
}

// ── Workbook ──

const key = (name: string) => name.trim().toLowerCase();

/**
 * Open a workbook. Throws on anything that is not a readable .xlsx; the
 * caller says so in one sentence. Sheets are parsed only when asked for.
 */
export async function readXlsx(bytes: Uint8Array): Promise<XlsxWorkbook> {
  if (bytes.length > XLSX_MAX_BYTES) throw new Error("file too large");
  if (!looksLikeZip(bytes)) throw new Error("not a zip");
  const entries = zipEntries(bytes);
  const read = async (path: string): Promise<string | null> => {
    const e = entries.get(path);
    return e ? readEntry(bytes, e) : null;
  };
  const rootRels = (await read("_rels/.rels")) ?? "";
  const docRel = tags(rootRels, "Relationship").find((r) => /\/officeDocument$/.test(r.Type ?? ""));
  const workbookPath = docRel?.Target ? joinPath("", docRel.Target) : "xl/workbook.xml";
  const workbookXml = await read(workbookPath);
  if (workbookXml == null) throw new Error("no workbook");
  const dir = workbookPath.slice(0, workbookPath.lastIndexOf("/") + 1);
  const rels = tags((await read(relsPathFor(workbookPath))) ?? "", "Relationship");
  const target = (r: Record<string, string> | undefined) => (r?.Target ? joinPath(dir, r.Target) : null);
  const pr = tags(workbookXml, "workbookPr")[0] ?? {};
  const date1904 = pr.date1904 === "1" || pr.date1904 === "true";

  const sheets = tags(workbookXml, "sheet").map((s) => {
    const relId = Object.entries(s).find(([k]) => /(^|:)id$/.test(k) && k !== "sheetId")?.[1];
    return { name: s.name ?? "", path: target(rels.find((r) => r.Id === relId)) };
  });

  let shared: string[] | null = null;
  const sharedStrings = async () => {
    if (shared) return shared;
    const path = target(rels.find((r) => /\/sharedStrings$/.test(r.Type ?? ""))) ?? `${dir}sharedStrings.xml`;
    const xml = (await read(path)) ?? "";
    shared = [...xml.matchAll(/<(?:\w+:)?si\b[^>]*?(?:\/>|>([\s\S]*?)<\/(?:\w+:)?si>)/g)].map((m) => textOf(m[1] ?? ""));
    return shared;
  };

  return {
    sheetNames: sheets.map((s) => s.name),
    date1904,
    async sheet(name) {
      const s = sheets.find((x) => key(x.name) === key(name));
      if (!s?.path) return null;
      const xml = await read(s.path);
      return xml == null ? null : parseSheet(xml, await sharedStrings());
    },
  };
}

// ── Dates ──

const DAY_MS = 86400000;
/** Day 0 of each date system, as UTC ms. Excel's 1900 system counts from 30 Dec 1899 (it treats 1900 as a leap year). */
const EPOCH_1900 = Date.UTC(1899, 11, 30);
const EPOCH_1904 = Date.UTC(1904, 0, 1);

/** The calendar day of a spreadsheet date number (time of day ignored), or null when it is not one. */
export function serialToDate(serial: number, date1904 = false): LocalDate | null {
  if (!Number.isFinite(serial) || serial < 1 || serial > 2958465) return null;
  // Half a second of slack: a date written as a float can land a hair under midnight.
  const days = Math.floor(serial + 0.5 / 86400);
  return new Date((date1904 ? EPOCH_1904 : EPOCH_1900) + days * DAY_MS).toISOString().slice(0, 10);
}
