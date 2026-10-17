import { beforeEach, describe, expect, it } from "vitest";
import { saveOnboardingProfile } from "@/lib/onboardingProfile";
import { goalStore, profileStore, programStore, weighInsRepo } from "@/lib/physique/io/repos";
import { createGoal, loadGoalContext, previewGoal } from "@/lib/physique/io/goalSetup";

const NOW = { today: "2026-10-17", tz: "Europe/London" };

beforeEach(async () => {
  window.localStorage.clear();
  saveOnboardingProfile({ units: "kg", sex: "M", heightCm: 180, bodyweightKg: 82, age: 30, yearsTrainingBand: "3-5", completedAt: "2026-10-01T00:00:00Z" });
  await weighInsRepo.upsert({ id: "w1", date: "2026-10-17", loggedAt: "2026-10-17T07:00:00Z", source: "manual", schemaVersion: 1, kg: 82 });
});

describe("goal setup", () => {
  it("82 → 90 kg intermediate: default +0.25 %/wk, ETA about 37 weeks, a program starts above maintenance", () => {
    const ctx = loadGoalContext(NOW, "kg");
    expect(ctx.trendKg).toBe(82);
    expect(ctx.statusFromYears).toBe("intermediate");
    expect(ctx.tdee0).not.toBeNull();
    const p = previewGoal(ctx, { targetKg: 90, ratePctPerWeek: 0.25, status: "intermediate" }, NOW);
    expect(p.type).toBe("gain");
    expect(p.bands.gain.default).toBe(0.25);
    expect(p.validation.ok).toBe(true);
    expect(p.etaWeeks).toBeCloseTo(37.3, 0);
    expect(p.update).not.toBeNull();
    expect(p.update!.entry.kcal).toBeGreaterThan(p.update!.tdee);
    expect(p.update!.entry.proteinG).toBeGreaterThan(100);
  });

  it("refuses more than 1 kg/wk, a deficit over 30% of TDEE₀ or over 1,000 kcal", () => {
    const ctx = loadGoalContext(NOW, "kg");
    const tooFast = previewGoal(ctx, { targetKg: 70, ratePctPerWeek: -1.3, status: "intermediate" }, NOW);
    expect(tooFast.validation.ok).toBe(false);
    const heavy = { ...ctx, trendKg: 150 };
    const kgCap = previewGoal(heavy, { targetKg: 120, ratePctPerWeek: -0.75, status: "intermediate" }, NOW);
    expect(kgCap.validation.ok).toBe(false);
    if (!kgCap.validation.ok) expect(kgCap.validation.reason).toBe("cut_kg_per_week");
    const lowTdee = { ...ctx, tdee0: 1800 };
    const share = previewGoal(lowTdee, { targetKg: 70, ratePctPerWeek: -0.9, status: "intermediate" }, NOW);
    expect(share.validation.ok).toBe(false);
    if (!share.validation.ok) expect(["deficit_share", "deficit_kcal"]).toContain(share.validation.reason);
  });

  it("createGoal writes the goal, the initial program and freezes the expenditure seed", async () => {
    const ctx = loadGoalContext(NOW, "kg");
    const r = await createGoal(ctx, { targetKg: 90, ratePctPerWeek: 0.25, status: "intermediate" }, NOW, {
      startToday: true,
      safety: { pregnantOrEdHistory: false },
      nowIso: "2026-10-17T08:00:00.000Z",
    });
    expect(r.ok).toBe(true);
    const goal = await goalStore.get();
    expect(goal?.type).toBe("gain");
    expect(goal?.phaseStartConfirmedAt).toBe("2026-10-17T08:00:00.000Z");
    const program = await programStore.get();
    expect(program?.history).toHaveLength(1);
    expect(program?.history[0].source).toBe("goal_start");
    expect(program?.history[0].kcal).toBeGreaterThan(2500);
    const profile = await profileStore.get();
    expect(profile?.expenditureStartDate).toBe("2026-10-17");
    expect(profile?.expenditureSeed?.date).toBe("2026-10-17");
    expect(profile?.expenditureSeed?.goalRatePctPerWeek).toBe(0.25);
    expect(profile?.safety?.pregnantOrEdHistory).toBe(false);
  });
});
