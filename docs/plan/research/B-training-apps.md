# B: Training-side features in proven apps, compared with this repo

Research date: 2026-10-16. Scope: MacroFactor Workouts, RP Hypertrophy, Hevy/Strong, short readiness notes on Juggernaut AI, Fitbod and Dr. Muscle, evidence on training by diet phase, and a gap analysis against `/home/user/gym-app`.

**Confidence tags**
- `[official]`: the vendor's own site or help centre, or the primary paper.
- `[third-party]`: a review, forum, competitor or secondary summary.
- `[inferred]`: my own synthesis or a proposed number. Not documented anywhere.
- `[repo]`: read directly from this codebase.
- `[unverified]`: claimed somewhere but not confirmed.

**Access notes**
- RP's help centre (help.rpstrength.com) returns Cloudflare 403 to normal fetches. I read the articles through its public Zendesk API, and the URLs below are the canonical `html_url`s.
- MacroFactor's per-version release notes (e.g. macrofactor.com/wo-version-1-1-0/) are bot-protected and were not readable. Their content is cited only through the Jan-2026 newsletter and the Sept-2026 annual report.

---

## 0. TL;DR for the build plan

1. **Copy MacroFactor's set-level progression rule.** Expected reps-to-failure = midpoint of the rep range + target RIR. Beat it and load or reps go up; miss it and they go down slightly. Rep-range widening and "weight match" apply when equipment increments can't produce a good target. It is deterministic and rule-based, not generative AI. Our repo has three progression implementations that disagree; replace all three with this one.
2. **Copy RP's weekly per-muscle set adjustment.** It uses two 1–4 scores, soreness/recovery and performance, plus optional pump and workload. Muscles get Emphasize / Grow / Maintain priorities that map to MRV / near-MEV / MV. The mesocycle always ends with a deload week. This is the "is the plan working, adjust it" loop for training.
3. **The gap MacroFactor leaves open is the one we want.** MF Workouts and MF Nutrition share only body metrics, and they explicitly do *not* adjust training from nutrition or nutrition from training. A physique engine that conditions training rules on diet phase is differentiated, and can still be grounded in evidence (section 5).
4. **Logging parity with Hevy:**
   - The repo already has previous values by set index, tap-to-copy, a per-exercise rest timer and per-set RIR.
   - It lacks set types (warm-up, drop, failure, myo), supersets, a warm-up generator, a plate calculator with equipment increments, and live PR detection.
5. **Reuse `lib/liftTrend.ts`, but fix two things first:**
   - It picks the heaviest-weight set rather than the best-e1RM set.
   - It is indexed by session rather than by time. A physique engine needs %/week.
6. **Bug: Hevy imports in lb lose all weights.** `lib/csvImport.ts` reads only `weight_kg`, but Hevy exports `weight_lbs` for some users (sources disagree on when). Must fix.

---

## 1. MacroFactor Workouts (launched January 2026)

**Context**
- Launched January 2026 (v1.0.1 on 12 Jan 2026) `[official]`: https://macrofactor.com/mm-jan-2026/, https://macrofactor.com/workouts-release-notes/
- Built by the Stronger By Science / MacroFactor team (Nuckols, Trexler, Nippard) `[official]`: https://macrofactor.com/team/
- As of Sept 2026: 1,200+ exercises, 250+ equipment options, and splits extended beyond Full Body and Upper/Lower to PPL. Rep progression schemes: Static, Linear, Reverse Linear, Undulating `[official]`: https://macrofactor.com/annual-report-2026/
- Marketing says progression is "rule-based logic, not generative AI" `[official]`: https://macrofactor.com/workouts/

### MF-1 · Smart Generation questionnaire
- **What it does:** Builds a full program (exercises, sets, rep ranges, RIR targets) from a short questionnaire.
- **How it works:** The flow runs in this order:
  1. Primary goal (e.g. strength or hypertrophy)
  2. Optional focus muscles (5 "focus points")
  3. Optional deprioritised muscles (up to 5)
  4. Days per week (+/−)
  5. Minutes per session
  6. Gym profile (equipment)
  7. Structure (full body / upper-lower / PPL)
  8. Include deload phases? (and confirm lifting experience)
  9. Name, icon and colour
  10. Generate

  Exercise exclusions are also an input. After generation the user can swap or add exercises, create supersets and change the schedule. "Your program and overall structure will not change automatically". Only weights and reps update from logs.
- **UX pattern:** A linear wizard of one question per screen, then an editable program preview with "Activate Program".
- **Sources:**
  - https://help.macrofactorapp.com/en/articles/285-create-a-new-program-via-smart-generation `[official]`
  - https://help.macrofactorapp.com/en/articles/370-what-information-does-macrofactor-workouts-use-to-generate-my-program `[official]`
  - https://help.macrofactorapp.com/en/articles/369-how-often-does-my-program-update (title only, via the collection index) `[official]`
- **Not verified:** the exact answer options and split rules per day count.
- **Confidence:** high on inputs, low on the generation rules.
- **Adapt for us:** **Change.** We already collect goal, days, session length, equipment, years training and RIR familiarity in `lib/onboardingProfile.ts`. Add focus/deprioritised muscles (up to 5 each), split choice, deload preference and exclusions. Generate the skeleton deterministically from templates. Use the LLM only to explain the plan, not to invent sets.
- **Priority:** should.

### MF-2 · Program structure: cycles, not calendar; per-exercise periodization
- **What it does:** A program is a sequence of *cycles* (weeks). Each exercise has per-cycle sets, rep min/max and RIR targets.
- **How it works:**
  - Missed days don't shift anything: "programs … do not run on a calendar-based schedule … use training cycles". Periodization can be toggled on for custom programs, which auto-fills the cycles.
  - Edits can be saved for one cycle only, for all cycles of that exercise, for all exercises of that day, or for everything.
  - Schemes added after launch: Static, Linear, Reverse Linear, Undulating. **The exact rep and RIR tables for each scheme are not published.**
- **UX pattern:** A grid of cycle boxes per exercise. Tap a week to edit its targets.
- **Sources:**
  - https://help.macrofactorapp.com/en/articles/389-how-can-i-customize-periodization-rir-reps-and-sets-for-the-exercises-in-my-program `[official]`
  - https://help.macrofactorapp.com/en/articles/382-what-happens-to-my-program-if-i-miss-workouts-or-take-time-off `[official]`
  - https://macrofactor.com/annual-report-2026/ `[official]`
- **Confidence:** high on structure, unknown on the scheme internals.
- **Adapt for us:** **Copy the data model.** Today `lib/templateStorage.ts` `TemplateExercise` holds only `targetSets` and `restSec`. Add `repMin`, `repMax`, `rirTargets[]` (one per set) and `weekOverrides`. Implement Static and Linear first. Undulating can come later.
- **Priority:** must (the data model). The extra schemes are later.

### MF-3 · Smart Progression: the core set-level rule
- **What it does:** Recommends weight and reps for every working set from the user's logged weight, reps and RIR.
- **How it works:**
  - **Non-failure sets (RIR target ≥ 1):** expected max reps = midpoint of the rep range + RIR target. In MF's example (7–9 reps at 2 RIR), the expectation is 8 + 2 = 10. "9 or more reps at 2 RIR indicates progress". So do 8+ at 3 RIR, 10+ at 1 RIR and 11+ at 0 RIR. Any of those raises load or reps.
  - **Failure sets (0 RIR target):** progress means beating the prior performance at the same load (10→11 reps at 150 lb ⇒ increase).
  - **Downward adjustments:** if 8 reps at a 2-RIR target ends with only 1 RIR left, or only 6 of 8 reps are completed, the next load "may decrease slightly". This is "never punitive".
  - **No history:** the app makes no recommendation until the exercise has been logged once. "The app does not make immediate weight recommendations."
  - **Learning:** after the first workout the app learns the user's "rate of progress and strength/endurance relationship". The model behind this is not published.
  - **RIR scale:** 0 to "6+".
- **UX pattern:**
  - The initial log fill can be "Smart Progression values" or "Previous values" (a setting). There is also an "Apply in session" toggle.
  - In-workout recommendations update after each logged set.
- **Sources:**
  - https://help.macrofactorapp.com/en/articles/372-what-does-progressive-overload-mean-in-macrofactor-workouts `[official]`
  - https://help.macrofactorapp.com/en/articles/373-why-does-the-app-sometimes-recommend-lowering-weight-or-reps `[official]`
  - https://help.macrofactorapp.com/en/articles/305-understanding-and-using-smart-progressions `[official]`
  - https://help.macrofactorapp.com/en/articles/385-what-is-rir-and-how-should-i-use-it-during-training `[official]`
  - https://help.macrofactorapp.com/en/articles/377-how-do-i-know-what-weight-to-start-with `[official]`
  - https://macrofactor.com/workouts/ `[official]`
- **Confidence:** high on the thresholds as documented. The internal e1RM / strength-endurance model is unknown.
- **Adapt for us:** **Copy the rule exactly.** For the load-from-target maths, use Epley on reps-to-failure, which the repo already uses (`estimateE1RM`). This replaces:
  - `getTargetDataForExercise` in `app/workout/page.tsx`
  - `applyDoubleProgression` in `lib/trainingKnowledge/progressionEngine.ts`
  - `/api/refine-target` (an LLM call)

  See section 8.
- **Priority:** **must**.

### MF-4 · Rep-range expansion, Weight Match, equipment-aware loads, the "wand"
- **What it does:** Handles the case where a sensible load jump doesn't exist, for example 10→15 lb dumbbells.
- **How it works:**
  - **Expand Rep Range** (setting): the app may widen the target range instead of jumping load. After 100 lb × 8 it suggests 100 × 9, not 105 × 8.
  - **Weight Match:** prefers keeping the previous set's weight if that still gives a good target.
  - **Equipment profiles:** profiles hold available increments, including pin-stack ranges for machines. Loads snap to what exists.
  - **Very high reps:** when the next jump is large, the app "may raise reps instead". This is why it sometimes recommends very high reps.
  - **v1.1.x change:** the app "can now widen a set's target rep range when it's optimal to do so, and offer fixes for all applicable sets at once". This fixed "95% of the instances" of odd-looking sets.
- **UX pattern:** A wand icon on each recommendation, in three states:
  - Blue: info
  - Yellow: adjustment to review, or "Progression unavailable within target rep range". Tap **Fix** for options such as new targets, manual weight, accept out-of-range, or switch to a fixed bar.
  - Red: the needed equipment isn't in the gym profile.

  Tapping the wand opens an explanation of why the recommendation was made.
- **Sources:**
  - https://help.macrofactorapp.com/en/articles/305-understanding-and-using-smart-progressions `[official]`
  - https://help.macrofactorapp.com/en/articles/391-what-does-the-smart-progression-wand-mean `[official]`
  - https://help.macrofactorapp.com/en/articles/392-why-am-i-being-recommended-very-high-reps `[official]`
  - https://macrofactor.com/mm-jan-2026/ `[official]`
  - Pin-stack article title from the collection index: https://help.macrofactorapp.com/en/collections/20-macrofactor-workouts `[official]`
- **Confidence:** high.
- **Adapt for us:**
  - **Copy:** expansion and weight-match behaviour, plus an equipment increment table (per user: barbell plate pairs, dumbbell steps, machine stack step).
  - **Copy:** "why" explanations. This fits our assistant-first, evidence-card model (`lib/evidenceMapping.ts`). Skip the colour semantics; one "explain" affordance is enough.
- **Priority:** must (increments and expansion). The explanation UI is a should.

### MF-5 · "Calibration" set structure
- **What it does:** Generated programs "intentionally start with a harder set", sometimes close to failure, then move to sets with higher RIR.
- **How it works:** It calibrates the user's RIR estimates and gives Smart Progression better data. MF says putting the failure set first or last doesn't meaningfully change outcomes if effort and volume are similar.
- **UX pattern:** Per-set RIR targets differ within one exercise.
- **Sources:** https://help.macrofactorapp.com/en/articles/397-is-it-normal-to-see-failure-sets-or-rir-decreasing-across-sets `[official]`
- **Confidence:** high.
- **Adapt for us:** **Copy.** Set 1 targets RIR 0–1 (isolation) or 1 (compound); later sets target 2–3. This directly improves the quality of the RIR data our engine depends on.
- **Priority:** should.

### MF-6 · Deloads
- **What it does:** A per-program deload setting: None / First cycle / Last cycle.
- **How it works:** A deload "temporarily lower[s] intensity or volume". **Sets, RIR and load numbers are not published.**
- **UX pattern:** Program settings → Deload → Edit.
- **Sources:** https://help.macrofactorapp.com/en/articles/297-deload-first-cycle-or-last-cycle `[official]`
- **Confidence:** high on the options, unknown on the numbers.
- **Adapt for us:** **Copy the option.** Take the numbers from RP and Dr. Muscle (see RP-1 and DM-1).
- **Priority:** must.

### MF-7 · Smart warm-ups
- **What it does:** Auto-adds warm-up sets scaled to the working load. On by default.
- **How it works:** Each warm-up is a % of a reference/target set plus a rep count. The documented example is 40% → 60% → 80%×3. Exercise-specific schemes override the default. Completed warm-ups can be hidden.
- **UX pattern:** Warm-ups appear above working sets with a "W" badge.
- **Sources:** https://help.macrofactorapp.com/en/articles/304-configuring-warm-ups `[official]`
- **Confidence:** high on mechanics. Default set counts are not published.
- **Adapt for us:** **Copy**, with defaults from RP's guide (RP-10) or Hevy.
- **Priority:** should.

### MF-8 · Set types and logging extras
- **What it does:** Standard, Warm-up (W), Drop (D, several entries grouped as one set), Myo (M, entries grouped), Failure (F, logged at RIR 0). Also left/right weights and reps, partial reps, a plate calculator based on the bars and plates available, custom rest timers and supersets.
- **Sources:**
  - https://help.macrofactorapp.com/en/articles/317-logging-different-types-of-sets `[official]`
  - https://macrofactor.com/workouts/ `[official]`
- **Confidence:** high.
- **Adapt for us:**
  - **Copy:** W, D and F now.
  - **Later:** Myo, L/R and partials.
- **Priority:** must (warm-up type, so warm-ups are excluded from volume and e1RM). Drop and failure are should.

### MF-9 · Analytics
- **What it does:**
  - **Sets** chart: all sets equal.
  - **Volume** chart: load-weighted, split into resistance and bodyweight volume. Available per workout and per muscle, over week, month, year and all time.
  - **Levels:** a body map of *average sets per week per muscle* over 1 week, 1 month or 3 months, with drill-down to the contributing exercises. It does not reflect load or effort.
  - PR tracker, a "Recent Records" dashboard widget, and a weight trend inside the Workouts app.
  - Roadmap: "Strength Levels", per-muscle strength estimates that suggest starting weights.
- **Not published:** how secondary muscles count toward sets.
- **Sources:**
  - https://help.macrofactorapp.com/en/articles/343-viewing-sets-and-volume-over-time `[official]`
  - https://help.macrofactorapp.com/en/articles/342-understanding-levels `[official]`
  - https://help.macrofactorapp.com/en/articles/280-muscle-groups `[official]`
  - https://macrofactor.com/annual-report-2026/ `[official]`
- **Confidence:** high.
- **Adapt for us:** **Change.** Per PRODUCT.md we stay glanceable. Keep a weekly sets-per-muscle view (we have `app/volume/page.tsx`). Add a PR list. Skip the body-map art.
- **Priority:** should.

### MF-10 · Integration with MacroFactor Nutrition
- **What it does:** Syncs body weight, circumference measurements, progress photos, some habits and period data between the two apps. The apps are sold as a bundle.
- **How it works:** The help centre says the apps "do not automatically adjust training based on nutrition data, or nutrition targets based on training data". Any future integration "would be intentional and evidence-based, rather than automatic or reactive."
- **Sources:**
  - https://help.macrofactorapp.com/en/articles/381-how-does-macrofactor-workouts-integrate-with-macrofactor-nutrition `[official]`
  - https://macrofactor.com/workouts/ `[official]`
- **Confidence:** high.
- **Adapt for us:** **This is our wedge.** A single engine where diet phase changes training rules (section 5) and training signals feed back to nutrition, for example "strength crashing plus losing more than 1%/wk means the deficit is too aggressive". Keep MF's caution: use few, explained, evidence-linked rules, not reactive tweaks.
- **Priority:** must.

### MF-11 · Swaps, exclusions, missed time
- **What it does:**
  - "Smart substitutions" when swapping an exercise; the logic is not published.
  - A "prevent exercises from being suggested" list.
  - After time off the program is unchanged and recommendations re-fit to the new logs.
- **Sources:**
  - https://help.macrofactorapp.com/en/articles/332-swap-exercises `[official]`
  - https://help.macrofactorapp.com/en/articles/382-what-happens-to-my-program-if-i-miss-workouts-or-take-time-off `[official]`
- **Confidence:** medium. The suggestion logic is opaque.
- **Adapt for us:** **Copy, using our existing ranker.** `getRankedSubstitutes` in `lib/exerciseSubstitutions.ts` already scores movement pattern, role, muscle overlap and equipment. Wire it into the workout "Replace" menu.
- **Priority:** should.

---

## 2. RP Hypertrophy app (Renaissance Periodization)

The native iOS app launched in the US on 20 Dec 2025. Muscle priorities (Emphasize/Grow/Maintain) and a mobile meso planner shipped in v0.31.0 (5 Sep 2025) `[official]`: https://help.rpstrength.com/hc/en-us/articles/34725726510999-RP-Hypertrophy-App-What-s-new

### RP-1 · Mesocycle structure and mandatory deload
- **What it does:** Training runs in mesocycles built from 45+ templates (marketing also says "100+ templates"), from scratch, or with the Meso Builder. The final week is always a deload.
- **How it works:**
  - **Length is chosen at creation and *includes* the deload week.** Accumulation weeks by experience: beginners up to 8 weeks; intermediates 4–7; advanced 3–6.
  - **"The last week of the block is always a deload."** Skipping it is allowed but not recommended for late-intermediate and advanced lifters. The volume cut also happens mid-block if feedback says so.
  - **A finished meso can be copied**, and weights and targets carry over unless an exercise slot changes.
- **UX pattern:** Pick a template, the "flash" icon auto-picks exercises, choose the length, create.
- **Sources:**
  - https://help.rpstrength.com/hc/en-us/articles/43549450227223-Mesocycle-Length `[official]`
  - https://help.rpstrength.com/hc/en-us/articles/43864718052887-Sudden-Drop-In-Workload `[official]`
  - https://help.rpstrength.com/hc/en-us/articles/43746837058583-Mesocycle-Creation `[official]`
  - https://help.rpstrength.com/hc/en-us/articles/44019834219543-Finished-Mesocycle `[official]`
  - https://rpstrength.com/pages/hypertrophy-app `[official]`
- **Confidence:** high.
- **Adapt for us:** **Copy:** meso length defaults by experience, a final deload week, and "copy meso" carrying weights forward.
- **Priority:** must.

### RP-2 · Per-session feedback drives next week's sets
- **What it does:** After each session the app asks per-muscle feedback (pump, soreness, workload) and adjusts future set counts.
- **How it works:**
  - **In-app behaviour** (official help):
    - "Low pumps, barely sore, and rating workouts as easy = more sets"
    - "Good pumps, soreness just healing on time, and your workload as pushing your limits = no change in sets"
    - "Amazing pumps, so sore that you can't heal on time, and too much volume = fewer sets"
    - "These calculations are continuous and future sessions are influenced by your feedback."
  - **RP's published manual algorithm**, which the app automates. Score last week on two scales:
    - Soreness/recovery: 1 = no soreness, 2 = healed well before next session, 3 = healed just in time, 4 = still sore at next session.
    - Performance: 1 = exceeded targets easily, 2 = hit targets, 3 = struggled, 4 = couldn't match the previous week.
  - **Rules:**
    - Both scores 1 → add 2–3 sets next week.
    - 2s or a mix of 1 and 2 → add 1 set.
    - Any 3 with soreness 3–4 → keep volume.
    - Performance 4 → recovery session or deload.

    The rules leave some combinations unspecified. A performance score of 4 marks MRV, but if it happened during unusual stress or sleep loss, "repeat the previous week's volume to confirm".
- **UX pattern:** Short tap-scale questions after the last set of each muscle. Soreness is asked when that muscle is next trained.
- **Sources:**
  - https://help.rpstrength.com/hc/en-us/articles/43864744488599-Hypertrophy-App-Progressions `[official]`
  - https://rpstrength.com/blogs/articles/training-volume-landmarks-muscle-growth `[official]`
- **Not documented in the help centre:** the exact in-app answer wording and the joint-pain question (see RP-8).
- **Confidence:** high on the direction and the manual algorithm. The in-app weights are proprietary.
- **Adapt for us:** **Copy the 1–4 × 1–4 table.** Compute performance automatically from logged reps and RIR versus targets (no question needed). Ask only soreness/recovery, at most one tap per muscle per session. Pump and workload are optional. This keeps logging "at-or-faster than Hevy" (PRODUCT.md).
- **Priority:** **must**.

### RP-3 · Load and rep progression
- **What it does:** Sets each week's weight and reps.
- **How it works:** "Weight is increased by a few percentage points each week, and if the next weight increment is outside of that range (like going from the 10 lb to the 15 lb dumbbells), it adds a rep to each set instead." Users can overwrite anything, and the app builds on the change. A 2024 support reply mentions "secondary progressions" that favour weight and reps over volume. That reply is a single community post.
- **Sources:**
  - https://help.rpstrength.com/hc/en-us/articles/43864744488599-Hypertrophy-App-Progressions `[official]`
  - https://help.rpstrength.com/hc/en-us/articles/43864695258903-Changing-Set-Number `[official]`
  - https://hypertrophy.zendesk.com/hc/en-us/community/posts/22316645578007-Maintenance-Phase-using-Hypertrophy-App `[third-party: forum, quoted via search]`
- **Confidence:** high, but "a few percentage points" is unquantified.
- **Adapt for us:** **Copy as a cap.** Weekly load increase ≤ ~2–5% (compound) or ~5–10% (isolation, where the next increment is bigger) `[inferred numbers]`. Otherwise add reps. This is the same logic as MF-4.
- **Priority:** must (inside the MF-3 engine).

### RP-4 · RIR progression across the meso
- **What it does:** Proximity to failure rises week by week.
- **How it works:** Week 1 shows a target RIR. Users report 3 → 2 → 1 → 0 RIR across the meso. **RP's help pages only confirm a week-1 RIR target**: "RIR cannot be changed in the app". The 3→0 schedule is third-party.
- **Sources:**
  - https://help.rpstrength.com/hc/en-us/articles/43828601644055-Logging-Weights-Reps-Sets `[official]`
  - https://www.exodus-strength.com/forum/viewtopic.php?p=327524 `[third-party]`
  - https://dr-muscle.com/rp-hypertrophy-app-for-strength-training-expert-review/ (competitor: "decrease the RIR over a 4–6 week cycle before a deload") `[third-party]`
- **Confidence:** medium.
- **Adapt for us:** **Change.** Compounds run 3→2→1→1, isolations 3→2→1→0, so heavy compounds aren't taken to 0 RIR. This is consistent with Helms 2015: "Training to failure should be limited when performing heavy loads on taxing exercises", https://ro.ecu.edu.au/ecuworkspost2013/1869 `[official/paper]`.
- **Priority:** must.

### RP-5 · Emphasize / Grow / Maintain muscle priorities
- **What it does:** Per-muscle priority levels:
  - Emphasize (3 bars) "will add training volume whenever you are responding and recovering well, moving you from MEV … up to MRV".
  - Grow (2 bars) "only increase[s] volume when needed, keeping you closer to MEV".
  - Maintain (1 bar) "will keep you at MV".

  Emphasize slots are limited. The Meso Builder builds a split from days per week plus these priorities.
- **Sources:**
  - https://help.rpstrength.com/hc/en-us/articles/43549477104151--Grow-Maintain-and-Emphasize-Progressions `[official]`
  - https://help.rpstrength.com/hc/en-us/articles/43746837058583-Mesocycle-Creation `[official]`
- **Confidence:** high.
- **Adapt for us:** **Copy.** This is ideal for a physique goal ("bring up shoulders, maintain legs on a cut"). `lib/userProfile.ts` already has `priorityMuscles` and `deprioritizedMuscles` fields marked "future AI parsing". Make them structured enums. The MF analogue is 5 focus and 5 deprioritise points.
- **Priority:** must.

### RP-6 · Volume landmarks and MEV check
- **What it does:** Defines the volume landmarks:
  - MV ≈ 6 working sets per muscle per week (when trained 2+ times per week). Used for deloads, limited time, priority phases and "fat loss phases".
  - MEV is the meso start.
  - MAV is the progression zone.
  - MRV is the ceiling.
- **How it works:**
  - **A working set** is 30–85% 1RM, 5–30 reps and 0–4 RIR.
  - **Sample progression** (MEV 12, MRV 20): 12 → 14 → 16 → 18 → 20, then a deload at 6 sets.
  - **MEV check** after a session: pump 0–2 + challenge 0–2 + soreness 0–2. 0–1 means below MEV, 2–4 at MEV, 5–6 above MEV.
  - **Volume counting:** RP counts only sets where the muscle is the prime mover. MRVs already discount indirect work.
- **Sources:** https://rpstrength.com/blogs/articles/training-volume-landmarks-muscle-growth `[official]`
- **Confidence:** high.
- **Adapt for us:**
  - **Copy:** MV, MEV and MRV per muscle. Seed them from `lib/trainingKnowledge/volumeRules.ts` ranges.
  - **Change:** keep our fractional counting (indirect = 0.5, as in `lib/muscleSetCounting.ts`). The 2025/26 Pelland et al. dose-response meta-regression found fractional counting predicted hypertrophy best (`[third-party summary of paper]`: https://sportrxiv.org/index.php/server/preprint/download/537/1148/1071, DOI 10.1007/s40279-025-02344-w). Hevy also counts secondary muscles as 0.5. Either way the landmark thresholds must match the counting method.
- **Priority:** must.

### RP-7 · Missed training and restarts
- **What it does:**
  - Missing a day: either pick up where you left off or skip it.
  - Missing a week or more: at the end of a cycle, go to the deload or treat the time off as the deload. At the beginning or middle of a cycle, restart with a new block.
  - Illness: above-the-neck symptoms allow light training; fever or systemic symptoms mean rest.
  - Not getting pumps for weeks: the app adds sets; RP suggests up to 2 weeks of active rest.
- **Sources:**
  - https://help.rpstrength.com/hc/en-us/articles/43864772559383-Missing-A-Day-of-Training `[official]`
  - https://help.rpstrength.com/hc/en-us/articles/43864727286295-Training-While-Sick `[official]`
  - https://help.rpstrength.com/hc/en-us/articles/43864753237143-Not-Getting-Pumps `[official]`
- **Confidence:** high.
- **Adapt for us:** **Copy** the gap rules (see section 8).
- **Priority:** should.

### RP-8 · Joint pain feedback
- **What it does:** Third-party reviews list joint pain as a feedback input.
- **Not verified:** RP's help centre does not document it, and I couldn't confirm its wording or effect.
- **Sources:** https://wellness.alibaba.com/fitlife/how-rp-hypertrophy-works `[third-party, low quality]`
- **Confidence:** low `[unverified]`.
- **Adapt for us:** **Change.** Ask for joint pain only when the user flags it (an optional chip on the exercise card). On "moderate+" twice in a row, offer a ranked substitute (`getRankedSubstitutes`) with the same set count. The rule itself is `[inferred]`.
- **Priority:** should.

### RP-9 · Set types and logging rules
- **What it does:**
  - Set types are straight, myorep and myorep-match. Myorep: 5–15 s pauses, log total reps. Myorep-match: mini-sets until you match set 1's reps.
  - There are no supersets; users reorder exercises instead.
  - "Do not log warm up sets in the app, as the app treats all sets logged as working sets."
  - Weight auto-fills into later sets.
- **Sources:**
  - https://help.rpstrength.com/hc/en-us/articles/43828601644055-Logging-Weights-Reps-Sets `[official]`
  - https://help.rpstrength.com/hc/en-us/articles/43549480893591-Warm-ups-and-Starting-Weights `[official]`
- **Confidence:** high.
- **Adapt for us:** **Skip RP's "don't log warm-ups"** in favour of a warm-up set type that is excluded from analysis (MF/Hevy model). Copy weight auto-fill into later sets.
- **Priority:** must (warm-up exclusion).

### RP-10 · Warm-up and starting-weight guidance
- **What it does:** A simple ramp:
  - 12 reps with a load you could do for 30+
  - 8 reps with a load you could do for ~20
  - 4 reps with a load you could do for ~10
  - Then working sets at 3 RIR.

  Later exercises need 0–2 warm-up sets. Rep guidance: 5–10 reps for compounds, 10–20 for isolations, 20–30 for small muscles; "any load in the 5-30 rep range is good".
- **Sources:**
  - https://help.rpstrength.com/hc/en-us/articles/43549480893591-Warm-ups-and-Starting-Weights `[official]`
  - https://help.rpstrength.com/hc/en-us/articles/43549613990807-Recommended-Rep-Range `[official]`
- **Confidence:** high.
- **Adapt for us:** **Copy** as the warm-up generator's default (≈ 40% × 12, 55% × 8, 75% × 4 of working load is a close `[inferred]` translation). Copy the rep-range defaults by exercise role, which fit the `role` field in `lib/exerciseMetadataLibrary.ts`.
- **Priority:** should.

---

## 3. Hevy and Strong: logging UX

### HV-1 · PREVIOUS column by set index, tap to copy
- **What it does:** A "PREVIOUS" column shows last time's weight × reps for the same set index (e.g. "45kg x 9"). Tapping it copies the values into the current set.
- **How it works:**
  - **A setting chooses the source:** "Any workout" (last time the exercise was done) or "Same routine".
  - **New set indices stay blank** until they have been logged once.
  - **Routine values are separate** and update on save unless "Update Routine Values" is off. They never update when a rep range is set on the exercise.
- **Sources:**
  - https://www.hevyapp.com/features/track-exercises/ `[official]`
  - https://help.hevyapp.com/hc/en-us/articles/34105442929943-Previous-Workout-Values-Vs-Routine-Values-How-to-Adjust-in-Settings `[official]`
- **Confidence:** high.
- **Adapt for us:**
  - **Already have:** per-set placeholders come from `getLastSetsForExercise` in `app/workout/page.tsx`. Ticking "done" on an empty row commits the placeholder (`toggleSetDone(…, prevWeightStr, prevRepsStr)`) `[repo]`.
  - **Add:** a "same template vs any workout" setting.
- **Priority:** later. Parity is already there.

### HV-2 · Rest timer
- **What it does:** A per-exercise rest timer (5 s–5 min) that starts automatically when a set is marked complete.
- **How it works:**
  - **Adjustable:** −15 / +15 buttons per rest period, a global default timer (can default to off), and per-exercise off.
  - **Not before drop sets:** the timer doesn't start if the next set is a drop set.
  - **Alerts:** a notification and Live Activity at zero.
  - **Hevy Trainer presets:** Short ≈ 1:15–1:45, Medium ≈ 1:45–2:15, Long ≈ 2:00–3:00.
- **Sources:**
  - https://www.hevyapp.com/features/workout-rest-timer/ `[official]`
  - https://help.hevyapp.com/hc/en-us/articles/34896293707927-Set-Types-in-Hevy-Explained-Drop-Sets-Warm-Up-Sets-and-More `[official]`
  - https://help.hevyapp.com/hc/en-us/articles/43572343844247-How-Hevy-Trainer-Settings-Work `[official]`
- **Confidence:** high.
- **Adapt for us:**
  - **Already have:** a per-exercise timer, default 90 s, auto-start on completion ("When a set is completed, start the rest timer for this exercise"), vibrate and sound settings, and persistence across reloads (`lib/restTimerSettings.ts`, `restTimerByExercise` in `lib/activeWorkout.ts`, `components/RestTimerBanner.tsx`) `[repo]`.
  - **Add:** ±15 s, a global default, skip-before-drop-set, and role-based defaults (compound 2–3 min, isolation 1–1.5 min `[inferred]`).
- **Priority:** should.

### HV-3 · Supersets
- **What it does:** "Add To Superset" from the exercise menu. Groups have no size limit and each gets its own colour.
- **How it works:** **Smart Superset Scrolling:** completing a set scrolls to the next exercise in the group, then back to the first. Per-exercise rest still applies. The CSV has `superset_id`: sets sharing a number were supersetted; blank means a straight set.
- **Sources:**
  - https://www.hevyapp.com/features/what-are-supersets/ `[official]`
  - https://thetaperapp.com/articles/how-to-export-hevy-data/ `[third-party]`
- **Confidence:** high.
- **Adapt for us:** **Copy** a `supersetId` on `DraftExercise` and `StoredWorkout.exercises[]`. Show a coloured rail and auto-advance focus to the next exercise's first incomplete set. Start rest only after the last exercise in the group.
- **Priority:** should.

### HV-4 · Set types
- **What it does:** Normal, W (warm-up), D (drop set, shown in blue), F (failure). For failure sets, log the last completed rep.
- **How it works:** **Hevy *counts warm-up sets* in "Sets per Muscle Group".** I consider that a design flaw; don't copy it.
- **Sources:**
  - https://help.hevyapp.com/hc/en-us/articles/34896293707927-Set-Types-in-Hevy-Explained-Drop-Sets-Warm-Up-Sets-and-More `[official]`
  - https://help.hevyapp.com/hc/en-us/articles/44128140257431-How-Does-Sets-per-Muscle-Group-Work `[official]`
- **Confidence:** high.
- **Adapt for us:** **Copy the types and change the counting.** Warm-ups are excluded from volume, e1RM, PRs and progression. Drop-set continuations count as one set. A failure set implies RIR 0.
- **Priority:** must.

### HV-5 · Warm-up calculator
- **What it does:** Enter the target weight and tap "Insert Warmup Sets" to get % × reps rows. The method is editable (add or remove sets, % and reps), with plate and dumbbell rounding.
- **How it works:** The FAQ suggests 3 warm-up sets for most people, 1–2 for light loads (~135–155 lb) and more than 3 above ~300 lb. Default percentages are not published.
- **Sources:**
  - https://www.hevyapp.com/features/warm-up-set-calculator/ `[official]`
  - https://help.hevyapp.com/hc/en-us/articles/35650921359639-How-to-Use-the-Warm-Up-Calculator-for-Percentage-Based-Warm-Up-Sets `[official]`
- **Confidence:** high.
- **Adapt for us:** **Copy**, using the same rounding as the plate calculator. Scale the warm-up count with load relative to e1RM rather than absolute lb `[inferred]`.
- **Priority:** should.

### HV-6 · Plate calculator
- **What it does:** Barbell, short bar and EZ bar exercises show a "Calculator" button above the keyboard. The user configures available plates and bars, including custom ones.
- **How it works:** If the target is unreachable, it says "Closest possible weight is …".
- **Sources:** https://www.hevyapp.com/features/weight-plate-calculator/ `[official]`
- **Confidence:** high.
- **Adapt for us:** **Copy.** The same equipment profile feeds load snapping in progression (MF-4), so it is one config with two uses.
- **Priority:** should for the UI. The equipment profile is a must.

### HV-7 · Live PR detection
- **What it does:** A banner appears when a completed set beats a previous best. There is no PR on an exercise's first log. The feature can be toggled.
- **How it works:**
  - **PR types for weight × reps:** Heaviest Weight, Best 1RM, Best Set Volume, Best Session Volume. Other exercise types have their own (reps, time, distance).
  - **"Set records"** (heaviest weight for N reps) are tracked in a table but don't trigger the banner.
  - **e1RM** uses a rep→% table: 1 = 100%, 5 = 89%, 8 = 81%, 10 = 75%, 12 = 71%, 15 = 67%, 20 = 60%, 30+ = 50%.
- **Sources:**
  - https://www.hevyapp.com/features/live-pr/ `[official]`
  - https://help.hevyapp.com/hc/en-us/articles/38279531346455-Set-Records-vs-Personal-Records `[official]`
  - https://help.hevyapp.com/hc/en-us/articles/36954464726167-Understanding-Your-Estimated-One-Rep-Max-1RM-in-Hevy `[official]`
- **Confidence:** high.
- **Adapt for us:** **Change.** Detect Best e1RM, Heaviest weight and Best reps-at-weight on set completion, using our Epley `estimateE1RM` for internal consistency. Show it as a quiet inline mark, no confetti (PRODUCT.md tone). On a cut, frame PRs as "strength retained", which is a positive physique signal.
- **Priority:** should.

### HV-8 · Routines, folders, rep ranges
- **What it does:** Routines are reusable templates organised in folders. Each set can hold load and reps or a rep range. RPE targets can't be set in routines but can be logged live. Trainer programs have Program Variety settings: Consistent, Balanced (rotate exercises ~6 weeks), Variable (weekly).
- **Sources:**
  - https://www.hevyapp.com/features/gym-routines/ `[official]`
  - https://help.hevyapp.com/hc/en-us/articles/43572343844247-How-Hevy-Trainer-Settings-Work `[official]`
  - Rep ranges in routines via search summary of the Hevy help centre `[third-party summary]`
- **Confidence:** medium-high.
- **Adapt for us:**
  - **Already have:** template CRUD, duplicate, start from template, save session as template and "update template from session" diffs (`app/templates/*`, `lib/templateStorage.ts`, `detectRoutineChanges` in `app/workout/page.tsx`) `[repo]`.
  - **Add:** rep ranges and RIR targets (MF-2). Folders are later.
- **Priority:** must (rep range and RIR on templates).

### HV-9 · Hevy Trainer: an algorithmic program generator
- **What it does:** A Pro feature. Hevy says it is "generated using an algorithm and do[es] not rely on AI", and that progressive overload suggestions are "based on the user's performance".
- **How it works:**
  - **Onboarding asks:** goal, experience, gender, birthday, weight, height, equipment, frequency, cardio, workout length, focus muscle.
  - **Default split by days per week:**
    - 1–3 days: Full Body
    - 4 days: U/L/U/L
    - 5 days: PPL + U/L
    - 6 days: PPL ×2
  - **Settings include** equipment presets with actual dumbbell and plate weights, injuries (avoid aggravating exercises and show warnings), and excluded exercises.
- **Sources:**
  - https://help.hevyapp.com/hc/en-us/articles/38385724273047-Hevy-Trainer-Explained-How-It-Builds-Your-Workout-Program `[official]`
  - https://help.hevyapp.com/hc/en-us/articles/43572343844247-How-Hevy-Trainer-Settings-Work `[official]`
  - https://www.hevyapp.com/announcing-hevy-trainer/ `[official]`
- **Confidence:** high on inputs and splits. Progression rules are not published.
- **Adapt for us:** **Copy** the frequency→split defaults and the "algorithm, not AI" stance for the numbers. The assistant explains; the engine decides.
- **Priority:** should.

### HV-10 · Sets per muscle (Hevy counting)
- **What it does:** Each set counts 1 toward primary muscles and 0.5 toward secondary muscles; warm-ups are included. Hevy cites ~10–20 sets per muscle per week as a guideline.
- **Sources:** https://help.hevyapp.com/hc/en-us/articles/44128140257431-How-Does-Sets-per-Muscle-Group-Work `[official]`
- **Confidence:** high.
- **Adapt for us:**
  - **Copy:** 1/0.5 counting, but exclude warm-ups.
  - **Fix:** our user-facing volume signal (`lib/volumeAnalysis.ts` via `getDetailedVolumeByMuscleGroup` in `lib/trainingMetrics.ts`) counts *full* sets to every primary group and gives no secondary credit. The builder (`lib/muscleSetCounting.ts`) uses direct + 0.5 indirect. The two use different range tables too: `MUSCLE_RANGES` versus `VOLUME_RULES_BY_LEVEL`. Unify them `[repo]`.
- **Priority:** must (one counting method).

### HV-11 · Hevy CSV export format (for import compatibility)
- **What it does:** Exports one row per set with 14 columns:
  `title, start_time, end_time, description, exercise_title, superset_id, exercise_notes, set_index, set_type, weight_lbs|weight_kg, reps, distance_miles|distance_km, duration_seconds, rpe`
- **How it works:**
  - **`set_type` values** are `normal | warmup | dropset | failure`.
  - **Dates** are quoted, e.g. `"15 Jul 2026, 09:52"`.
  - **A workout** is identified by `title + start_time`.
  - **Units:** sources conflict. Taper says weights are always `weight_lbs` "regardless of your display unit". Other guides say the header follows the user's unit setting. Hevy's own help page doesn't list columns.
- **Sources:**
  - https://thetaperapp.com/articles/how-to-export-hevy-data/ `[third-party]`
  - https://github.com/kit-g/heart-api/issues/72 `[third-party]`
  - https://griptapp.com/help/export-workouts-from-hevy `[third-party]`
  - https://help.hevyapp.com/hc/en-us/articles/43708290987415-Exporting-Your-Data-from-Hevy `[official, no schema]`
  - Hevy imports only Strong CSVs (English, kg): https://help.hevyapp.com/hc/en-us/articles/38001424401943-How-to-Import-Strong-App-CSV-Files-and-Export-Your-Data-in-Hevy `[official]`
- **Confidence:** medium. Verify against a real export.
- **Adapt for us:** **Fix `lib/csvImport.ts`.** `parseHevy` reads only `weight_kg` (`idx("weight_kg")`) `[repo]`. A `weight_lbs` file is still detected as Hevy (via `exercise_title`), but every weight becomes `""`. That silently corrupts e1RM and plateau signals. Also read `superset_id` and map `set_type` (failure → RIR 0; dropset → merge into the previous set). Warm-ups are already skipped.
- **Priority:** **must** (bug).

### ST-1 · Strong (brief)
- **What it does:** Auto countdown rest timer, warm-up calculator, plate calculator, warm-up/failure/drop set tags, PR and 1RM stats, and Volume and 1RM charts. The free tier allows 3 custom routines.
- **CSV:** columns `Date, Workout Name, Duration, Exercise Name, Set Order, Weight, Reps, Distance, Seconds, Notes, Workout Notes, RPE` (some versions add `Weight Unit`). Our parser already handles these.
- **Sources:**
  - https://apps.apple.com/app/id464254577 `[official listing]`
  - https://github.com/smyrick/sugarwod-to-hevy/blob/main/docs/STRONG_FORMAT.md `[third-party]`
- **Confidence:** medium.
- **Adapt for us:** Nothing beyond Hevy parity.
- **Priority:** later.

---

## 4. Readiness and recovery adjustments (Juggernaut AI, Fitbod, Dr. Muscle)

### JA-1 · Juggernaut AI readiness
- **What it does:**
  - **Before each session:** a questionnaire on sleep, mood, energy and soreness. It adjusts that day's training "by modifying volume or weight".
  - **During the session:** top-set and back-off RPEs adjust the next sets in real time.
  - **After each session:** feedback feeds a "running, weighted average" readiness score of 0 to ~30.
- **How it works:** The score has interpretation bands:
  - ≤15 consistently: work on recovery.
  - <10: heavy fatigue, so switch to a bridge block.
  - ≥20 consistently after block 2: maxes or RPEs may be too light.

  A drop across a block is normal and should recover by the end of the deload. Weightings are proprietary.
- **Sources:**
  - https://help.jtsstrength.com/en/articles/15-readines-rating `[official]`
  - https://help.jtsstrength.com/en/articles/3-how-juggernautai-is-individualized-to-you `[official]`
- **Confidence:** high on the existence and bands, none on the formula.
- **Adapt for us:** **Change.** Use *logged sleep* (the physique coach logs it anyway) plus an optional 1-tap "feeling: low / normal / good" as a day modifier:
  - Low readiness → hold load, +1 RIR target, −1 set on compounds.
  - Never raise load targets on a low day.

  Track a rolling readiness for deload triggers. Thresholds are `[inferred]`.
- **Priority:** should.

### FB-1 · Fitbod muscle recovery %
- **What it does:** A per-muscle recovery % (0–100) estimated from logged sets, reps, load, cardio and synced activity.
- **How it works:** The generator favours muscles not trained hard in the last 48–72 h. Fitbod sources variously say muscles are fully recovered at ~6 or ~7 days. The decay formula is unpublished, and users can override the %.
- **Sources:**
  - https://fitbod.me/blog/fitbod-algorithm `[official]`
  - https://fitbod.me/blog/muscle-recovery/ `[official]`
  - https://help.fitbod.me/hc/en-us/articles/360006269014-Muscle-Recovery (403; content via search summary) `[third-party summary]`
- **Confidence:** medium.
- **Adapt for us:** **Skip** as a user-facing metric. It is a fake-precision number that conflicts with PRODUCT.md's "no false positives". We already have recovery windows (`lib/trainingKnowledge/recoveryHeuristics.ts`, `fatigueRules.ts`) for scheduling checks.
- **Priority:** later or skip.

### DM-1 · Dr. Muscle auto-deload and gap handling
- **What it does:**
  - **Auto-deload** when it "detects a plateau and your 1RM has dropped": "cuts your sets by 50% and drops your weights by 10%". Premium only. Typical cadence is "every 4–6 weeks".
  - **Breaks:** 10+ days triggers a light session, with a larger reduction for longer breaks (formula unpublished).
  - **Untrained muscles:** a body part untrained for 5+ days gets more volume.
  - **Other features:** DUP rep variation (5–12), rest-pause as the default set style, 2–3% load increases, back-off sets at −20–30%.
- **Sources:** https://dr-muscle.com/what-makes-dr-muscle-different/ `[official marketing]`
- **Confidence:** medium. These are marketing pages, but specific.
- **Adapt for us:**
  - **Copy:** the deload numbers (−50% sets, −10% load) as defaults, and a ≥10-day gap → light first session.
  - **Skip:** DUP and rest-pause defaults.
- **Priority:** must (deload numbers), should (gap rule).

---

## 5. Training by diet phase: evidence an engine can act on

| Lever | Cut (deficit) | Maintenance / recomposition | Lean bulk (surplus) |
|---|---|---|---|
| **Load / intensity** | Keep relative load. Prefer dropping volume over intensity if something must give (Nippard via BarBend `[third-party]`). Heavy (≈80% 1RM, <10 reps) vs light (≈60%, <20 reps) gave near-identical body-composition results in a 20% deficit, so intensity is a preference, not a rule (Carlson 2022 via SBS `[third-party summary]`). | Keep relative load. Strength and size can be *maintained* for up to 32 weeks with 1 set per exercise, once a week, **if relative load is maintained** (younger adults) (Spiering 2021 `[official/paper]`). | Normal progression: 6–12 reps at 70–80% 1RM for most work (Helms 2015 `[paper]`). |
| **Volume** | **Don't auto-cut volume because of the cut.** Roth 2022 (review): "RT volume should not necessarily be decreased during phases of prolonged CR"; reducing pre-diet volume "may negatively affect lean tissue sparing". Roth 2023 RCT (~12 vs ~20 sets/wk for the quads in a moderate deficit): no difference in lean mass or muscle thickness. Reduce only on fatigue signals (RP-2). RP lists MV (~6 sets/wk) as an option for "fat loss phases" on *de-prioritised* muscles. | Grow-level volume (near MEV, ~10+ sets/wk). | Full RP MEV→MRV progression on Emphasize muscles. Bigger surpluses don't clearly add muscle: 5% vs 15% surplus for 8 weeks showed no clear difference in muscle thickness or squat, but more skinfold gain with 15% (Helms 2023 `[paper]`). |
| **Frequency** | Keep ≥2×/week per muscle (Helms 2015). | Same. | Same. Higher frequency helps when weekly volume is high (Helms 2015). |
| **Proximity to failure** | Limit failure on heavy compounds; fine on isolations (Helms 2015). | Same. | Same. |
| **What "working" looks like** | Strength gains are **not** impaired by a deficit on average, but lean-mass gains are, and impairment scales with deficit size (Murphy & Koehler 2022 `[paper]`; the "<500 kcal is safe" threshold is disputed `[third-party]`). Expect flat-to-slightly-rising e1RM in moderate cuts. A sustained multi-lift decline is a red flag. Target loss rate 0.5–1% BW/wk (Helms 2014 `[paper]`). | Slow e1RM progress. | e1RM should trend up. Target gain ≈0.25–0.5% BW/wk for novice/intermediate, less for advanced (Iraki 2019 `[paper]`). |
| **Sleep** | 5.5 h vs 8.5 h sleep in a deficit: same weight loss, but ~60% more fat-free mass lost and 55% less fat lost (n=10, crossover; Nedeltcheva 2010 `[paper]`). | Not specific. | Not specific. |

**Sources for the table**
- Nippard via BarBend: https://barbend.com/news/jeff-nippard-volume-vs-intensity-when-cutting/
- Carlson 2022 via SBS: https://www.strongerbyscience.com/research-spotlight-heavier-high-rep/
- Roth 2022 (Eur J Appl Physiol): https://pmc.ncbi.nlm.nih.gov/articles/PMC9012799/
- Roth 2023 RCT: https://onlinelibrary.wiley.com/doi/10.1111/sms.14237 and SBS summary https://www.strongerbyscience.com/research-spotlight-volume-muscle-dieting/
- Spiering 2021: https://pubmed.ncbi.nlm.nih.gov/33629972/
- Helms 2015 (training): https://ro.ecu.edu.au/ecuworkspost2013/1869
- Helms 2014 (nutrition): https://jissn.biomedcentral.com/track/pdf/10.1186/1550-2783-11-20
- Murphy & Koehler 2022: https://mediatum.ub.tum.de/doc/1609308/1609308.pdf
- Critique of the 500 kcal threshold: https://buttondown.com/mdickens/archive/can-you-maintain-lean-mass-in-a-calorie-deficit/
- Iraki 2019: https://pmc.ncbi.nlm.nih.gov/articles/PMC6680710/
- Helms 2023 (surplus size): https://pubmed.ncbi.nlm.nih.gov/37914977/
- Nedeltcheva 2010: https://pubmed.ncbi.nlm.nih.gov/20921542/
- RP volume landmarks: https://rpstrength.com/blogs/articles/training-volume-landmarks-muscle-growth

**Engine rules derived from this.** All thresholds are `[inferred]` unless marked; they need dogfood tuning.

1. **Cut**
   - Keep load. Do not lower prescribed load unless the user missed rep targets on 2 consecutive sessions for that exercise.
   - Allow at most +1 set per muscle per week, and lower the MRV ceiling by ~20%.
   - Never reduce volume *because of the phase*, only on fatigue (RP) or readiness signals.
   - Maintain-priority muscles may drop to MV (~6 sets/wk, RP `[official]`).
2. **Cut strength-retention signal**
   - Median per-lift e1RM slope ≥ −0.5%/wk → "holding".
   - Median ≤ −1%/wk with ≥50% of lifts declining over 4 weeks → "losing".
   - "Losing" plus bodyweight trend faster than −1%/wk → flag "deficit likely too aggressive" to the nutrition engine (Helms 2014 range).
   - "Losing" plus 7-day mean sleep < 6.5 h → surface sleep first (Nedeltcheva).
3. **Lean bulk**
   - Standard RP progression.
   - If gain rate > 0.5%/wk (Iraki upper bound) and aggregate e1RM is not "improving" over 4 weeks → flag "surplus likely larger than needed" (Helms 2023).
4. **Maintenance** defaults to Grow-level volume. Respect the user's explicit Emphasize choices.

---

## 6. What the repo already does well

All items below are `[repo]`.

1. **One canonical lift-trend authority.**
   - `lib/liftTrend.ts` is "the ONLY place" that classifies a lift as progressing, flat, declining or early. It uses a least-squares slope over the last 6 sessions with a ±1.5% flat band, and needs at least 3 sessions.
   - Aggregation is honest: majority-of-readable rule, with "limited" when most lifts are early.
   - This is exactly the discipline a physique engine needs.
2. **A strict plateau detector.** `lib/plateauSignal.ts` requires no net progress (latest ≤ start × 1.01) *and* a slope ≤ 0. That avoids false positives from peak-then-pullback, and it sub-classifies flat, net-flat-with-variance and declining. It fits PRODUCT.md's rule that "false positives kill credibility".
3. **Consistent signal states.** `lib/signalStatus.ts` gives single-source `{state, status}` values for the Plateau, Progress and Volume cards.
4. **Logging basics at Hevy parity:**
   - Previous set values as per-set placeholders, with tap-done committing them.
   - Optional per-set RIR (0–5).
   - Per-set notes with the last note as placeholder.
   - Per-exercise rest timer with auto-start, vibrate and sound settings, and persistence through reloads.
   - Draft persistence and resume (`lib/activeWorkout.ts`, `components/ActiveWorkoutResumeBar.tsx`, `StaleSessionModal.tsx`).
   - Drag reorder (`components/SortableList.tsx`), replace exercise, save or overwrite template with a diff.
   - Edit and delete past workouts (`app/history/page.tsx`).
5. **A rich exercise metadata model.** `lib/exerciseMetadataLibrary.ts` records primary, secondary, direct and indirect stimulus muscles, movement pattern, role, equipment, fatigue cost, substitutes, length bias and redundancy group. `lib/exerciseSubstitutions.ts` ranks substitutes with explained reasons. That is a better foundation than the "smart substitutions" MF documents.
6. **Fractional set counting** (direct 1, indirect 0.5) in `lib/muscleSetCounting.ts`, consistent with Pelland et al. and Hevy.
7. **Encoded volume and progression knowledge:** `lib/trainingKnowledge/volumeRules.ts` (per-muscle MEV-like minimums, target ranges, soft and hard upper warnings), `progressionRules.ts` (load jumps by role, target RIR 1–3) and `rirDecisions.ts`.
8. **Hevy and Strong import** with RPE→RIR conversion and warm-up skipping (`lib/csvImport.ts`), plus a stable per-set CSV export (`lib/exportWorkoutsCsv.ts`).
9. **Evidence cards attached to decisions** (`lib/evidenceMapping.ts`, `lib/evidenceCards.ts`). This is the natural home for MF-style "why this recommendation" explanations.

**Modules a physique engine can reuse directly**
- **e1RM and trends:** `estimateE1RM` and `getBestSet` (`lib/trainingMetrics.ts`); `classifyE1rmSeries`, `leastSquaresSlope`, `aggregateLiftTrends` and `isPlateau` (`lib/liftTrend.ts`); `detectPlateauForLift` (`lib/plateauSignal.ts`).
- **Volume:** `estimateWeeklyMuscleVolumeFromWorkouts` (`lib/muscleAwareWeeklyVolume.ts`); `getVolumeRule` (`lib/trainingKnowledge/volumeRules.ts`) for seeding MV, MEV and MRV.
- **Exercise data:** `getRankedSubstitutes` (`lib/exerciseSubstitutions.ts`); `ExerciseMetadata.role`, `fatigueCost` and `equipment` for progression caps and set distribution; `getCompletedLoggedSets` (`lib/completedSets.ts`).
- **Recovery and fatigue:** `detectLikelyUnderRecovery` and `shouldReduceVolumeNextSession` (`lib/trainingKnowledge/recoveryHeuristics.ts`), currently fed by flags that no UI collects; `getSessionFatigueScore` (`lib/trainingKnowledge/fatigueScoring.ts`).
- **Patterns to extend:** the `signalStatus` pattern, for a new "Strength retention" signal shown only during a cut; `CoachDecision` and `nextSessionAdjustments` as the decision → instruction layer (`lib/trainingDecisions.ts`, `lib/nextSessionAdjustments.ts`).

**Repo issues that matter for the physique build**
- **Three divergent progression implementations:**
  1. `getTargetDataForExercise` in `app/workout/page.tsx` ignores RIR, emits strings with hard-coded "kg" that are relabelled at render, and uses kg-sized jumps for lb users.
  2. `applyDoubleProgression` in `lib/trainingKnowledge/progressionEngine.ts` is RIR-aware but only reaches assistant answers.
  3. `/api/refine-target` sends the base target to **OpenAI gpt-4.1-mini** (`app/api/refine-target/route.ts`). This is non-deterministic and a different vendor from the Anthropic-first assistant.

  The workout card and the assistant can therefore disagree.
- **`liftTrend` input issues:**
  - It uses the heaviest-*weight* set per session (`getBestSet`), not the best e1RM. A heavy triple followed by back-off tens, or rep-range rotation, makes the series noisy.
  - The window is session-indexed (6 sessions), so a lift trained once a week spans ~6 weeks and one trained three times a week spans ~2. Physique judgements need a %/week slope.
  - Epley is uncapped at high reps.
- **Duplicate series extraction:** `extractRecentE1rmSeries` is copy-pasted in `liftTrend.ts` and `plateauSignal.ts`.
- **Two volume systems** (HV-10).

---

## 7. Repo gap analysis

| # | Capability | Competitor reference | Repo status (paths) | Recommendation |
|---|---|---|---|---|
| 1 | RIR-aware set-level progression (expected RTF = mid + RIR) | MF-3 | **Partial**: `lib/trainingKnowledge/progressionEngine.ts`, `rirDecisions.ts` (not wired to the logger); separate heuristic in `app/workout/page.tsx` `getTargetDataForExercise`; LLM `app/api/refine-target/route.ts` | **Must.** One deterministic `lib/progression/` module (section 8). Delete the page heuristic and the refine-target LLM call. |
| 2 | Rep-range expansion, weight match, equipment snapping | MF-4, RP-3 | **Missing**: increments hard-coded (`progressionRules.ts` `loadJumpDefault`; `+2.5/+1.25` in `app/workout/page.tsx`) | **Must.** Per-user equipment profile (plates, bar, DB steps, machine step) with unit-aware increments. |
| 3 | Template rep range and per-set RIR targets; per-week overrides | MF-2, HV-8 | **Missing**: `lib/templateStorage.ts` `TemplateExercise` = name, targetSets, restSec | **Must.** Extend the schema with migration. |
| 4 | Mesocycle with weeks, RIR schedule and deload week | RP-1, RP-4, MF-6 | **Missing**: templates are flat; `lib/programmePipeline/types.ts` has day-level reps/RIR strings only | **Must.** `Program{weeks, deload:"none"\|"first"\|"last"}` with length defaults by experience. |
| 5 | Weekly per-muscle set adjustment from feedback | RP-2 | **Missing**: `lib/nextSessionAdjustments.ts` emits text ("add 2 sets") but holds no state | **Must.** Stateful weekly set targets per muscle (section 8). |
| 6 | Session feedback capture (soreness; optional pump, workload, joint pain) | RP-2, RP-8 | **Missing** | **Must** (soreness, 1 tap per muscle). Others should or optional. |
| 7 | Muscle priorities Emphasize / Grow / Maintain | RP-5, MF-1 | **Partial**: `lib/userProfile.ts` `priorityMuscles` / `deprioritizedMuscles` ("future AI parsing") | **Must.** Structured enum per muscle; cap the number of Emphasize slots. |
| 8 | Deload triggers and auto-deload numbers | DM-1, RP-2, JA-1 | **Missing**: text only (`lib/trainingAnalysis.ts:1489`, `trainingKnowledge/plateauDetection.ts`) | **Must.** Scheduled plus triggered deload (section 8). |
| 9 | Set types W/D/F (warm-ups excluded from analysis) | MF-8, HV-4 | **Missing** in live logging (`lib/activeWorkout.ts` set has no type); import skips Hevy warm-ups | **Must.** Add `type` to the set schema; filter in `getCompletedLoggedSets`. |
| 10 | Supersets | HV-3, MF-8 | **Missing** | **Should.** `supersetId` plus auto-advance. |
| 11 | Warm-up generator | MF-7, HV-5, RP-10 | **Missing** | **Should.** |
| 12 | Plate calculator | HV-6, MF-8 | **Missing** | **Should.** Shares the equipment profile from #2. |
| 13 | Live PR detection and PR list | HV-7, MF-9 | **Missing**: no PR logic found | **Should.** Best e1RM, heaviest weight, reps-at-weight. |
| 14 | Rest timer ±15 s, global default, skip before drop | HV-2 | **Has** (core): `app/workout/page.tsx`, `lib/restTimerSettings.ts`, `components/RestTimerBanner.tsx` | **Should.** Small additions. |
| 15 | Previous values by set index, tap to copy | HV-1 | **Has**: `getLastSetsForExercise` and `toggleSetDone` in `app/workout/page.tsx` | Keep. "Same template" source is later. |
| 16 | e1RM trend per lift | MF-9, Hevy charts | **Has**: `lib/liftTrend.ts`, `components/LiftProgressionSection.tsx`. **Partial** for physique use (heaviest-weight set; session-indexed) | **Must.** Add best-e1RM-per-session (RTF-aware, reps capped) and a time-normalised %/week slope. Keep the existing API. |
| 17 | Plateau detection | Dr. Muscle (plateau + 1RM drop → deload) | **Has**: `lib/plateauSignal.ts` | Reuse as a deload-trigger input. |
| 18 | Weekly sets per muscle (fractional) | HV-10, MF-9 | **Partial**: fractional in `lib/muscleSetCounting.ts` / `muscleAwareWeeklyVolume.ts`; user-facing `lib/volumeAnalysis.ts` counts full primary sets with different ranges | **Must.** One counting method (1 / 0.5, warm-ups excluded) and one landmark table. |
| 19 | Ranked substitutions in the workout | MF-11 | **Partial**: ranker in `lib/exerciseSubstitutions.ts`; Replace in `app/workout/page.tsx` uses the generic `ExercisePicker` | **Should.** Show the top 3 ranked substitutes first. |
| 20 | Program generator questionnaire | MF-1, HV-9 | **Partial**: `lib/onboardingProfile.ts` (goal, days, length, equipment, years, RIR familiarity); generation via the LLM pipeline (`lib/programmePipeline/`) | **Should.** Add split, focus/deprioritise, deload pref, exclusions. Deterministic skeleton; LLM explains. |
| 21 | Readiness (sleep and feel) day modifier | JA-1 | **Missing**: no sleep data; `recoveryHeuristics.detectLikelyUnderRecovery` has no input source | **Should.** Use logged sleep plus an optional 1-tap feel. |
| 22 | Phase-aware training rules | none (MF explicitly doesn't) | **Missing** | **Must.** Section 5 rules keyed on `phase`. |
| 23 | Strength-retention signal during a cut | none | **Missing** | **Must.** New signal via the `lib/signalStatus.ts` pattern; cut only. |
| 24 | Missed-time handling (gap → light session; ≥1 week mid-meso → restart) | RP-7, DM-1, MF-11 | **Missing** | **Should.** |
| 25 | Hevy CSV import correctness (`weight_lbs`, `set_type`, `superset_id`) | HV-11 | **Bug**: `lib/csvImport.ts` reads only `weight_kg` | **Must.** Fix and add a test with a `weight_lbs` header. |
| 26 | CSV export completeness | HV-11 | **Has**: `lib/exportWorkoutsCsv.ts` (own 11-column schema) | **Should.** Add `set_type` and `superset_id` columns. |
| 27 | Exercise library breadth | MF 1,200+; Hevy 400+ | **Partial**: ~65 in `lib/exerciseLibrary.ts`, 26 rich entries in `lib/exerciseMetadataLibrary.ts`, plus custom exercises (`lib/userExerciseLibrary.ts`) | **Later.** Grow the metadata library for exercises that are actually used; prioritise metadata coverage over count. |
| 28 | Calibration first set (hard set 1, easier later sets) | MF-5 | **Missing** | **Should.** A default `rirTargets` pattern. |
| 29 | Left/right, partials, myo sets | MF-8, RP-9 | **Missing** | **Later.** |
| 30 | Muscle body-map, recovery % | MF-9 Levels, FB-1 | **Missing** | **Skip.** Off-brand per PRODUCT.md. |

---

## 8. Progression and autoregulation spec

Plain TS-like pseudocode. Numbers marked `[inferred]` are starting defaults to tune in dogfood. Everything else traces to a card above.

```ts
// ===== Data model additions =====
type SetType = "working" | "warmup" | "drop" | "failure";            // MF-8, HV-4
type LoggedSet = { weight: number; reps: number; rir?: number /*0..6, 6="6+" (MF-3)*/; type: SetType };
type Rx = {                                                          // per exercise in a program week (MF-2)
  exerciseId: string; role: ExerciseRole;                            // lib/exerciseMetadataLibrary.ts
  sets: number; repMin: number; repMax: number;
  rirTargets: number[];                                              // per set; set 1 lower = calibration (MF-5)
};
type Equipment = { barKg: number; platePairsKg: number[]; dbStepKg: number; machineStepKg: number }; // MF-4, HV-6
type Phase = "cut" | "maintain" | "lean_bulk";                       // from nutrition/goal engine
type Priority = "emphasize" | "grow" | "maintain";                   // RP-5
type MuscleWeekFeedback = { soreness?: 1|2|3|4; pump?: 0|1|2; workload?: 1|2|3|4 }; // RP-2

// ===== 1. Set and session metrics =====
const working = (sets) => sets.filter(s => s.type === "working" || s.type === "failure"); // warm-ups never count
const rtf = (s) => s.type === "failure" ? s.reps : (s.rir != null ? s.reps + Math.min(s.rir, 6) : null);
const expectedRTF = (rx, i) => (rx.repMin + rx.repMax) / 2 + rx.rirTargets[i];          // MF-3 rule
const setDelta = (s, rx, i) => rtf(s) == null ? null : rtf(s) - expectedRTF(rx, i);      // >0 beat expectation

const setE1RM = (s) => s.weight * (1 + Math.min(rtf(s) ?? s.reps, 12) / 30);             // Epley on RTF; cap 12 [inferred]
const sessionE1RM = (ex) => Math.max(...working(ex.sets).map(setE1RM));                   // FIX: best e1RM, not heaviest weight
const smoothedE1RM = (series) => ewma(series, 0.4);                                       // [inferred] damp noise

// ===== 2. Next-session targets per exercise (replaces the 3 current implementations) =====
function nextTargets(rx: Rx, hist: ExerciseSession[], ctx: { eq: Equipment; phase: Phase; readiness: "low"|"ok";
                                                          expandRepRange: boolean }) {
  if (hist.length === 0) return blankTargets(rx);                    // MF-3/RP: no load until first log
  const e = smoothedE1RM(hist.map(sessionE1RM));
  const lastW = topWorkingWeight(hist.at(-1));
  const midReps = Math.round((rx.repMin + rx.repMax) / 2);
  const maxStep = rx.role === "isolation" || rx.role === "accessory" ? 0.10 : 0.05; // RP-3 "few %" [inferred]

  // Fallback when RIR is missing on most sets: classic double progression
  if (rirCoverage(hist.at(-1)) < 0.5) return doubleProgression(rx, hist, ctx.eq);

  return rx.rirTargets.map((rir, i) => {
    let w = e / (1 + (midReps + rir) / 30);                          // load that yields mid reps @ target RIR
    w = Math.min(w, lastW * (1 + maxStep));
    if (ctx.phase === "cut" && w < lastW && !missedTargetsTwice(rx, hist)) w = lastW;   // keep intensity on a cut (sec. 5)
    if (ctx.readiness === "low") w = Math.min(w, lastW);             // JA-1: never raise load on a low day
    const wSnap = snapToEquipment(w, ctx.eq, rx.exerciseId);         // MF-4
    let reps = Math.round(30 * (e / wSnap - 1) - rir);
    if (reps >= rx.repMin && reps <= rx.repMax) return { weight: wSnap, reps, rir: rir + (ctx.readiness === "low" ? 1 : 0) };
    if (ctx.expandRepRange) {                                        // MF-4 Expand Rep Range + Weight Match
      const r2 = Math.round(30 * (e / lastW - 1) - rir);
      if (r2 >= rx.repMin - 2 && r2 <= rx.repMax + 3) return { weight: lastW, reps: r2, rir, note: "range-expanded" };
    }
    return { weight: wSnap, reps: clamp(reps, rx.repMin, rx.repMax), rir, flag: "progression-unavailable" }; // MF wand "Fix"
  });
}

function doubleProgression(rx, hist, eq) {                           // existing repo idea, made deterministic
  const last = working(hist.at(-1).sets);
  if (last.every(s => s.reps >= rx.repMax)) return same(rx, topWeight(last) + increment(eq, rx));
  if (lastTwo(hist).every(h => working(h.sets).some(s => s.reps < rx.repMin))) return same(rx, topWeight(last) - increment(eq, rx));
  return same(rx, topWeight(last), /*reps*/ "+1 vs last");
}

// ===== 3. Weekly set adjustment per muscle (RP-2, RP-5, RP-6) =====
function perfScore(m, week, prevWeek): 1|2|3|4 {                     // computed, not asked
  const d = mean(directWorkingSets(m, week).map(setDeltaVsRx));      // MF expectation as the yardstick
  const e1rmDown = shareOfExercises(m, ex => sessionE1RM(week, ex) < sessionE1RM(prevWeek, ex) * 0.985) >= 0.5;
  if (e1rmDown) return 4;                                            // "couldn't match previous week" (1.5% = FLAT_BANDWIDTH)
  if (d >= 1.5) return 1; if (d >= -0.5) return 2; return 3;         // [inferred] cut-points
}
function weeklySetDelta(m, fb: MuscleWeekFeedback, perf, pr: Priority, phase: Phase): number | "recovery" {
  const sore = fb.soreness ?? 2;                                     // default "healed early" if unanswered
  if (perf === 4) return "recovery";                                 // RP: recovery session / deload
  let d = 0;
  if (perf === 1 && sore === 1) d = 2;                               // RP: add 2-3
  else if (perf <= 2 && sore <= 2) d = 1;                            // RP: add 1
  else if (sore === 4 && perf >= 3) d = -1;                          // RP app: "can't heal on time ... fewer sets"
  if (fb.pump === 0 && d >= 0 && sore <= 2) d = Math.max(d, 1);      // RP app: low pump -> more sets
  if (fb.workload === 4) d = Math.min(d, 0);                         // "too much volume" -> no increase
  if (pr === "grow") d = Math.min(d, 1);
  if (pr === "maintain") return 0;                                   // pinned at MV
  if (pr === "emphasize" && perf === 1 && sore === 1) d = 3;
  if (phase === "cut") d = Math.min(d, 1);                           // sec. 5 [inferred cap]
  return d;
}
function applyWeek(m, d, current, level, pr, phase) {
  const L = landmarks(m, level);                                     // seed from lib/trainingKnowledge/volumeRules.ts
  const mrv = phase === "cut" ? Math.round(L.mrv * 0.8) : L.mrv;     // [inferred]
  if (d === "recovery") return { nextSession: Math.ceil(current * 0.5), flagRecovery: true }; // DM-1 halving
  const ceiling = pr === "grow" ? L.mev + 4 : mrv;                   // RP Grow ~MEV [inferred +4]
  const floor = pr === "maintain" ? L.mv : L.mev;
  return { weekly: clamp(current + d, floor, ceiling) };
  // Distribute added sets to the exercise with the lowest fatigueCost and the best recent setDelta [inferred]
}

// ===== 4. Mesocycle, deload, gaps =====
const accumWeeks = { novice: 6, intermediate: 5, advanced: 4 };     // within RP ranges (<=8 / 4-7 / 3-6)
const rirForWeek = (w, role) => role === "isolation" ? Math.max(0, 3 - w) : Math.max(1, 3 - w); // RP-4 (changed for compounds)
const deloadWeek = (lastWeek) => ({ setsFactor: 0.5, loadFactor: 0.9, rirMin: 4 });             // DM-1 numbers, RP MV floor

function earlyDeload(state): boolean {                               // any trigger
  return countMuscles(state.lastWeek, m => m.perf === 4) >= 2
      || anyMuscle(m => m.perfHistory.slice(-2).every(p => p === 4))
      || aggregateLiftTrends(statusesOverLast(14 /*days*/)) === "declining"   // reuse lib/liftTrend.ts
      || state.readinessLowCount(last = 5) >= 3                     // JA-1 style [inferred]
      || (state.phase === "cut" && strengthRetention(state) === "losing");
}
function gapAdjust(daysSinceLastForLift, mesoWeek) {
  if (daysSinceLastForLift >= 10) return { loadFactor: 0.9, rirBump: +1 };     // DM-1 "light session" (exact % unpublished) [inferred]
  if (missedDaysInMeso >= 7 && mesoWeek < lastAccumWeek) return "restart-meso"; // RP-7
}

// ===== 5. Physique cross-signals (training -> goal engine) =====
function e1rmSlopePctPerWeek(lift, days = 28) {                      // time-normalised; reuse leastSquaresSlope with x = days
  const pts = sessionsWithin(lift, days).map(s => ({ x: dayIndex(s), y: sessionE1RM(s) }));
  return pts.length >= 4 ? (slope(pts) * 7) / pts[0].y : null;
}
function strengthRetention(state): "holding" | "losing" | "unclear" { // cut only
  const slopes = trackedLifts(state).map(e1rmSlopePctPerWeek).filter(nonNull);
  if (slopes.length < 3) return "unclear";                           // honest cold start (PRODUCT.md)
  const med = median(slopes);
  if (med >= -0.005) return "holding";
  if (med <= -0.01 && share(slopes, s => s < -0.005) >= 0.5) return "losing";
  return "unclear";
}
function crossFlags(state) {
  const flags = [];
  if (state.phase === "cut" && strengthRetention(state) === "losing") {
    if (state.bwTrendPctPerWeek < -1.0) flags.push("deficit-too-aggressive");     // Helms 2014: 0.5-1%/wk
    if (state.sleep7dMeanH < 6.5) flags.push("sleep-limiting-retention");          // Nedeltcheva 2010
  }
  if (state.phase === "lean_bulk" && state.bwTrendPctPerWeek > 0.5
      && aggregateLiftTrends(statusesOverLast(28)) !== "improving") flags.push("surplus-larger-than-needed"); // Iraki 2019, Helms 2023
  return flags;                                                      // the assistant explains; the engine decides
}
```

**Implementation notes for the coding agents**
- **Put all of this in a new pure module** (e.g. `lib/progression/`) with unit tests. The workout page, assistant context (`lib/coachStructuredAnalysis.ts`) and signals should all call it, and nothing else should compute targets.
- **Keep `lib/liftTrend.ts` exports stable** (the Progress tab, Plateau signal and assistant depend on them). Add `sessionE1RM` / `e1rmSlopePctPerWeek` alongside, then migrate `extractRecentE1rmSeries` (duplicated in `lib/plateauSignal.ts`) to the shared version.
- **Store weekly per-muscle set targets and feedback in localStorage** next to `workoutHistory`, under a versioned key, with a migration for templates that lack `repMin`, `repMax` and `rirTargets` (default from role: compound 6–10 @ [1,2,2,3], isolation 10–15 @ [0,1,2,2] `[inferred]`).

---

## 9. Couldn't verify

- MacroFactor's exact rep and RIR tables for Linear, Reverse Linear and Undulating schemes; its deload numbers; its secondary-muscle set attribution; and its internal "strength/endurance relationship" model.
- RP's exact in-app feedback wording, the joint-pain question and its effect, the official week-by-week RIR schedule, and deload set and load percentages.
- Hevy's CSV weight column naming rule (`weight_lbs` always, or unit-dependent). Check a real export before shipping the import fix, and support both names regardless.
- Fitbod's recovery decay formula; Juggernaut's readiness weights; Dr. Muscle's plateau definition.
