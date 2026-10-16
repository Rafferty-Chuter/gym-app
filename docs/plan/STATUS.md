# Status

Working branch: _(set by the first session)_


Update this file at the end of every ticket. Statuses: `todo` · `doing` · `done` · `blocked` · `skipped`.

## M0 — Your setup
| Ticket | Status | Date | Evidence / notes |
|---|---|---|---|
| H1 Back up + Home Screen | todo | | |
| H2 Prepare sessions | todo | | |
| H5 Ship M1 to your phone (after the run) | todo | | merge to main only when ★ tickets through U2a + I1 are done and `npm run build` passes |

## M1 — Body layer MVP (★ = morning critical path, in this order)
| Ticket | Status | Date | Evidence / notes |
|---|---|---|---|
| ★ F1 Tooling, check, lint baseline, session hook | todo | | |
| ★ F3 Foundations (stats, dates, units, storage, models, API guard) | todo | | |
| ★ P1 Physique types + repos | todo | | |
| ★ P2 Weight engine + fixtures | todo | | |
| ★ U1 UI primitives | todo | | |
| ★ U2a Body page: logging + trend chart | todo | | |
| ★ I1 Nav + home card | todo | | |
| ★ P3 Intake, expenditure, targets | todo | | |
| ★ U3 Goal setup | todo | | |
| ★ P4 Strength + sleep | todo | | |
| ★ P5 Judge, status, check-in plan | todo | | |
| ★ U2b Body page: verdict, energy, strength, sleep | todo | | |
| ★ I2 Assistant integration | todo | | |
| ★ V1 Seed scenarios + end-to-end check | todo | | |
| F2 Data-corrupting bug fixes (after V1) | todo | | |
| U4 Food day log | todo | | |
| A1 "Describe it" AI food estimate | todo | | |
| U5 Weekly check-in | todo | | |
| I3 Physique evals | todo | | |

## M2 — Hardening
| Ticket | Status | Date | Evidence / notes |
|---|---|---|---|
| F4 Split assistant route | todo | | |
| F5 Model migration | todo | | |
| F6 Characterisation tests | todo | | |
| F7 Workouts onto storage seam | todo | | |
| F8 API hardening | todo | | |
| F9 Dead code removal | todo | | |

## M3 — Accounts + Apple Watch
| Ticket | Status | Date | Evidence / notes |
|---|---|---|---|
| H3 You: Supabase project + keys | todo | | |
| S1 Schema + RLS | todo | | |
| S2 Auth | todo | | |
| S3 Local-first sync | todo | | |
| S4 Browser data import | todo | | |
| S5 Health Auto Export ingest | todo | | |
| H4 You: configure Health Auto Export | todo | | |
| S6 Recovery from HealthKit | todo | | |
| S7 Backups | todo | | |

## M4 — Food · M5 — Training · M6 — The plan · M7 — Testers
| Ticket | Status | Date | Evidence / notes |
|---|---|---|---|
| N1–N7 | todo | | refine each ticket before starting |
| T1–T8 | todo | | refine each ticket before starting |
| G1–G5 | todo | | refine each ticket before starting |
| X1–X5 | todo | | refine each ticket before starting |

## Dogfood log
Record wrong or surprising verdicts here: date · what the app said · what you think was true · screenshot.

| Date | Verdict shown | Your read | Notes |
|---|---|---|---|

## Decisions changed
| Date | Decision | From → to | Why |
|---|---|---|---|

## Review notes (2026-10-16)
Two independent reviews ran before any code was written: executability, and sports science/algorithm. The main changes:
- **Two-layer fix.** The judge only changes the goal when the goal itself is out of range. When the goal is in range and the user is adherent, it uses `refresh_targets`. Every recommendation passes direction checks, so a "slow the cut" can never deepen the deficit. (02 §0, §8.2)
- **Sleep-1 promotion.** SLEEP-1 becomes primary when it blocks the recommendation of an outcome rule.
- **Test feasibility.**
  - Rate accuracy is now ±0.4 at 28 days and ±0.5 at 21 days. The earlier ±0.3 at 21 days was impossible: simulated 72–81% against a required 95%.
  - The expenditure stability bound is now ≤8 at φ = 0 and ≤10 at φ = 0.5.
  - The P5 scenarios run over 200 seeds, with a closed-loop "eat to target" generator and a true-TDEE model.
- **Fewer false alarms.**
  - Lean-gain defaults now sit at the band centre. At MacroFactor's "happy medium" defaults, 50–61% of on-plan users got GAIN-1 during a 16-week bulk.
  - GAIN-1 needs 2 consecutive weekly hits.
  - LOSS-6 and GAIN-2 are relative to the goal.
  - ADH-1 has a noise term.
  - The phase-start water shift is excluded from rate windows, with a cooldown after accepted changes.
- **Safety.**
  - No "none" calorie floor.
  - Goals implying more than 1 kg/wk, or a day-0 deficit above 30% of TDEE or 1,000 kcal, are refused.
  - SAFE-0 (no deficit coaching under 18).
- **Assistant.** It no longer re-judges from a truncated payload. The client sends its computed analysis (03 A7), and timezone and "today" come from the client.
- **Autonomy.**
  - Design brief rule: 05-design is the approved brief.
  - Secrets-free acceptance: AI checks are "not run" without a key.
  - `npm run build` before pushing.
  - ESLint suppression pruning.
  - A seed page that never runs in production.
  - Deployment step H5.
- **Golden test.** The maintenance case is corrected to 2,374 (W = trend weight).
