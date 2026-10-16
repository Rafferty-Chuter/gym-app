# CLAUDE.md

Guide for any Claude Code session working in this repo. Read it in full before changing code.

## What this is

A Next.js 16 (app router) + React 19 + Tailwind 4 web app. It started as an assistant-first gym training coach for intermediate-to-advanced natural lifters (see `PRODUCT.md`). It is now being expanded into a **physique coach**. The user sets a goal such as "90 kg lean", logs food, bodyweight, training and sleep, and a deterministic engine judges whether the plan is working. The Claude-powered assistant explains the verdicts.

**The build plan lives in `docs/plan/`. Start at `docs/plan/README.md`.** Work is done one ticket at a time; tickets are in `docs/plan/04-tickets.md` and progress is tracked in `docs/plan/STATUS.md`.

## Commands

| What | Command | Notes |
|---|---|---|
| Install | `npm ci` | |
| Dev server | `npm run dev` | http://localhost:3000 |
| Typecheck | `npx tsc --noEmit` | must pass |
| Lint | `npx eslint` | baseline was 41 errors / 130 warnings before ticket F1; after F1, `npx eslint` must exit 0 |
| Volume rules script | `npx tsx scripts/test-volume-rules.ts` | 10/10 pass |
| Unit tests | `npm test` | added in ticket F1 (vitest) |
| Everything | `npm run check` | added in F1: tsc + eslint + tests |
| LLM evals | `npm run eval` | needs the dev server running and `ANTHROPIC_API_KEY` in `.env.local`; spends money |

Environment: `.env.local` (gitignored) holds `ANTHROPIC_API_KEY` (required) and `OPENAI_API_KEY` (only used by `/api/refine-target`).

## Map

- `app/` holds pages, all client components reading browser storage. The live tabs are Home `/`, Templates, History and Profile (`components/BottomTabs.tsx`). Logging is `/workout` (2.4k lines; treat as sacred, keep it fast). The assistant chat is `/assistant`; signal details are `/signal/[key]`.
- `app/api/assistant/route.ts` is the assistant pipeline (4.1k lines; being split in ticket F4). It builds cached system blocks: STATIC prompt → USER PROFILE → USER CONTEXT → USER MEMORY. **All 4 prompt-cache breakpoints are used**, so new blocks ride the last system breakpoint.
- The rules engine pattern to copy is `lib/liftTrend.ts`, `lib/plateauSignal.ts` and `lib/signalStatus.ts`: one canonical module per verdict, exported threshold constants with rationale comments, pure functions, `{state, status}` results.
- Storage is browser localStorage (21 keys). The full key registry is in `docs/plan/research/E-codebase-audit.md` §1.4. New data goes through `lib/storage/` once ticket F3 lands.
- Physique code goes in `lib/physique/` (pure engine), `components/physique/` and `app/body/`. See `docs/plan/03-architecture.md`.

## Rules

1. **Engines are pure.** No localStorage, `window` or `Date.now()` inside engine code; pass `now` and data in. Every threshold is an exported constant with a one-line rationale and, for physique rules, a citation id from `docs/plan/02-engine-spec.md`.
2. **The LLM never does the maths.** Numbers (trend weight, expenditure, targets, verdicts) come from the deterministic engine; the assistant explains them and must not contradict them.
3. **Silence beats false positives.** Every verdict has a minimum-data gate. Below it, show an honest "Early read" or "Not enough data" state.
4. **Canonical units in storage.** kg, cm, kcal, grams, minutes. Convert only for display, via `lib/units.ts` (ticket F3). Never rewrite stored records when the display unit changes.
5. **Records have stable ids** (`crypto.randomUUID()`), a local `date` (`YYYY-MM-DD`), `loggedAt` (ISO), `source` and `schemaVersion`.
6. **Hotspot files have one owner at a time:** `app/page.tsx`, `app/assistant/page.tsx`, `app/signal/[key]/page.tsx`, `app/api/assistant/route.ts` (and its split modules), `app/workout/page.tsx`. Put new code in new files; keep edits to hotspots small and serial.
7. **Don't extend the `PriorityGoal` string enum.** It is regex-matched in 3 places. The physique goal is a separate `PhysiqueGoal` entity.
8. **Model ids live in one constant** (`lib/ai/models.ts`, created in ticket F3). Don't hard-code model strings elsewhere.
9. **Every paid API route** validates its body (zod), checks the daily cap after validation, and logs cost.
10. **Health data is sensitive.** Never log raw food, weight or sleep values to server logs. Never send them anywhere except our own API routes and the Anthropic API.

## Conventions

- TypeScript `type` aliases (not `interface`), string-literal unions for states, `as const` for enums, `strict` on. Absolute imports via `@/`.
- `lib/` files are flat camelCase; components are PascalCase default exports in `components/`; route-local components go in `app/components/`.
- 2-space indent, double quotes, semicolons, trailing commas.
- JSDoc on exported functions and constants explaining the rule and why. Section dividers look like `// ── Title ──`.
- Storage access is always wrapped in `try/catch` with a `typeof window === "undefined"` guard.
- UI copy: calm, specific, peer-level, hedged where data is thin ("Early read", "Trending up"). No hype, streaks, confetti or exclamation marks. See `PRODUCT.md` anti-references.
- Visual language: dark surfaces (`#080b12`, `#0e1420`), mint accent `#00e5b0`, status colours good `#00e5b0` / watch `#fbbf24` / attention `#fb7185`. Charts are hand-rolled SVG. Note that `bg-zinc-*` classes are globally re-skinned in `app/globals.css`.

## Commit style

Short imperative subject, optionally prefixed with the ticket id (`P1.3: weight trend engine`). The body explains why, then lists `- file: change` bullets, then a "Schema impact:" paragraph if stored data changed. Commit after each ticket passes its checks.

## Before you say a ticket is done

1. `npx tsc --noEmit` passes; `npx eslint` shows no new problems; `npm test` passes (once it exists).
2. The ticket's acceptance criteria in `docs/plan/04-tickets.md` are each checked, with evidence (test name, screenshot path, or command output).
3. UI changes are looked at in a real browser (use the `run` skill; Playwright and Chromium are preinstalled in cloud sessions). Check phone width (390px).
4. `docs/plan/STATUS.md` is updated.
