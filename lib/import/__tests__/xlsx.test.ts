import { describe, expect, it } from "vitest";
import { looksLikeZip, readXlsx, serialToDate } from "@/lib/import/xlsx";
import { macroFactorSampleXlsx, MF_FIRST, serialOf } from "./macroFactorSample";

/** A zip with every part stored as is (the reader doesn't check CRCs), for hand-written XML. */
function storedZip(files: Record<string, string>): Uint8Array {
  const enc = new TextEncoder();
  const locals: number[] = [];
  const central: number[] = [];
  const u16 = (n: number) => [n & 255, (n >> 8) & 255];
  const u32 = (n: number) => [n & 255, (n >> 8) & 255, (n >> 16) & 255, (n >>> 24) & 255];
  let count = 0;
  for (const [name, text] of Object.entries(files)) {
    const nameBytes = [...enc.encode(name)];
    const data = [...enc.encode(text)];
    const offset = locals.length;
    locals.push(...u32(0x04034b50), ...u16(20), ...u16(0), ...u16(0), ...u16(0), ...u16(0), ...u32(0), ...u32(data.length), ...u32(data.length), ...u16(nameBytes.length), ...u16(0), ...nameBytes, ...data);
    central.push(...u32(0x02014b50), ...u16(20), ...u16(20), ...u16(0), ...u16(0), ...u16(0), ...u16(0), ...u32(0), ...u32(data.length), ...u32(data.length), ...u16(nameBytes.length), ...u16(0), ...u16(0), ...u16(0), ...u16(0), ...u32(0), ...u32(offset), ...nameBytes);
    count++;
  }
  const end = [...u32(0x06054b50), ...u16(0), ...u16(0), ...u16(count), ...u16(count), ...u32(central.length), ...u32(locals.length), ...u16(0)];
  return new Uint8Array([...locals, ...central, ...end]);
}

describe("xlsx reader (TR7)", () => {
  it.each([
    { sharedStrings: false, compress: false },
    { sharedStrings: true, compress: true },
  ])("reads sheet names, text, numbers and date numbers (%o)", async (opts) => {
    const bytes = macroFactorSampleXlsx(opts);
    expect(looksLikeZip(bytes)).toBe(true);
    const wb = await readXlsx(bytes);
    expect(wb.sheetNames).toEqual(["Calories & Macros", "Micronutrients", "Expenditure", "Scale Weight", "Weight Trend", "Steps"]);
    expect(wb.date1904).toBe(false);
    const macros = (await wb.sheet("  calories & MACROS "))!;
    expect(macros[0]).toEqual(["Date", "Calories (kcal)", "Protein (g)", "Fat (g)", "Carbs (g)"]);
    expect(macros[1][0]).toBe(serialOf(MF_FIRST));
    expect(serialToDate(macros[1][0] as number)).toBe(MF_FIRST);
    expect(typeof macros[1][1]).toBe("number");
    expect(await wb.sheet("Nope")).toBeNull();
  });

  it("reads namespace prefixes, inline and formula strings, booleans, gaps, cells without references and entities", async () => {
    const bytes = storedZip({
      "_rels/.rels": `<?xml version="1.0"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="xl/workbook.xml"/></Relationships>`,
      "xl/workbook.xml": `<x:workbook xmlns:x="http://schemas.openxmlformats.org/spreadsheetml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships"><x:workbookPr date1904="1"/><x:sheets><x:sheet name="Fish &amp; Chips" sheetId="7" r:id="rId9"/></x:sheets></x:workbook>`,
      "xl/_rels/workbook.xml.rels": `<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId9" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/worksheet" Target="/xl/worksheets/data.xml"/><Relationship Id="rId2" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/sharedStrings" Target="strings.xml"/></Relationships>`,
      "xl/strings.xml": `<x:sst xmlns:x="m"><x:si><x:t>Date</x:t></x:si><x:si><x:r><x:t>Cal</x:t></x:r><x:r><x:t xml:space="preserve">ories</x:t></x:r><x:rPh><x:t>ignored</x:t></x:rPh></x:si></x:sst>`,
      "xl/worksheets/data.xml": `<x:worksheet xmlns:x="m"><x:sheetData><x:row r="1"><x:c r="A1" t="s"><x:v>0</x:v></x:c><x:c r="C1" t="s"><x:v>1</x:v></x:c></x:row><x:row r="2"/><x:row r="3"><x:c><x:v>45000</x:v></x:c><x:c t="inlineStr"><x:is><x:t>a &lt; b &#233;</x:t></x:is></x:c><x:c t="str"><x:f>A1</x:f><x:v>x</x:v></x:c><x:c t="b"><x:v>1</x:v></x:c><x:c t="e"><x:v>#N/A</x:v></x:c></x:row></x:sheetData></x:worksheet>`,
    });
    const wb = await readXlsx(bytes);
    expect(wb.sheetNames).toEqual(["Fish & Chips"]);
    expect(wb.date1904).toBe(true);
    expect(await wb.sheet("fish & chips")).toEqual([
      ["Date", null, "Calories"],
      [45000, "a < b é", "x", true, null],
    ]);
  });

  it("turns date numbers into calendar days in both date systems, ignoring the time of day", () => {
    expect(serialToDate(45000)).toBe("2023-03-15");
    expect(serialToDate(45000.99)).toBe("2023-03-15");
    expect(serialToDate(44999.9999999999)).toBe("2023-03-15");
    expect(serialToDate(45000, true)).toBe("2027-03-16");
    expect(serialToDate(0)).toBeNull();
    expect(serialToDate(Number.NaN)).toBeNull();
  });

  it("refuses what isn't a workbook", async () => {
    await expect(readXlsx(new TextEncoder().encode("date,weight_kg\n2026-10-01,80"))).rejects.toThrow();
    await expect(readXlsx(storedZip({ "hello.txt": "hi" }))).rejects.toThrow();
  });
});
