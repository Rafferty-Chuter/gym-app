/**
 * Build `lib/food/data/cofid.json` from McCance and Widdowson's Composition
 * of Foods Integrated Dataset (CoFID), published by Public Health England
 * under the Open Government Licence v3.0.
 *
 *   npx tsx scripts/build-cofid.ts /path/to/McCance_Widdowsons_Composition_of_Foods_Integrated_Dataset_2021..xlsx
 *
 * Reads the "1.3 Proximates" sheet: one row per food with energy, protein,
 * fat and carbohydrate per 100 g as eaten, then fibre, total sugars,
 * saturated fat and alcohol, and sodium from "1.4 Inorganics" by food code
 * (IN6). "Tr" (trace) becomes 0, "N" (not determined) drops the value; a
 * food without energy and macros is skipped.
 * Output is a compact array so the whole list ships with the app and
 * searches offline.
 */

import { readFileSync, writeFileSync, mkdirSync } from "node:fs";
import { dirname, resolve } from "node:path";
import * as XLSX from "xlsx";

const SOURCE = process.argv[2];
if (!SOURCE) {
  console.error("Usage: npx tsx scripts/build-cofid.ts <CoFID xlsx>");
  process.exit(1);
}
const OUT = resolve(__dirname, "../lib/food/data/cofid.json");

/** [code, name, group, kcal, proteinG, fatG, carbsG, fibreG, sodiumMg, sugarG, satFatG, alcoholG], the last five null when not determined. */
export type CofidRow = [string, string, string, number, number, number, number, number | null, number | null, number | null, number | null, number | null];

function num(v: unknown): number | null {
  if (typeof v === "number") return Number.isFinite(v) ? v : null;
  if (typeof v !== "string") return null;
  const s = v.trim();
  if (s === "Tr") return 0;
  if (s === "" || s === "N") return null;
  const n = Number(s);
  return Number.isFinite(n) ? n : null;
}

const wb = XLSX.read(readFileSync(SOURCE), { type: "buffer" });
const sheet = wb.Sheets["1.3 Proximates"];
if (!sheet) throw new Error("Sheet '1.3 Proximates' not found");
const rows = XLSX.utils.sheet_to_json<unknown[]>(sheet, { header: 1, raw: false });
const header = (rows[0] ?? []).map((h) => String(h ?? "").trim());
const col = (re: RegExp): number => {
  const i = header.findIndex((h) => re.test(h));
  if (i < 0) throw new Error(`Column ${re} not found in ${header.join(" | ")}`);
  return i;
};
const C = {
  code: col(/^Food Code$/i),
  name: col(/^Food Name$/i),
  group: col(/^Group$/i),
  kcal: col(/^Energy \(kcal\)/i),
  protein: col(/^Protein \(g\)/i),
  fat: col(/^Fat \(g\)/i),
  carbs: col(/^Carbohydrate \(g\)/i),
  fibre: header.findIndex((h) => /AOAC fibre/i.test(h)),
  sugars: header.findIndex((h) => /^Total sugars \(g\)/i.test(h)),
  satFat: header.findIndex((h) => /^Satd FA \/100g fd/i.test(h)),
  alcohol: header.findIndex((h) => /^Alcohol \(g\)/i.test(h)),
};

// Sodium, from the inorganics sheet, by food code.
const inorganic = wb.Sheets["1.4 Inorganics"];
const sodiumByCode = new Map<string, number | null>();
if (inorganic) {
  const irows = XLSX.utils.sheet_to_json<unknown[]>(inorganic, { header: 1, raw: false });
  const ih = (irows[0] ?? []).map((h) => String(h ?? "").trim());
  const iCode = Math.max(0, ih.findIndex((h) => /food code/i.test(h)));
  const iNa = ih.findIndex((h) => /^Sodium \(mg\)/i.test(h));
  if (iNa >= 0) for (const r of irows.slice(3)) sodiumByCode.set(String(r[iCode] ?? "").trim(), num(r[iNa]));
}

const out: CofidRow[] = [];
let skipped = 0;
for (const r of rows.slice(3)) {
  const code = String(r[C.code] ?? "").trim();
  const name = String(r[C.name] ?? "").trim();
  if (!/^\d{2}-\d{3}$/.test(code) || !name) continue;
  const kcal = num(r[C.kcal]);
  const protein = num(r[C.protein]);
  const fat = num(r[C.fat]);
  const carbs = num(r[C.carbs]);
  if (kcal == null || protein == null || fat == null || carbs == null) {
    skipped++;
    continue;
  }
  const at = (i: number) => (i >= 0 ? num(r[i]) : null);
  const r1 = (n: number | null) => (n == null ? null : Math.round(n * 10) / 10);
  const sodium = sodiumByCode.get(code) ?? null;
  out.push([code, name, String(r[C.group] ?? "").trim(), Math.round(kcal), r1(protein) as number, r1(fat) as number, r1(carbs) as number, r1(at(C.fibre)), sodium == null ? null : Math.round(sodium), r1(at(C.sugars)), r1(at(C.satFat)), r1(at(C.alcohol))]);
}

mkdirSync(dirname(OUT), { recursive: true });
writeFileSync(
  OUT,
  JSON.stringify({
    meta: {
      source: "McCance and Widdowson's The Composition of Foods Integrated Dataset 2021, Public Health England",
      licence: "Open Government Licence v3.0",
      url: "https://www.gov.uk/government/publications/composition-of-foods-integrated-dataset-cofid",
      columns: ["code", "name", "group", "kcalPer100g", "proteinG", "fatG", "carbsG", "fibreG", "sodiumMg", "sugarG", "satFatG", "alcoholG"],
      foods: out.length,
    },
    foods: out,
  })
);
console.log(`Wrote ${out.length} foods to ${OUT} (${skipped} rows without complete macros skipped)`);
