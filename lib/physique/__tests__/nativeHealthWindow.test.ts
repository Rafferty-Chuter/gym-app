// @vitest-environment happy-dom
import { describe, expect, it } from "vitest";
import { FIRST_SYNC_DAYS, SYNC_DAYS, syncWindowDays } from "@/lib/physique/io/nativeHealth";

describe("how far back the iPhone app reads Apple Health (IN1)", () => {
  it("reads a year the first time, then two weeks", () => {
    expect(FIRST_SYNC_DAYS).toBe(365);
    expect(syncWindowDays({})).toBe(365);
    expect(syncWindowDays({ lastSyncAt: "2026-10-22T08:00:00.000Z", backfillDays: 365 })).toBe(SYNC_DAYS);
  });

  it("reads the year once for a link made before IN1, which read 60 days", () => {
    expect(syncWindowDays({ lastSyncAt: "2026-10-20T08:00:00.000Z" })).toBe(365);
    expect(syncWindowDays({ lastSyncAt: "2026-10-20T08:00:00.000Z", backfillDays: 60 })).toBe(365);
  });
});
