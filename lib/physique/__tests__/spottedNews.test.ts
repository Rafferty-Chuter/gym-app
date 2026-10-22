import { describe, expect, it } from "vitest";
import { addDays } from "@/lib/dates";
import { bannedPhrasesIn } from "@/lib/physique/copy";
import { isOurNotification, newsId, planLocalReminders, reminderId } from "@/lib/physique/localReminders";
import type { GapSummary } from "@/lib/physique/reminder";
import type { SpottedItem } from "@/lib/physique/spotted";
import { EMPTY_NEWS, NEWS_FORGET_DAYS, NEWS_GAP_DAYS, leadFact, newsFact, newsLine, sentBefore, seenKeys, withShown } from "@/lib/physique/spottedNews";

// Thursday 22 Oct 2026; Monday is the 26th.
const TODAY = "2026-10-22";
const summary = (weight: string[] = []): GapSummary => ({ logged: { weight, food: [], sleep: [] }, first: { weight: weight[0] ?? null, food: null, sleep: null } });
const at = (h: number, m = 0) => h * 60 + m;

const item = (kind: SpottedItem["kind"], key: string, title: string, detail: string): SpottedItem =>
  ({ kind, key, topic: key, date: TODAY, size: 2, score: 2, title, detail, working: [], days: [], daysLabel: null, from: null, charts: [] }) as unknown as SpottedItem;

const stall = item("stuck", "stuck:squat", "Squat flat for 7 sessions", "Est. 1RM 140 kg since 1 Sep · chest sets down");
const drinking = item("alcohol", "alcohol", "Recovery lower after drinking", "Resting HR 7 bpm higher, HRV 12 ms lower · 29 vs 70 nights · 2 drinking evenings in the last 7 days");
const jump = item("jump", "jump", "Up 1.1 kg on yesterday", "Yesterday: 220 g more carbs than usual");

describe("what is new, and what was seen (IN11)", () => {
  it("a fact counts as seen once shown, for six weeks of not being shown", () => {
    const s = withShown(EMPTY_NEWS, ["stuck:squat"], TODAY);
    expect(seenKeys(s, TODAY).has("stuck:squat")).toBe(true);
    expect(seenKeys(s, addDays(TODAY, NEWS_FORGET_DAYS - 1)).has("stuck:squat")).toBe(true);
    expect(seenKeys(s, addDays(TODAY, NEWS_FORGET_DAYS)).has("stuck:squat")).toBe(false);
    // Showing it again keeps it seen.
    const again = withShown(s, ["stuck:squat"], addDays(TODAY, 30));
    expect(seenKeys(again, addDays(TODAY, NEWS_FORGET_DAYS)).has("stuck:squat")).toBe(true);
  });

  it("Monday's report leads with the biggest fact not yet seen, else the biggest", () => {
    expect(leadFact([jump, stall], new Set(["jump"]))).toBe(stall);
    expect(leadFact([jump, stall], new Set(["jump", "stuck:squat"]))).toBe(jump);
    expect(leadFact([], new Set())).toBeNull();
  });

  it("the weekly notification is for a stall or a link not yet seen; never a scale jump", () => {
    const link = item("link", "link:sleep", "Weaker after short nights", "Squat est. 1RM about 6 kg lower · 2 sessions after a short night in the last 7 days");
    expect(newsFact([jump, link, stall], new Set())).toBe(link);
    expect(newsFact([jump, link, stall], new Set(["link:sleep"]))).toBe(stall);
    expect(newsFact([jump], new Set())).toBeNull();
  });

  it("drinking stays off the lock screen: never the news, never Monday's lead", () => {
    const drinksLink = item("link", "link:alcohol", "Weaker after drinking", "Squat est. 1RM about 7 kg lower · 1 session after drinking in the last 7 days");
    expect(newsFact([drinking, drinksLink, stall], new Set())).toBe(stall);
    expect(leadFact([drinking, drinksLink], new Set())).toBeNull();
    expect(leadFact([drinking, jump], new Set())).toBe(jump);
  });

  it("says the finding and its first number, in plain words", () => {
    expect(newsLine(drinking)).toBe("Recovery lower after drinking · Resting HR 7 bpm higher, HRV 12 ms lower");
    expect(newsLine(stall)).toBe("Squat flat for 7 sessions · Est. 1RM 140 kg since 1 Sep");
    expect(bannedPhrasesIn([newsLine(drinking), newsLine(stall)].join(" "))).toEqual([]);
  });

  it("a planned notification counts as sent once its time has passed, not before", () => {
    const s = { ...EMPTY_NEWS, sent: ["2026-10-20", "2026-10-22", "2026-10-23"] };
    expect(sentBefore(s, TODAY, at(8), "09:00")).toEqual(["2026-10-20"]);
    expect(sentBefore(s, TODAY, at(9), "09:00")).toEqual(["2026-10-20", "2026-10-22"]);
  });
});

describe("the plan carries the news (IN11)", () => {
  const news = (sent: string[] = []) => ({ lead: "Squat flat for 7 sessions", fact: { key: "stuck:squat", line: newsLine(stall) }, sent });

  it("Monday's report leads with the fact", () => {
    const plan = planLocalReminders(summary(), TODAY, at(7), "09:00", 7, news());
    const monday = plan.find((p) => p.day === "2026-10-26" && p.kind === "reminder");
    expect(monday).toMatchObject({ title: "Weekly report · 19 to 25 Oct", body: "Squat flat for 7 sessions", url: "/report?week=2026-10-19" });
    // Without a fact, the report says what is inside, as before.
    const plain = planLocalReminders(summary(), TODAY, at(7), "09:00");
    expect(plain.find((p) => p.day === "2026-10-26")?.body).toBe("Your week in numbers, and next week's targets.");
  });

  it("one news notification in the week, at the reminder time, never on Monday, opening Progress", () => {
    const plan = planLocalReminders(summary(), TODAY, at(7), "09:00", 7, news());
    const n = plan.filter((p) => p.kind === "news");
    expect(n).toHaveLength(1);
    expect(n[0]).toMatchObject({ day: TODAY, hhmm: "09:00", title: "Spotted", body: newsLine(stall), url: "/body", id: newsId(TODAY), factKey: "stuck:squat" });
    // Today's time has passed: tomorrow. Tomorrow is Monday: the day after.
    expect(planLocalReminders(summary(), TODAY, at(10), "09:00", 7, news()).find((p) => p.kind === "news")?.day).toBe("2026-10-23");
    expect(planLocalReminders(summary(), "2026-10-25", at(10), "09:00", 7, news()).find((p) => p.kind === "news")?.day).toBe("2026-10-27");
  });

  it("waits a week after the last one sent", () => {
    const plan = planLocalReminders(summary(), TODAY, at(7), "09:00", 7, news(["2026-10-18"]));
    expect(plan.find((p) => p.kind === "news")?.day).toBe(addDays("2026-10-18", NEWS_GAP_DAYS));
    expect(planLocalReminders(summary(), TODAY, at(7), "09:00", 3, news(["2026-10-20"])).some((p) => p.kind === "news")).toBe(false);
  });

  it("news ids never meet a day's reminder id, and both are ours to cancel", () => {
    expect(newsId(TODAY)).not.toBe(reminderId(TODAY));
    expect(isOurNotification(newsId(TODAY))).toBe(true);
    expect(isOurNotification(reminderId(TODAY))).toBe(true);
    expect(isOurNotification(42)).toBe(false);
  });
});
