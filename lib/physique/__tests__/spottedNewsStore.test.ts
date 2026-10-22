// @vitest-environment happy-dom
import { beforeEach, describe, expect, it } from "vitest";
import { markSpottedShown, readNews, saveNewsSent, spottedNewsStore } from "@/lib/physique/io/spottedNews";

describe("the device's seen and sent facts (IN11)", () => {
  beforeEach(async () => {
    await spottedNewsStore.clear();
  });

  it("two writes at once keep both", async () => {
    await Promise.all([markSpottedShown(["stuck:squat"], "2026-10-22"), saveNewsSent(["2026-10-20"])]);
    expect(readNews()).toEqual({ shown: { "stuck:squat": "2026-10-22" }, sent: ["2026-10-20"] });
  });

  it("reads as empty when nothing or something odd is stored", async () => {
    expect(readNews()).toEqual({ shown: {}, sent: [] });
    await spottedNewsStore.set({ shown: null, sent: "x" } as never);
    expect(readNews()).toEqual({ shown: {}, sent: [] });
  });
});
