import { describe, expect, it } from "vitest";
import { feedbackUrlFrom } from "@/lib/feedback";

describe("feedback form address (TR4)", () => {
  it("hides the link when the variable is unset or blank", () => {
    expect(feedbackUrlFrom(undefined)).toBeNull();
    expect(feedbackUrlFrom("")).toBeNull();
    expect(feedbackUrlFrom("   ")).toBeNull();
  });

  it("hides the link when the value isn't a web address", () => {
    expect(feedbackUrlFrom("tally.so/r/abc123")).toBeNull();
    expect(feedbackUrlFrom("javascript:alert(1)")).toBeNull();
    expect(feedbackUrlFrom("mailto:someone@example.com")).toBeNull();
  });

  it("shows the form when the variable holds one", () => {
    expect(feedbackUrlFrom("https://tally.so/r/abc123")).toBe("https://tally.so/r/abc123");
    expect(feedbackUrlFrom("  https://tally.so/r/abc123\n")).toBe("https://tally.so/r/abc123");
  });
});
