"use client";

import { useEffect } from "react";
import { useIsHydrated } from "@/lib/ui/useIsHydrated";
import { useNow } from "@/lib/ui/useToday";
import { useUnit } from "@/lib/unit-preference";
import { useBodyData } from "@/lib/physique/io/bodyData";
import { completeReview, useReview } from "@/lib/physique/io/review";

/** One check-in at a time across the app, so two mounted screens never write it twice. */
let running = false;

/**
 * Targets follow the maintenance estimate by themselves (A2). The founder:
 * "the maintenance should auto adjust as well". The estimate already moves
 * daily with food and weight; on the check-in day, the first time Home,
 * Food or the report opens, the week's update is applied with no button:
 * new targets when the maintenance estimate has moved, the same ones when
 * it hasn't, nothing during a safety hold or a logging break. The check-in
 * is recorded either way, so it runs once a week. Renders nothing.
 */
export default function AutoCheckIn() {
  const hydrated = useIsHydrated();
  const now = useNow();
  const { unit: rawUnit } = useUnit();
  const unit = rawUnit === "lb" ? "lb" : "kg";
  const data = useBodyData();
  const model = useReview(hydrated ? now : null, unit);

  useEffect(() => {
    if (!model || !now || running) return;
    const goal = data.goal;
    // Due: a goal with its program, a check-in week after the goal began, and no check-in recorded for it yet.
    if (!goal || !model.hasProgram || model.reviewed || model.plan.weekStart <= goal.startDate) return;
    running = true;
    const choice = model.review.decision.kind === "accept" ? "accept" : "keep";
    void completeReview(model, { partialDays: {}, unloggedDays: {}, waistCm: null }, choice, now, unit, new Date().toISOString()).finally(() => {
      running = false;
    });
  }, [model, now, unit, data.goal]);

  return null;
}
