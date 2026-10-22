// @vitest-environment happy-dom
import { beforeEach, describe, expect, it } from "vitest";
import { weighInsByDate } from "@/lib/physique/weight";
import { mergeSamples } from "@/lib/physique/io/healthLink";
import { saveWeighIn } from "@/lib/physique/io/bodyData";
import { weighInsRepo } from "@/lib/physique/io/repos";
import { addDays, clientNow } from "@/lib/dates";
import type { WeighIn } from "@/lib/physique/types";

const rec = (id: string, kg: number, loggedAt: string, time?: string): WeighIn => ({ id, date: "2026-10-15", loggedAt, source: id.startsWith("hk") ? "healthkit" : "manual", schemaVersion: 1, kg, ...(time ? { time } : {}) });

describe("the weigh-in's reading time (IN1)", () => {
  beforeEach(async () => {
    await weighInsRepo.clear();
  });

  it("the day's weight is the earliest reading by its time, whatever order the records were saved in", () => {
    const scale = rec("hk-w-2026-10-15", 82.4, "2026-10-15T09:30:00.000Z", "07:02");
    const typed = rec("m1", 83.1, "2026-10-15T07:45:00.000Z", "08:45");
    expect(weighInsByDate([typed, scale]).get("2026-10-15")).toBe(82.4);
  });

  it("a reading with a known time comes before one without; two without fall back to when each was saved", () => {
    const old = rec("hk-w-2026-10-15", 82.4, "2026-10-15T06:30:00.000Z");
    const typed = rec("m1", 83.1, "2026-10-15T07:45:00.000Z", "08:45");
    expect(weighInsByDate([old, typed]).get("2026-10-15")).toBe(83.1);
    expect(weighInsByDate([rec("m1", 83.1, "2026-10-15T07:45:00.000Z"), old]).get("2026-10-15")).toBe(82.4);
    // Three on one day order the same whichever way they come in.
    const three = [rec("a", 1, "2026-10-15T10:00:00.000Z", "07:00"), rec("b", 2, "2026-10-15T08:00:00.000Z"), rec("c", 3, "2026-10-15T09:00:00.000Z", "06:00")];
    expect(weighInsByDate(three).get("2026-10-15")).toBe(3);
    expect(weighInsByDate([...three].reverse()).get("2026-10-15")).toBe(3);
  });

  it("Apple Health weigh-ins keep the reading's clock; when stored is when it arrived", async () => {
    await mergeSamples([{ metric: "weight", day: "2026-10-15", value: { value: 82.4, at: "2026-10-15T07:02:00" }, source: "Withings", received_at: "2026-10-15T08:00:00.000Z" }]);
    expect(weighInsRepo.snapshot()[0]).toMatchObject({ kg: 82.4, time: "07:02", loggedAt: "2026-10-15T08:00:00.000Z" });
  });

  it("a day total at midnight (an aggregated export) has no reading time", async () => {
    await mergeSamples([{ metric: "weight", day: "2026-10-15", value: { value: 82.4, at: "2026-10-15T00:00:00" }, source: null, received_at: "2026-10-15T08:00:00.000Z" }]);
    expect(weighInsRepo.snapshot()[0].time).toBeUndefined();
  });

  it("a weigh-in typed today keeps the clock; one for an earlier day has none", async () => {
    const { today } = clientNow();
    const nowIso = new Date().toISOString();
    await saveWeighIn(today, 80, nowIso);
    await saveWeighIn(addDays(today, -3), 81, nowIso);
    const byDate = new Map(weighInsRepo.snapshot().map((w) => [w.date, w]));
    expect(byDate.get(today)?.time).toMatch(/^\d{2}:\d{2}$/);
    // A correction later keeps the first time.
    await weighInsRepo.upsert({ ...byDate.get(today)!, time: "06:50" });
    await saveWeighIn(today, 79.8, new Date().toISOString());
    expect(weighInsRepo.snapshot().find((w) => w.date === today)).toMatchObject({ kg: 79.8, time: "06:50" });
    expect(byDate.get(addDays(today, -3))?.time).toBeUndefined();
  });
});
