import { beforeEach, describe, expect, it } from "vitest";
import {
  AI_CONSENT_VERSION,
  CONSENT_KEY,
  consentRows,
  giveConsent,
  hasAiConsent,
  hasSyncConsent,
  isConsentActive,
  parseConsents,
  readConsents,
  SYNC_CONSENT_VERSION,
  withdrawConsent,
} from "@/lib/consent";

/** Consent records on the device and the rows that carry them to the account (TR1). */

beforeEach(() => {
  window.localStorage.clear();
});

describe("consent (TR1)", () => {
  it("starts with neither choice made: no sync, no AI", () => {
    expect(readConsents()).toEqual({ sync: null, ai: null });
    expect(hasSyncConsent()).toBe(false);
    expect(hasAiConsent()).toBe(false);
  });

  it("keeps the two choices apart: agreeing to sync says nothing about AI", () => {
    expect(giveConsent("sync", "2026-10-21T09:00:00.000Z")).toBe(true);
    expect(hasSyncConsent()).toBe(true);
    expect(hasAiConsent()).toBe(false);
    const stored = JSON.parse(window.localStorage.getItem(CONSENT_KEY) ?? "{}");
    expect(stored.sync).toMatchObject({ version: SYNC_CONSENT_VERSION, at: "2026-10-21T09:00:00.000Z" });
    expect(typeof stored.sync.id).toBe("string");
    expect(stored.ai).toBeNull();
  });

  it("stops counting a choice once withdrawn, and keeps when it was withdrawn", () => {
    giveConsent("ai", "2026-10-21T09:00:00.000Z");
    expect(hasAiConsent()).toBe(true);
    withdrawConsent("ai", "2026-10-22T10:00:00.000Z");
    expect(hasAiConsent()).toBe(false);
    expect(readConsents().ai).toMatchObject({ at: "2026-10-21T09:00:00.000Z", withdrawnAt: "2026-10-22T10:00:00.000Z" });
    // A fresh tick is a new choice with its own id.
    const before = readConsents().ai?.id;
    giveConsent("ai", "2026-10-23T08:00:00.000Z");
    expect(hasAiConsent()).toBe(true);
    expect(readConsents().ai?.id).not.toBe(before);
  });

  it("asks again when the wording's version moves past the stored tick", () => {
    expect(isConsentActive({ id: "a", version: SYNC_CONSENT_VERSION, at: "2026-10-21T09:00:00Z" }, SYNC_CONSENT_VERSION)).toBe(true);
    expect(isConsentActive({ id: "a", version: SYNC_CONSENT_VERSION, at: "2026-10-21T09:00:00Z" }, SYNC_CONSENT_VERSION + 1)).toBe(false);
    expect(isConsentActive(null, AI_CONSENT_VERSION)).toBe(false);
  });

  it("treats anything malformed as no choice made", () => {
    expect(parseConsents("yes")).toEqual({ sync: null, ai: null });
    expect(parseConsents({ sync: true, ai: { id: "x", version: 1 } })).toEqual({ sync: null, ai: null });
    window.localStorage.setItem(CONSENT_KEY, "not json");
    expect(hasSyncConsent()).toBe(false);
  });

  it("records each choice as one account row, a withdrawal rewriting it later in time", () => {
    const c = {
      sync: { id: "s1", version: 1, at: "2026-10-21T09:00:00.000Z" },
      ai: { id: "a1", version: 1, at: "2026-10-21T09:05:00.000Z", withdrawnAt: "2026-10-22T10:00:00.000Z" },
    };
    expect(consentRows(c)).toEqual([
      { k: CONSENT_KEY, id: "sync:s1", data: { kind: "sync", id: "s1", version: 1, at: "2026-10-21T09:00:00.000Z" }, deleted: false, updated_at: "2026-10-21T09:00:00.000Z" },
      { k: CONSENT_KEY, id: "ai:a1", data: { kind: "ai", id: "a1", version: 1, at: "2026-10-21T09:05:00.000Z", withdrawnAt: "2026-10-22T10:00:00.000Z" }, deleted: false, updated_at: "2026-10-22T10:00:00.000Z" },
    ]);
    expect(consentRows({ sync: null, ai: null })).toEqual([]);
  });
});
