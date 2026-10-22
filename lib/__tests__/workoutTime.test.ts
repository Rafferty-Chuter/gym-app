import { describe, expect, it } from "vitest";
import { workoutStartedAt } from "@/lib/workoutTime";

describe("workoutStartedAt (IN1)", () => {
  it("uses the saved start when there is one", () => {
    expect(workoutStartedAt({ startedAt: "2026-10-21T17:02:00.000Z", completedAt: "2026-10-21T18:10:00.000Z", durationSec: 4080 })).toBe("2026-10-21T17:02:00.000Z");
  });

  it("works the start back from the end and the duration for sessions saved before IN1", () => {
    expect(workoutStartedAt({ completedAt: "2026-10-21T18:10:00.000Z", durationSec: 3600 })).toBe("2026-10-21T17:10:00.000Z");
  });

  it("falls back to the stamp itself with no usable duration", () => {
    expect(workoutStartedAt({ completedAt: "2026-10-21T18:10:00.000Z" })).toBe("2026-10-21T18:10:00.000Z");
    expect(workoutStartedAt({ completedAt: "2026-10-21T18:10:00.000Z", durationSec: 0 })).toBe("2026-10-21T18:10:00.000Z");
    // A stale session finished from Home a day later carried the whole gap as its duration.
    expect(workoutStartedAt({ completedAt: "2026-10-21T18:10:00.000Z", durationSec: 30 * 3600 })).toBe("2026-10-21T18:10:00.000Z");
  });

  it("ignores a malformed start and returns null for a malformed stamp", () => {
    expect(workoutStartedAt({ startedAt: "nope", completedAt: "2026-10-21T18:10:00.000Z", durationSec: 600 })).toBe("2026-10-21T18:00:00.000Z");
    expect(workoutStartedAt({ completedAt: "nope" })).toBeNull();
  });
});
