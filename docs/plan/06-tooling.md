# 06 — Tooling: skills, plugins, MCP, and running Fable

Research: `research/D-architecture-tooling.md` §6.

**The one thing to know: Claude Code cloud sessions don't install plugins.** Plugins declared in settings are ignored and `/plugin` isn't available. What does load in a cloud session:
- committed `CLAUDE.md`;
- `.claude/skills/*`, `.claude/settings.json` hooks;
- `.mcp.json`;
- skills enabled on your claude.ai account;
- Claude Code's built-in skills.

So anything we want in every session gets **vendored into the repo**.

## 1. Available in every session already

| Skill | Use it for | Tickets |
|---|---|---|
| `impeccable` (vendored in `.agents/skills`, symlinked into `.claude/skills`) | All UI work: shape, craft, critique, polish. Reads `PRODUCT.md`. | U1–U5, I1, N3 |
| `dataviz` (built-in) | Before any chart, stat tile or KPI row | U1, U2 |
| `run` (built-in) | Start the dev server, drive the app with Playwright, screenshot | every UI ticket, V1 |
| `claude-api` (built-in) | Before touching any Anthropic SDK code; `migrate` subcommand for F5 | A1, I2, F5, N4 |
| `session-start-hook` (built-in) | SessionStart hook so cloud sessions can run `npm ci` and tests | F1 |
| `code-review` (built-in) | Review the diff before committing each ticket (`/code-review medium`) | every ticket |
| `simplify` (built-in) | Clean-up pass on large tickets | P3, P5, U2, F4 |
| `security-review` (built-in) | Before S2 (auth), S5 (ingest webhook), X3 (consent) | M3, M7 |
| `next-ticket` (project, `.claude/skills/next-ticket`) | Session protocol: pick, implement, verify and log a ticket | every session |
| `skill-creator` (your claude.ai skill) | Optional: turn repeated patterns into project skills, e.g. an "engine rule" skill | later |

## 2. Vendor into the repo

Commit the results. Set `DISABLE_TELEMETRY=1`.

| When | Command | What you get |
|---|---|---|
| F1 | `npx skills add vercel-labs/agent-skills --skill react-best-practices --skill web-design-guidelines -a claude-code -y` | React/Next performance rules; UI and accessibility rules |
| S1 (M3) | `npx skills add supabase/agent-skills -a claude-code -y` | `supabase`, `supabase-postgres-best-practices` |
| X1 (M7) | `npx skills add uxkin/agent --skill ios-screens --skill ui-states -a claude-code -y` and `npx skills add Cap-go/capgo-skills -a claude-code -y` | Native-feeling iPhone screens; Capacitor plugin wiring |
| Only if you move to Expo | `npx skills add expo/skills -a claude-code -y`; `npx skills@latest add callstackincubator/agent-skills --skill react-native-best-practices` | Expo and React Native |

**Don't install Anthropic's `frontend-design`.** It pushes "bold aesthetic risk", which fights `PRODUCT.md`'s calm brief, and two design skills that trigger automatically will conflict with `impeccable`.

## 3. MCP servers

- **Supabase (M3).** Add to `.mcp.json`:

  ```json
  { "mcpServers": { "supabase": {
      "type": "http",
      "url": "https://mcp.supabase.com/mcp?project_ref=${SUPABASE_PROJECT_REF}&read_only=true",
      "headers": { "Authorization": "Bearer ${SUPABASE_ACCESS_TOKEN}" } } } }
  ```

  Use a scoped personal access token stored as an environment secret, and keep it read-only for anything production.
- **Mobbin.** It's already connected to your account but needs a **paid Mobbin plan**. With one, UI sessions can pull real MacroFactor, WHOOP and Hevy screens (queries in `05-design.md` §8).
- **Playwright.** Not needed as an MCP; the built-in `run` skill drives Chromium, which is preinstalled in cloud sessions.

## 4. If you use Claude Code locally (desktop or CLI)

Plugins work there:
- `claude plugin install supabase@claude-plugins-official` (M3);
- the Expo plugin only if you go the Expo route.

The vendored skills above work in both places.

## 5. Running the build with Fable

- **One session, sequential tickets, is the default.** Paste the kickoff prompt from `README.md`. Fable handles long autonomous runs well; give it the whole task up front (the prompt does) and let it work through the ★ path.
- **Parallel lanes (optional).** After P1, the engine lane (P2 → P3 → P4 → P5) and the UI-primitives lane (U1) touch different files. You can run U1 in a second session, then merge.
  - To have one session orchestrate several agents, say **"use a workflow"** in your prompt. That opts in to multi-agent orchestration, which uses noticeably more tokens. Not needed for M1.
- **Branching.** One branch per milestone (e.g. `physique/m1`), one commit per ticket, and a PR to `main` at the end of the milestone. Vercel previews each push.
- **Review gate.** Each ticket ends with `/code-review` on its diff and `npm run check`. Each milestone ends with you looking at the screenshots and dogfooding.
