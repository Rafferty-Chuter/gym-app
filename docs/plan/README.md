# Physique coach: build plan

**Goal.** Turn the gym app into a physique coach. You set a goal ("90 kg, lean"); you log weight, food, training and sleep; one deterministic engine judges whether it's working and recommends one change; the assistant explains it in your numbers.

**Who builds it.** Claude Code sessions running the Fable model, one ticket at a time, following this plan.

Written 2026-10-16. Status lives in [`STATUS.md`](STATUS.md).

---

## Start here

| If you are… | Read |
|---|---|
| You (the founder), deciding things | this README → [01 Product spec](01-product-spec.md) → the open decisions below |
| A Fable session starting work | `CLAUDE.md` (repo root) → this README → [04 Tickets](04-tickets.md) → [`STATUS.md`](STATUS.md) → your ticket's "Read first" files |
| Working on the engine | [02 Engine spec](02-engine-spec.md) (normative) |
| Working on architecture or data | [03 Architecture](03-architecture.md) |
| Working on UI | [05 Design](05-design.md) + the `impeccable` and `dataviz` skills |
| Setting up tools | [06 Tooling](06-tooling.md) |

The `research/` folder holds six cited reports. The specs are built from them, and each spec says which report backs each choice:

| Report | Covers |
|---|---|
| [A](research/A-macrofactor-nutrition.md) | MacroFactor teardown and the calibrated expenditure algorithm |
| [B](research/B-training-apps.md) | MacroFactor Workouts, RP, Hevy; training-by-phase rules |
| [C](research/C-sleep-recovery.md) | Bevel, WHOOP, Oura, Apple; sleep and recovery spec |
| [D](research/D-architecture-tooling.md) | Health data route, backend, food data, compliance, Claude Code tooling |
| [E](research/E-codebase-audit.md) | Audit of this repo |
| [F](research/F-evidence-rules.md) | Scientific evidence and the judge's rule table |

---

## Decisions

### Made (from your answers on 2026-10-16)

| # | Decision |
|---|---|
| ✅ | **iPhone only; sleep from Apple Watch; just you for the next few months.** |
| ✅ | **Keep the web app now.** Apple Health arrives in M3 through the Health Auto Export app (£6.99/yr) pushing to our own endpoint. A native Capacitor shell comes only when testers arrive (M7). |
| ✅ | **Build on proven apps, not invention.** The calorie engine replicates MacroFactor's published algorithm, training follows MacroFactor Workouts and RP, sleep follows Apple, WHOOP and Bevel, and the verdicts follow the cited evidence (research F). |
| ✅ | **The judge recommends goal changes, never ad-hoc calorie tweaks,** and checks adherence before strategy (02 §0, §8). |

### Open (each has a default; the build uses the default unless you change it here)

| # | Question | Default | Notes |
|---|---|---|---|
| D1 | Backend for M3 | Supabase, London | Needed when Apple Health data starts arriving. Free tier while it's just you. |
| D2 | Food database for M4 | UK CoFID + USDA + Open Food Facts | No paid nutrition API. |
| D3 | AI models | New food parsing on `claude-opus-5-5` (≈ 1p per parse). The assistant stays on its current model until F5. | Cheaper options for food parsing are `claude-sonnet-5-5` or `claude-haiku-5-5`; the trade-off is cost against estimate quality. Your call. |
| D4 | Update `PRODUCT.md` with the physique positioning | Yes: F1 applies `01-product-spec.md` §5 | Your Obsidian vault is the canonical copy, so mirror it there too. |
| D5 | Calorie floors | 1,500 kcal (male) / 1,200 kcal (female) | Hard floor with a warning. |
| D6 | Body tab | 5 tabs: Home, Body, Templates, History, Profile | |

---

## Milestones

| | Outcome | Your steps | Size |
|---|---|---|---|
| **M0** | Data backed up; sessions ready | H1, H2 (15 min) | — |
| **M1** | **Body tab: log weight, food and sleep; trend chart; adaptive maintenance; goal and targets; weekly check-in; verdicts that combine rate, adherence, lifts and sleep; assistant answers "is it working?"** | log daily | ~10–14 h of agent time on the ★ path, plus ~6 h for the rest |
| M2 | Codebase hardened: route split, tests, storage seam for workouts, model migration | — | ~1–2 days |
| M3 | Accounts + Supabase; Apple Watch sleep, HRV, RHR and scale weight flowing in automatically; recovery status | H3, H4 (Supabase project, Health Auto Export) | ~2–3 days |
| M4 | Proper food logging: UK/US database search, barcode, grounded AI and photo logging | — | ~2–3 days |
| M5 | Training engine: one progression module, RP-style weekly volume, deloads, phase-aware training | — | ~3–4 days |
| M6 | The plan itself: phase planner to "90 kg lean", program generator, weekly review, morning brief | — | ~2–3 days |
| M7 | Testers: Capacitor iPhone app, HealthKit in-app, consent, TestFlight | Apple developer account | ~1 week |

**By the morning.** The ★ path in `04-tickets.md` puts **logging first**: weight, food and sleep on the Body tab with the trend chart. Your data starts building up immediately, which matters because the judge can't speak until there are about 14–21 days of data. The engine, goal, verdicts and assistant integration follow in the same run. If the run hasn't finished by morning, you can still log, and the rest lands later in the day.

---

## Kickoff prompts (paste into a Fable session)

**Overnight run (M1 critical path):**

```
Read CLAUDE.md and docs/plan/README.md. Then work through the ★ tickets in docs/plan/04-tickets.md in the listed order (F1 → F3 → P1 → P2 → U1 → U2a → I1 → P3 → U3 → P4 → P5 → U2b → I2 → V1), using the /next-ticket protocol for each one: read its "Read first" files, implement, meet every acceptance criterion with evidence, run npm run check and /code-review, update docs/plan/STATUS.md, commit, and push. Work on branch physique/m1. Don't stop between tickets. If a ticket is blocked, record why in STATUS.md, skip only what depends on it, and continue. When done, summarise what works, what's verified, and what's left.
```

**A single ticket:** `/next-ticket P3`

**The rest of M1** (after the ★ path): `/next-ticket` repeatedly; it picks the next unblocked ticket from STATUS.

---

## Session protocol

The `/next-ticket` skill encodes this.

1. **Orient.** Read `CLAUDE.md`, this README and `STATUS.md`. Pick the named ticket, or the first ★/unchecked ticket whose dependencies are done.
2. **Read.** The ticket, its "Read first" files, and the code it touches. Load the skills it lists.
3. **Plan briefly.** If the ticket's spec conflicts with the code or another doc, the spec order of precedence is 02 > 03 > 04 > research. Record any deviation in STATUS.
4. **Build.** Engine tickets are test-first. UI tickets use the `impeccable` skill; charts use `dataviz`.
5. **Verify.**
   - `npm run check` (once F1 lands; until then, `npx tsc --noEmit`, plus `npx eslint` showing no new problems);
   - every acceptance box ticked, with evidence;
   - UI tickets: the `run` skill and screenshots at 390 px saved under `docs/plan/screens/<ticket>/`.
6. **Review.** `/code-review medium` on the diff; fix what it finds.
7. **Record.** Update `STATUS.md` (status, date, evidence, deviations, follow-ups). Commit with `<ticket id>: <summary>` and the repo's commit style. Push.
8. **Report.** What changed, how it was verified, and what's next.
