---
name: next-ticket
description: Work one ticket from the physique-coach build plan (docs/plan) end to end, including picking it, implementing, verifying, reviewing, updating STATUS.md, committing and pushing. Use when asked to "do the next ticket", "/next-ticket", "/next-ticket P3", "continue the plan", or "work through the tickets".
---

# Next ticket

Run the build plan's session protocol for one ticket. The plan is in `docs/plan/`.

## 1. Pick the ticket
- If the user named one (e.g. `P3`), use it.
- Otherwise read `docs/plan/STATUS.md` and pick the first ticket that is `todo` and has all its dependencies `done`. **Skip `H*` tickets**: they are the human's. Within M1, follow the ★ order in `docs/plan/04-tickets.md` first.
- If none is unblocked, say which tickets are blocked and why, then stop.
- Set the ticket to `doing` in `STATUS.md`.

## 2. Read
- `CLAUDE.md`, `docs/plan/README.md` (decisions table), and the ticket in `docs/plan/04-tickets.md`.
- Every file in the ticket's "Read first" line, and the existing code the ticket touches.
- Load each skill the ticket lists with the Skill tool (e.g. `impeccable`, `dataviz`, `run`, `claude-api`). For `impeccable`, `docs/plan/05-design.md` is the user-approved brief: record `shape=pass(05-design)` and `image_gate=skipped:autonomous-run`, and use only critique, audit and polish. Never wait for a reply.
- Apply "Rules for autonomous runs" at the top of `04-tickets.md`.
- Precedence when documents disagree: `02-engine-spec.md` > `03-architecture.md` > `04-tickets.md` > `research/*`. Record any deviation you make, and why, in `STATUS.md`.

## 3. Build
- First follow "Working path for anything new" in `CLAUDE.md`: say how the ticket earns its place against the other apps and the person's own effort, then check Mobbin for how two to four leading apps do it and build from the best.
- Engine code in `lib/physique/` is pure (no storage, no `window`, no `Date.now()`), and test-first: write the acceptance tests, watch them fail, then implement.
- New code goes in new files. Keep edits to the hotspot files listed in `CLAUDE.md` small.
- Match the conventions in `CLAUDE.md`.

## 4. Verify
- Run `npm run check`. Before F1 exists, run `npx tsc --noEmit` and check that `npx eslint` shows no new problems. For UI or route changes, also run `npm run build`.
- Criteria that need an API key or human judgement: record "not run" with the reason. They don't block.
- Tick each acceptance box, recording the evidence (test name, command output, or screenshot path).
- UI tickets: use the `run` skill to start the app and screenshot each required state at 390 px wide. Save the screenshots to `docs/plan/screens/<ticket-id>/`. Look at them yourself before claiming the UI works.
- If a criterion can't be met, don't tick it. Record why.

## 5. Review
- Run `/code-review medium` on the ticket's diff (the `code-review` skill). Fix every real finding, then re-run checks.

## 6. Record and ship
- Update `STATUS.md`: status `done` (or `blocked`), the date, the evidence, deviations, and follow-ups as new rows if needed.
- Commit using the repo style: subject `<ticket id>: <imperative summary>`, a body explaining why, then `- file: change` bullets and a "Schema impact:" paragraph if stored data changed.
- Push to the working branch. Retry only transient network errors, up to 4 times with backoff; never retry a 403. On a 403, follow the README kickoff's fallback.
- Time box: if the ticket has run past 2× its size estimate, ship the tested subset, log the rest as follow-ups in STATUS, and move on.

## 7. Report
Three short parts: what changed, how it was verified (with evidence), what's next. If running the overnight sequence, continue to the next ★ ticket instead of stopping.
