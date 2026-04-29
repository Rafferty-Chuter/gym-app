---
register: product
source: Sourced from Obsidian vault Product/Positioning.md and Decisions/2026-04-29-assistant-first-product-direction.md (vault is canonical for intent; this file mirrors it for the impeccable skill).
last_synced: 2026-04-29
---

# Product

## Tagline

The AI training partner that catches what your coach would miss.

Not a logger with AI bolted on. Not a chatbot. A diagnostic tool for serious lifters who already track their training and want to know what their data is telling them.

## Users

Intermediate to advanced **natural** lifters, 20–40, with 2–6 years of training experience. Already logging in Hevy, Strong, or a Notes app. Spend on fitness (creatine, protein, sometimes a coach or RP App). Read or watch Jeff Nippard, Mike Israetel, Eric Helms.

They know what RIR means. They get annoyed when fitness advice is dumbed down or when an app tells them obvious things ("try eating more protein"). They want a peer, not a cheerleader.

Roughly 2–3M of them in English-speaking markets.

## Product purpose

The product is **assistant-first** (decided 2026-04-29 after a month of founder-as-user dogfood). The Claude Sonnet assistant at `app/api/assistant/route.ts` is the primary surface and the central feature.

A rules engine (`lib/coachStructuredAnalysis.ts → buildCoachStructuredAnalysis`) detects training signals as `CoachDecision` objects. These signals do two things:

1. Power a glanceable status dashboard with three indicators: **Plateau**, **Weekly Volume**, **Progression**. Visual indicators only. No prose walls.
2. Feed the assistant as contextual grounding so it answers with reference to the user's actual training, not generic science.

Logging is competitive infrastructure: if it's slower than Hevy, no one stays long enough to see the rest.

## Brand and tone

Precise. Evidence-based. Treats the reader as a peer who already lifts seriously.

- Specific over generic. "Incline press has stalled 4 weeks" beats "your chest needs more volume."
- Grounded in the user's own data, never in vague science.
- Comfortable with technical vocabulary (RIR, MEV/MRV, fatigue management). No glossary tooltips for things this audience already knows.
- Quiet by default. Surfaces when there's something genuinely useful to say.
- Confident, not hedged. False positives ("you should squat more") are fatal — but so is mush.
- Calm. Not motivational. Not gamified. No streaks, no confetti, no "Crush it!"

## Anti-references

The product must not feel like:

- **A bro-app.** Hype copy, motivational quotes, neon gradients, "BEAST MODE."
- **A wellness/Calm-style app.** Soft pastels, abstract shapes, mindful language.
- **A generic fitness chatbot.** Answers detached from the user's logged data.
- **A SaaS dashboard.** Hero-metric template, identical card grids, "you're crushing it!" empty states.
- **A consumer Apple Health clone.** All charts, no judgement, no opinion.
- **Hevy with a coach bolted on.** The assistant must feel like the product, not a feature.

## Strategic principles

- **Insight quality > breadth.** Three good insights beat ten obvious ones. False positives kill credibility with this audience faster than silence.
- **The assistant is the product.** Make it feel alive on the home screen, not buried behind a tab.
- **Logging is sacred.** Whatever the home screen does, Start Workout must remain the dominant interactive element.
- **Glanceable, not interpretive, on the dashboard.** The three indicators say "where am I?" The assistant says "why, and what now?"
- **Cold-start handled honestly.** No fake data, no premature insights. Empty state is a real state, designed deliberately.
- **The audit pipeline (CSV import) is a separate AI surface from the chat assistant.** Different inputs, different output format, different failure mode. Out of scope for the home-screen rebuild.

## Design implications

- Logging UX must be at-or-faster than Hevy. The home Start Workout button is a load-bearing piece of that.
- The assistant card on the home screen must always show something real from the user's data, never a generic "Chat with your coach" prompt. If there is no data yet, show an honest cold-start prompt that names what's missing.
- The three indicators must be glanceable in under a second. Colour + icon + a short label. No prose, no charts on the home view (a chart can live in the indicator detail).
- Bottom nav: Home, Log, History. The assistant lives on Home, not as a separate tab.
