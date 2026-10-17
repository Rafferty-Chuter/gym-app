import { describe, expect, it } from "vitest";
import { landmarks, bandLabel, bandsFor, emphasisedCount, readVolume, targetBand } from "@/lib/training/volumeTargets";

describe("weekly set targets", () => {
  it("moves with the priority and the landmarks", () => {
    const chest = landmarks("chest");
    expect(targetBand("chest", "maintain")).toEqual({ low: 6, high: chest.mev });
    expect(targetBand("chest", "grow")).toEqual({ low: chest.mev, high: chest.mev + 4 });
    expect(targetBand("chest", "emphasise")).toEqual({ low: chest.mev + 2, high: chest.mrv });
    // A cut lowers the ceiling; grow on traps (6 to 12) still fits under it.
    expect(targetBand("chest", "emphasise", "cut").high).toBe(Math.round(chest.mrv * 0.8));
    expect(targetBand("traps", "grow", "cut")).toEqual({ low: 6, high: 10 });
  });

  it("defaults every muscle to grow and counts emphasised ones", () => {
    const bands = bandsFor(null);
    expect(bands.biceps).toEqual(targetBand("biceps", "grow"));
    expect(emphasisedCount({ chest: "emphasise", back: "grow", shoulders: "emphasise" })).toBe(2);
    expect(bandsFor({ chest: "emphasise" }).chest).toEqual(targetBand("chest", "emphasise"));
  });

  it("reads a week on evidence only", () => {
    const band = { low: 10, high: 14 };
    expect(readVolume(16, band, { tracked: true, complete: false })).toBe("over");
    expect(readVolume(12, band, { tracked: true, complete: false })).toBe("in_range");
    expect(readVolume(7, band, { tracked: true, complete: false })).toBe("pending");
    expect(readVolume(7, band, { tracked: true, complete: true })).toBe("under");
    expect(readVolume(0, band, { tracked: false, complete: true })).toBe("untracked");
    expect(bandLabel(band)).toBe("10 to 14");
    expect(bandLabel({ low: 6, high: 6 })).toBe("6");
  });
});
