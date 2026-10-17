# D — Architecture & Tooling for the physique-coach expansion

Research date: 2026-10-16. Scope: health-data ingestion, backend and accounts, food data, compliance basics, and Claude Code tooling.
Evidence tags: **[official]** = vendor or regulator primary source; **[third-party]** = press, competitor or community source; **[inferred]** = my reasoning from the sources and the repo; **[observed]** = checked live this session (npm registry, repo, API call).

---

## 0. Recommendations (read this first)

Founder constraints (set 2026-10-16): **iPhone only. Sleep comes from an Apple Watch, so HealthKit is the source. One user (the founder) for the next few months, testers later.**

| # | Question | Recommendation | Why, in one line |
|---|---|---|---|
| 1 | Getting health data in | **Phase 1: Health Auto Export (HAE) app → REST webhook → your own endpoint.** Keep an Apple Shortcut as a free manual "Sync now" backup. **Phase 2 (when testers arrive): a Capacitor shell** around the existing Next.js UI, using `@capgo/capacitor-health`. Switch to Expo only if the webview fails the "logging faster than Hevy" bar or you need background delivery, widgets or Live Activities. | HAE gets Apple Watch sleep stages, HRV, resting HR, steps and body mass into a database in about 2 days for £6.99/yr, with no native build. Asking every tester to buy and configure a third-party app does not scale, and TestFlight needs a native binary anyway. |
| 2 | Backend and accounts | **Supabase** (London `eu-west-2`, Postgres + RLS + Auth with email OTP). Keep the AI API routes on Vercel, pinned to region `lhr1`. **Local-first writes**: IndexedDB plus an outbox that upserts to Supabase using client UUIDs. | The webhook can't write into browser localStorage, so a backend has to come in now. Supabase is Postgres (portable, SQL-friendly for the engine), has a UK region, is in the official Claude plugin marketplace, and has a scoped MCP server. |
| 3 | Food data | **CoFID (UK, OGL) + USDA FDC (CC0)** imported into Postgres for generic foods. **Open Food Facts** for barcodes, fetched server-side and cached, with ODbL attribution. **Claude** parses text and photos into *items + grams*; the database supplies the macros. **No paid nutrition API in phases 1–2.** | Photo-only LLM estimates are off by roughly 33–36% (median) for mixed meals and roughly 38% for protein: not good enough for a physique coach. Database grounding plus a grams confirmation fixes most of that. FatSecret's free tiers are US-only data. |
| 4 | Compliance | Phase 1 (founder only): minimal. Before testers: an explicit-consent screen for health data (UK GDPR Art 9(2)(a)), a DPIA, the ICO fee (£52 tier 1), a privacy policy naming Anthropic and OpenAI as AI processors, and wellness-only claims. Before the App Store: guidelines 5.1.3, 5.1.2(i) (third-party AI disclosure), 4.2 and 1.4.1. | Health data is special-category data, and sending it to US LLM providers is the riskiest flow. |
| 5 | Tooling | **Now:** keep `impeccable` (already vendored); add a `CLAUDE.md`; add the **Supabase** plugin (MCP scoped with `project_ref`, `read_only`); add Vercel `react-best-practices`. **Phase 2:** Capgo Capacitor skills, UXKIN `ios-screens`. **If Expo:** the official `expo` plugin, Callstack's `react-native-best-practices` and Vercel's `react-native-guidelines`. Don't add Anthropic's `frontend-design`: it pushes "bold aesthetic risk", which conflicts with PRODUCT.md's "calm, quiet" direction, and `impeccable` already covers that job. **Cloud sessions don't install plugins**, so vendor skills into `.claude/skills/` and MCP servers into `.mcp.json`. | Claude Code cloud sessions ignore `enabledPlugins` and do not support `/plugin` [official]. |

**Phased route, short version:**
- **P0** (this week): `CLAUDE.md`; add the PWA to the Home Screen; export a backup.
- **P1** (weeks 1–3): Supabase, auth, a storage abstraction, the HAE ingest, daily-log tables, and bodyweight/sleep in the engine.
- **P2** (weeks 3–6): food logging (CoFID, USDA, OFF, Claude parsing, barcode via WASM polyfill).
- **P3** (when testers are ~4–6 weeks away): Capacitor shell, HealthKit in-app, TestFlight, compliance pack.
- **P4** (conditional): Expo port, or the App Store.

---

## 1. Repo facts that drive the decisions [observed]

- **Stack:** Next 16.2 (App Router), React 19.2.3, Tailwind 4, `@anthropic-ai/sdk` 0.90, plus **`openai` 6.x**: `refine-target`, `coach-analysis` and two lib helpers call `gpt-4.1-mini`, so health or training data already goes to two US AI vendors. The assistant model is `claude-sonnet-4-6`.
- **Code size:** about 11.7k lines of TSX UI (`app/`, `components/`), about 23k lines of TS logic in `lib/` and `utils/`, and about 4.5k lines of API routes. The logic is pure TypeScript and portable. The UI is DOM plus Tailwind, with about 950 `className=` uses, 13 files with inline `<svg>` charts, and `@dnd-kit`.
- **Persistence:** localStorage is read or written directly in about 25 files. `lib/devDataTransfer.ts` already exports and imports a v1 JSON snapshot of 18 known keys. That is a ready-made migration payload.
- **Dynamic routes:** `app/signal/[key]` (a finite set of keys) and `app/templates/[templateId]` (user-generated IDs). These matter for static export.
- **Client calls:** `fetch("/api/...")` from 3 call sites (relative URLs). These matter for Capacitor.
- **Agent setup:** `skills-lock.json` pins `impeccable` from `pbakaus/impeccable`. The canonical copy is in `.agents/skills/impeccable`, with a symlink at `.claude/skills/impeccable`. Claude Code loads it: it appears in this session's skill list. There is **no `CLAUDE.md`**. `PRODUCT.md` exists and feeds impeccable.
- **Live risk:** Safari deletes *all* script-writable storage (localStorage and IndexedDB) for a site after **7 days of Safari use without interaction with that site**. Home-Screen web apps have their own counter and are effectively exempt [official: https://webkit.org/blog/10218/full-third-party-cookie-blocking-and-more/]. The founder's whole history currently lives there. **P0 action:** use the app from the Home Screen and take a JSON export now.

---

## 2. Q1 — Getting sleep and health data in

### 2.1 Personal-tool route (no native app): Health Auto Export and Apple Shortcuts

Both routes run on the iPhone and **POST to a URL**. Neither can write into the web app's localStorage, so either one **brings a minimal backend forward**: an HTTPS endpoint, a database and an auth token. Section 3 covers the backend. This route is compatible with it: the same `health_samples` tables are reused later by the Capacitor app.

#### (1) Health Auto Export – JSON+CSV (iOS app id 1115567069)

**Status** [observed via App Store lookup API]:
- Version 10.0.4, released 2026-09-29. Requires iOS 17+. Seller: Lybron Sobers. Rating 3.7 from 47 ratings in the UK store.
- Actively maintained. Also offers MCP-server, MQTT, Home Assistant, Dropbox, iCloud and Google Drive outputs.

**Cost (UK)** [official, App Store listing]:
- Basic: £2.99 one-off. Manual export and Shortcuts only.
- **Premium: £1.99/month, £6.99/year or £24.99 lifetime.** Premium is required for background **automations** such as REST API sync.
- 7-day free trial.

**How the REST API automation works** [official: https://help.healthyapps.dev/en/health-auto-export/automations/rest-api/]:
- **Method and body:** HTTP **POST**. `Content-Type: application/json` for JSON, or multipart for CSV.
- **Custom headers:** supported, for example `Authorization: Bearer …` or `X-API-Key`. This is your auth mechanism.
- **App-sent headers:** the app also sends `automation-name`, `automation-id`, `automation-aggregation`, `automation-period` and `session-id`.
- **Date range:** Default, **Since Last Sync**, Today, Yesterday, or Previous 7 Days.
- **Batch Requests:** splits the payload across several POSTs.
- **Payload size:** the docs warn that payloads can be large ("several hundred megabytes" for big exports).
- **Activity log:** shows HTTP status per run, and Manual Export lets you test a date range.

**JSON shape** [official field lists: https://help.healthyapps.dev/en/health-auto-export/export-format and …/export-format/health-metrics; metric enum cross-checked in the vendor's open-source server, https://github.com/HealthyApps/health-auto-export-server, `server/src/models/MetricName.ts`]:

```jsonc
{ "data": {
    "metrics": [
      { "name": "weight_body_mass", "units": "kg",
        "data": [ { "date": "2026-10-15 07:02:00 +0100", "qty": 82.4, "source": "Withings" } ] },
      { "name": "heart_rate_variability", "units": "ms", "data": [ { "date": "…", "qty": 48 } ] },
      { "name": "resting_heart_rate", "units": "count/min", "data": [ … ] },
      { "name": "step_count", "units": "count", "data": [ … ] },
      { "name": "sleep_analysis", "units": "hr",
        "data": [ { "date": "…", "totalSleep": 7.1, "asleep": 0, "core": 4.2, "deep": 1.1, "rem": 1.8,
                    "awake": 0.3, "inBed": 7.6, "sleepStart": "…", "sleepEnd": "…",
                    "inBedStart": "…", "inBedEnd": "…", "source": "Apple Watch" } ] }
    ],
    "workouts": [], "stateOfMind": [], "medications": [], "symptoms": [], "cycleTracking": [], "ecg": [], "heartRateNotifications": []
} }
```

Notes on the shape:
- **Date format:** `yyyy-MM-dd HH:mm:ss Z`.
- **Aggregated vs unaggregated sleep:** aggregated sleep gives a per-night summary, as above. Unaggregated sleep gives `startDate`/`endDate`/`value` per stage segment.
- **Where the example comes from:** the example is assembled from documented field names [inferred shape].
- **Inconsistencies to handle:**
  - The help page names body mass `weight_&_body_mass`, but the vendor's server enum says `weight_body_mass`.
  - The server's sleep schema includes `awake`, but the help page's list doesn't.
  - On iOS 27+, `source` may be omitted for some cumulative types [official].
  - So: **store the raw payload, then map names defensively.**

**Reliability** [official: https://help.healthyapps.dev/en/health-auto-export/automations]:
- "Not an exact schedule." The automation runs **only while the iPhone is unlocked**, via Background App Refresh.
- It may be skipped in Low Power Mode or under resource pressure. Background tasks get about 30 s.
- Charging and the app's widget make runs more frequent.

This follows from HealthKit itself:
- Health data sits in the "Protected Unless Open" class. Read access ends 10 minutes after the device locks [official: https://support.apple.com/guide/security/protecting-access-to-users-health-data-sec88be9900f/web; https://developer.apple.com/documentation/healthkit/protecting-user-privacy].
- In practice, expect data within hours, not minutes. Last night's sleep usually arrives after the first unlock in the morning [inferred].
- "Since Last Sync" plus idempotent upserts make missed runs self-healing [inferred].

**Recommended HAE configuration** [inferred]:
- **Automation:** REST API, JSON format, data type Health Metrics.
- **Metrics:** `sleep_analysis`, `heart_rate_variability`, `resting_heart_rate`, `step_count`, `weight_body_mass`, `body_fat_percentage`, `active_energy`, `basal_energy_burned`, and optionally `apple_sleeping_wrist_temperature`.
- **Aggregation:** ON, so sleep arrives per night and steps per day. This keeps payloads small, which matters because **Vercel Functions reject request bodies over 4.5 MB** [official: https://vercel.com/docs/functions/limitations].
- **Other settings:** Batch Requests ON; date range Since Last Sync; header `Authorization: Bearer <token>`.
- **History backfill:** do it once with a Manual Export over a date range in small chunks, or import Apple Health's `export.zip` with a one-off script.

**Endpoint, storage and auth** (shared with Shortcuts and, later, the native app) [inferred design]:

- **Endpoint:** `POST /api/ingest/hae`, a Next.js route handler on Vercel.
  - Set `runtime = 'nodejs'` and `preferredRegion = 'lhr1'`. Vercel's default region is `iad1` (US). Changing the region is allowed on all plans [official, Vercel limits page].
  - Validate with zod. Write the raw payload. Normalise. Return 200 fast; use Next's `after()` for the heavy work.
- **Auth:** HAE only supports static headers (no HMAC), so treat the token as a **write-only password**.
  - Generate 32 random bytes and show the token once in a "Connect Health Auto Export" settings screen.
  - Store only its SHA-256 in `ingest_tokens(id, user_id, token_hash, label, created_at, last_used_at, revoked_at)`.
  - Look up the hash, compare in constant time, then insert for that `user_id` with the service-role key on the server only.
  - Never put the token in the query string (it ends up in logs). Support revoke and rotate. Add a simple per-token rate limit.
- **Tables:**
  - `health_ingest_raw(id, user_id, source, automation_id, session_id, received_at, payload jsonb)`: keep 30–90 days so you can re-parse.
  - `health_samples(user_id, metric, start_at, end_at, value, unit, source_name, device, ingest_source)` with a **unique key (user_id, metric, start_at, end_at, source_name)**, so replays are no-ops.
  - Derived `sleep_nights(user_id, night_date /* local wake date */, sleep_start, sleep_end, asleep_min, core_min, deep_min, rem_min, awake_min, in_bed_min, source)`.
- **Read path:** the web app reads these tables through Supabase with RLS (`user_id = auth.uid()`). That's why auth arrives in phase 1.

#### (2) Apple Shortcuts personal automation ("Find Health Samples" → "Get Contents of URL")

**How it works:**
- **Cost:** free.
- **Building it:** build it by hand on the phone (Claude Code can't author it for you). Use Find Health Samples (type Sleep Analysis / Heart Rate Variability / Resting Heart Rate / Weight / Steps, filtered to the last day). Then Repeat with Each → Dictionary → **Get Contents of URL** (POST, JSON body, `Authorization` header).
- **Triggers:** personal automations can run without confirmation. Triggers include **Time of Day, Alarm, Sleep** and App. The **"Allow Running When Locked"** setting exists [official: https://support.apple.com/guide/shortcuts/create-a-new-personal-automation-apdfbdbd7123/ios].

**Problems:**
- **Locked-phone limit:** HealthKit reads still fail while the phone is locked. Users report "protected data inaccessible" errors from Health actions run while locked [third-party: https://talk.automators.fm/t/get-workouts-from-health-not-working-when-iphone-locked/13100].
- **Choice of trigger:** use a trigger that fires when the phone is in hand, such as **Sleep Focus ending, or the wake-up alarm being stopped**. Also put a manual "Sync" button on the Home Screen or the Action Button.
- **Unverified sleep-stage output:** I couldn't confirm how the action serialises sleep-stage values (Core/Deep/REM) into a dictionary. HealthKit stores stages as overlapping category samples [official: https://developer.apple.com/documentation/healthkit/hkcategoryvaluesleepanalysis]. **This needs a 30-minute spike before you rely on it.**
- **Fragile for large data:** building JSON in Shortcuts is slow for hundreds of samples, with no retries and no logs.

**Endpoint:** the same as HAE. Use `POST /api/ingest/shortcut` with its own small payload adapter and the same token table.

#### Ranking for the single-user phase

| Rank | Route | Effort to first useful data | Cost | Reliability | Data richness | Throwaway risk |
|---|---|---|---|---|---|---|
| **1** | **HAE → webhook** | ~1.5–3 dev-days, including Supabase auth and tables [inferred] | £6.99/yr or £24.99 lifetime | Medium–good: runs when unlocked; self-heals with Since Last Sync | High: sleep stages, HRV, RHR, steps, mass, workouts, 150+ metrics | Low: the endpoint and tables are reused later |
| 2 | Shortcuts → webhook | ~0.5–2 days, much of it manual phone tinkering | £0 | Low–medium: trigger timing, lock state, no retries | Medium; sleep-stage format unverified | Low; useful as a manual backup |
| 3 | Capacitor shell + HealthKit plugin | ~1–2 weeks (Section 2.2) | Apple Developer Program $99/yr (UK ~£79, not re-verified) + Mac or cloud builds | Good while the app is open; foreground sync on launch | High | None, but premature for one user |
| 4 | Expo native app | 4–8 weeks to parity | Apple fee; EAS free tier is enough | Best: anchored queries, background delivery | Highest | Premature |

**When a native wrapper becomes necessary** [inferred]:
1. **External testers.** TestFlight needs a native binary. External TestFlight groups need App Review for the first build [official: https://developer.apple.com/testflight/]. Asking each tester to buy HAE Premium, paste a URL and a bearer token, and keep the app foregrounded is OK for 1–3 technical friends, not more.
2. You want an **in-app HealthKit consent** flow, **write-back** to Health (logging bodyweight or meals into Health), or **dependable morning sync** without a third-party app.
3. You want **native capture**: a fast barcode scanner, a camera sheet for meal photos, haptics, Live Activities for the rest timer. Web push already works in iOS Home-Screen web apps, so notifications alone don't force a native app.
4. **App Store** distribution. A webview wrapper must clear guideline 4.2 (Section 5.3).

### 2.2 Capacitor wrapper around the existing Next.js app

**HealthKit/Health Connect plugins, status on 2026-10-16** [observed via the npm registry unless noted]:

| Plugin | Latest | Released | Licence | Sleep | Notes | Verdict |
|---|---|---|---|---|---|---|
| **`@capgo/capacitor-health`** | **8.11.12** | **2026-10-15** | MPL-2.0 (file-level copyleft; fine for app use) | **Yes, with stages** (`inBed/asleep/awake/rem/deep/light`) | Also weight, bodyFat, HRV, RHR, steps, `dietaryEnergyConsumed`, workouts (`queryWorkouts`), `queryAggregated`, write. Capacitor 8 = plugin v8 [official: https://cdn.jsdelivr.net/npm/@capgo/capacitor-health@8.11.12/README.md]. No background-delivery API documented. | **Pick** |
| `@capacitor/health-fitness` (official Ionic) | 1.0.2 | 2026-10-07; created 2026-08-07 | MIT | Yes (read) | Brand new and ported from the OutSystems Cordova plugin. Options are **JSON-encoded strings**. `getWorkoutData` is iOS only; has background "jobs" (notifications) [official: https://capacitorjs.com/docs/apis/health-fitness; type defs on jsDelivr]. | Fallback; watch it mature |
| `capacitor-health` (mley) | 8.4.0 | 2026-09-23 | MIT | **No**: no sleep permission or type in 8.4.0 | Steps, workouts, HR, weight, body fat, nutrition | Reject (no sleep) |
| `@perfood/capacitor-healthkit` | 1.3.2 | 2025-02-13 | MIT | iOS only | No release in ~20 months | Reject (stale) |
| `@capawesome-team/capacitor-health` | private registry | announced Aug–Oct 2026 | Paid Capawesome Insiders | Yes | Requires a sponsorship licence; price not published [official: https://capawesome.io/blog/announcing-the-capacitor-health-plugin/] | Only if already an Insider |
| `capacitor-rook-sdk` (ROOK aggregator) | 4.2.1 | 2026-10-08 | — | via ROOK | Ties you to ROOK pricing (Section 2.4) | Not needed |

**Next.js App Router under Capacitor**

Capacitor serves files from `webDir`, which must contain `index.html` [official: https://capacitorjs.com/docs/config]. There are two ways in.

| Mode | How | What breaks in this repo | Store risk | Effort [inferred] |
|---|---|---|---|---|
| **A. Remote URL** (`server.url` → your Vercel deployment) | Shell loads the live site; the native bridge is injected | Nothing in the code. Offline launch fails without the network. | Capacitor docs: `server.url` "is **not intended for use in production**" [official]. A thin wrapper invites **4.2 Minimum Functionality** rejection. Fine for **internal TestFlight**; risky for external review and the App Store. | 1–2 days |
| **B. Static export** (`output: 'export'` → `out/` as `webDir`) | UI bundled in the app; API stays on Vercel | Route handlers that read `Request`, cookies, server actions, the default image loader, and dynamic routes without `generateStaticParams` are **unsupported** [official: https://nextjs.org/docs/app/guides/static-exports]. Changes needed here: (1) `signal/[key]` gets `generateStaticParams`; (2) `templates/[templateId]` becomes `?id=`; (3) the 3 `fetch("/api/…")` calls go to `${API_BASE}` with CORS and `Authorization: Bearer <supabase JWT>` (cookies don't cross from `capacitor://localhost` to vercel.app); (4) API routes need excluding from the export build, either with a separate build target or by moving them to a standalone API app; (5) `images.unoptimized`. | Lower: a real bundled app with HealthKit and offline logging. | +3–6 days on top of A |

**Recommendation:** use **B**. Use **A** only as a 1-day TestFlight spike for yourself.

**iOS builds without a Mac:**
- Capacitor needs Xcode. If you have no Mac, use a cloud builder: Capawesome Cloud advertises from $9/month on macOS runners [third-party/vendor: https://cloud.capawesome.io/compare/ionic-appflow]; Capgo Build; or a GitHub Actions macOS runner.
- Ionic **Appflow is closed to new customers and ends 2027-12-31** [official, Ionic blog 2025-02-11; third-party summaries].
- **This is the main friction for a founder building from Claude Code cloud sessions (Linux)** [inferred].

### 2.3 New Expo / React Native app

**Status** [observed via npm]:
- `expo` 58.0.14 (2026-10-16), React Native 0.88.0 (2026-10-15), `expo-router` 58.0.23.
- **`@kingstinct/react-native-healthkit` 16.2.0 (2026-10-12)**, MIT, built on Nitro Modules (`react-native-nitro-modules` ≥0.35, RN ≥0.79).
  - It ships an Expo config plugin.
  - It supports **anchored queries** (only changes and deletions since the last sync) and `subscribeToChanges` / background delivery (`"background": true`) [official README on jsDelivr].
  - It **doesn't run in Expo Go**, so you need a dev client.
- `react-native-health` 1.19.0 (2024-10) is stale.
- `react-native-health-connect` 4.1.3 is Android only and not relevant.

**Builds and cost:**
- **EAS Build builds iOS in the cloud from Linux.** Free plan: "up to 15 Android and 15 iOS builds", low priority. Starter: $19/mo plus usage [official: https://expo.dev/pricing].
- Pairs well with Claude Code: the Expo MCP can run, inspect and submit builds and read TestFlight crashes (Section 6).

**Reusing this UI via Expo DOM components** [official: https://docs.expo.dev/guides/dom-components/]:
- `'use dom'` renders a web component in a WebView with an async JSON bridge.
- Limits: single-page only (no SSR/SSG); slower startup than Hermes; no shared global state; children can't be passed; synchronous router hooks are not supported.
- Expo itself recommends native views for core flows and DOM components for less-visited screens.
- The repo's pages use `next/navigation` and `next/link`, so even the DOM path needs those replaced [inferred].

**Port effort** [inferred]:
- **Logic:** `lib/` (~23k lines) is reusable once localStorage access goes behind a storage interface. Move it to a shared package.
- **UI:** ~11.7k lines of DOM/Tailwind TSX. Rewrite with RN primitives plus Uniwind (Tailwind 4 bindings, `uniwind` 1.12.2) or NativeWind (v5 is RC; 4.2.7 stable). Charts need react-native-svg. `@dnd-kit` becomes a gesture-handler sortable.
- **Estimate:** 4–8 focused weeks with Claude Code to reach parity. DOM-components hybrid: 1–3 weeks, but core logging stays in a webview, which defeats the point.
- **Two codebases** (web + native) unless you go Expo-for-web too.

### 2.4 Aggregator APIs (Terra, Junction, ROOK, Spike, Thryve)

| Vendor | Price | Apple Health from a plain web app? | Notes |
|---|---|---|---|
| Terra | Quick Start **$499/mo** monthly or $399/mo annual, 100k credits; 200 credits per connected source per user per month; no free tier; 30-day money-back [official: https://tryterra.co/pricing] | **No.** Apple Health, Samsung Health and Google Fit are **"mobile-only sources"** needing the iOS/Android/RN/Flutter SDK [official: https://docs.tryterra.co/unified-api/mobile-only-sources.md]. No Capacitor SDK listed. | Cloud OAuth for Garmin, Oura, WHOOP, Fitbit etc. |
| Junction (formerly Vital) | Launch **$300/mo** for 1–500 users; sandbox free [official: https://www.junction.com/pricing] | No. A native SDK is needed (e.g. `@tryvital/vital-health-react-native` 6.0.4, 2026-09-23 [observed]). | |
| ROOK | Core $399/mo for 750 users, plus add-ons [third-party, competitor page: https://sahha.ai/compare/rook-alternatives/] | No. A native SDK is needed; it *does* have a Capacitor SDK (`capacitor-rook-sdk` 4.2.1 [observed]). | |
| Spike | ~$450/mo; reportedly acquired by Raintree Systems 2026-07-15 [third-party, unverified: https://sahha.ai/compare/spike-api-alternatives/] | No | Acquisition makes the roadmap uncertain |
| Thryve | From €499/mo for 500 users; 25-user trial [third-party: https://sahha.ai/compare/thryve-alternatives/] | No | |

**Verdict:** **reject for now.** For iPhone + Apple Watch, an aggregator adds $300–500/mo and *still* needs a native SDK for HealthKit. Revisit only if testers arrive with WHOOP, Oura or Garmin and you want one integration for all of them.

### 2.5 Direct wearable developer APIs (OAuth from a web app)

All of these are OAuth 2.0 authorisation-code flows that a web app can do server-side. None of them covers Apple Watch.

| API | Status (Oct 2026) | Limits and approval |
|---|---|---|
| WHOOP | Live | 100 req/min and 10,000/day per client [official: https://developer.whoop.com/docs/developing/rate-limiting]. New apps start in a **Sandbox tier of 10 members**; higher tiers need manual review [official: https://developer.whoop.com/docs/developing/app-approval]. |
| Oura | Live; **personal access tokens retired (Dec 2025)**, OAuth only | Gen3/Ring 4 users need an active **Oura Membership** for API access [official: https://support.ouraring.com/hc/en-us/articles/4415266939155-The-Oura-API]. Apps are limited to **10 users** before approval [third-party: https://tryterra.co/blog/oura-api-ai-apps-access-permissions-commercial-restrictions]. |
| Garmin Health API | Officially "free to approved business developers"; commercial use may need a licence fee [official: https://developer.garmin.com/gc-developer-program/health-api/]. **New access requests reported paused** [third-party: https://tryterra.co/blog/garmin-connect-developer-program-pause]. | Not self-serve |
| Fitbit Web API | **Support ended 2026-09-30; the API turns off 2026-10-30.** Migrate to the Google Health API, which "is not onboarding new projects at this time". Scopes are Restricted, so a security review is required [third-party summaries of Google's notice; official landing: https://developers.google.com/health/about]. | Effectively closed for new builders |

**Verdict:** irrelevant for the founder's setup. WHOOP is the only one that is easy to try if a tester needs it.

### 2.6 Manual entry (stopgap and fallback)

- Keep manual entry for **bodyweight, sleep hours and subjective sleep quality** forever. HealthKit gaps will happen.
- Bodyweight is the engine's most important input, and many people weigh on a non-connected scale [inferred].
- **UI rule:** one tap from Home, numeric keypad, and pre-fill yesterday's value.
- Tag each value `source='manual'` so the engine can prefer device data when both exist.

### 2.7 Decision matrix — health data (weighted for iPhone-only and single user now, testers later)

| Option | Effort | Cost/yr | Risk | Fit with this repo | Score |
|---|---|---|---|---|---|
| HAE webhook | **Low** | ~£7 | Medium (iOS scheduling) | **High**: keeps the web app, adds one route + tables | **Best now** |
| Shortcuts webhook | Low–Med (manual) | £0 | Med–High | High | Backup |
| Capacitor + capgo-health | Medium | ~£79 + build service | Medium (4.2; webview UX) | **High**: reuses 100% of the UI | **Best for testers** |
| Expo + kingstinct | High | ~£79 (+$0–19/mo EAS) | Low technically, high schedule risk | Low: UI rewrite | Phase 4 if triggered |
| Aggregator | Low–Med | $3.6k–6k | Vendor | Still needs native | No |
| Direct wearable APIs | Med | £0 | Approval or closure | N/A to Apple Watch | No |
| Manual | Lowest | £0 | Data gaps | High | Always on |

**Triggers to move from Capacitor to Expo** [inferred]:
- Webview logging misses the "at or faster than Hevy" bar on device.
- You need HealthKit **background delivery**, widgets, Live Activities, or Siri/App Intents.
- You decide to drop the web app entirely.

---

## 3. Q2 — Backend and accounts

### 3.1 Options

| | **Supabase** | Neon + Drizzle + Better Auth / Auth.js | Convex |
|---|---|---|---|
| What you get | Postgres, Auth, RLS, Storage (meal photos), Edge Functions, Realtime | Serverless Postgres, ORM, separate auth library | Reactive document DB + TS functions; auth via Convex Auth or Clerk |
| Free tier | 500 MB DB; 50k MAU; 500k edge invocations; **paused after 1 week inactive; no backups** [official: https://supabase.com/pricing] | 0.5 compute, 1 GB/project, scale-to-zero; auth up to 60k MAU via "Managed Better Auth" [official: https://neon.com/pricing] | Exists (figures not verified; the pricing page didn't render) |
| Paid | Pro **from $25/mo**: 8 GB, daily backups for 7 days, no pausing | Launch pay-as-you-go: $0.106/CU-h, $0.35/GB-mo | Pro (not verified) |
| UK data location | **London `eu-west-2`** available [official: https://supabase.com/docs/guides/platform/regions] | Region list not verified this session | EU = **Ireland only, +30% surcharge**; no UK [official: https://docs.convex.dev/production/regions] |
| Engine fit (time-series, SQL windows) | **High**: SQL, views, `pg_cron` | High | Medium: no SQL; aggregates in TS |
| Effort for this repo | **Low–Med**: `@supabase/supabase-js` 2.118 / `@supabase/ssr` 0.12.7 [observed] | Med: you assemble the auth, migrations and RLS-equivalent yourself | Med: new data model and runtime |
| Auth maturity | Built in (email OTP, magic link, Apple, passkeys roadmap) | Better Auth 1.7.10 active. `next-auth` v5 **is still beta (5.0.0-beta.32)**; v4.24.15 is latest stable [observed] | Convex Auth or Clerk |
| Claude tooling | **Official plugin + MCP** (scoped, read-only mode) | Official `neon` plugin + MCP | Official `convex` plugin |
| Lock-in | Low (it's Postgres) | Lowest | High |

**Recommendation: Supabase, London region.**
- Start on Free while you're the only user. A single daily user won't trigger pausing, but Free has **no backups**, so add a nightly `pg_dump` via a GitHub Action.
- Move to Pro ($25/mo) the week testers arrive.
- Keep the Anthropic/OpenAI API routes on Vercel. Have them **verify the Supabase JWT** and query with the user's token so RLS applies. Use the service role only in the webhook.

### 3.2 Auth specifics [inferred]

- **Sign-in method:** use **email OTP (6-digit code)**, not magic links. On iOS, magic links open in Safari, not in the Home-Screen app or a Capacitor webview, so the session lands in the wrong place.
- **Sign in with Apple:** add it later if you add any social login. App Store guideline 4.8 expects it when other third-party logins are offered (not re-verified this session).
- **Cookies vs bearer tokens:** web uses `@supabase/ssr` cookies. The Capacitor build uses bearer tokens in `Authorization` headers.
- **Old IDs:** replace the `assistantUserId` / `assistantClientId` local IDs (used for the daily AI cap) with `auth.uid()`.

### 3.3 Migration path from localStorage [inferred]

1. **Storage seam first.** Introduce `lib/storage/*` repositories (`workouts`, `templates`, `profile`, `assistantThreads`, …) and replace the ~25 direct `localStorage` call sites. This is mechanical and Claude Code does it well; it also unblocks Capacitor and Expo later.
2. **One-shot import.** On first sign-in, call the existing `exportAppLocalStorageSnapshot()` (`lib/devDataTransfer.ts`) and upload it to `legacy_snapshots(user_id, exported_at, payload jsonb)`. Normalise server-side with an idempotent SQL/TS job: workouts → `workout_sessions` / `sets`. Keep the snapshot as an audit trail.
3. **Dual-run for 1–2 weeks.** Writes go to local + outbox → Supabase; reads stay local. Then flip reads to server-backed caches.

### 3.4 Offline-first logging (gyms have bad signal) [inferred]

- **Today the app is 100% offline-capable. Don't regress that.**
- **Local store:** IndexedDB via **Dexie** (4.4.6 [observed]) as the device store, not localStorage: it's async, larger, and transactional.
- **Write path:** every write goes to the local table **and** an `outbox` row. A sync loop upserts to Supabase on `online`, `visibilitychange`, and app launch.
- **Identity and idempotency:** client-generated **UUIDv7** primary keys make retries idempotent. Add `updated_at` and `deleted_at` (soft delete) to every row; resolve conflicts per row with last-write-wins.
- **Single user, single device:** this is enough. Adopt **PowerSync** (`@powersync/web` 2.4.2 [observed]; Supabase partner) only if multi-device editing conflicts become real.
- **Derived data is server-side:** engine outputs (trend weight, adherence, verdicts) are computed server-side or recomputed client-side from synced rows. Never treat them as the sync source of truth.

### 3.5 Data-model hints for daily logs [inferred]

```sql
-- every table: id uuid pk (client-generated), user_id uuid not null references auth.users,
-- created_at, updated_at timestamptz, deleted_at timestamptz null; RLS: user_id = auth.uid()
profiles(user_id pk, tz text, units, sex, birth_year, height_cm)
goals(id, user_id, kind /* cut|bulk|recomp|maintain */, start_date, target_rate_pct_bw_per_wk,
      target_weight_kg, kcal_target, protein_g_target, active bool)
daily_logs(id, user_id, local_date date, bodyweight_kg, bodyweight_source, sleep_min, sleep_source,
           steps, subjective_sleep_1to5, notes, unique(user_id, local_date))
food_entries(id, user_id, eaten_at timestamptz, local_date date, meal_slot,
             food_ref_source /* cofid|usda|off|custom|llm */, food_ref_id, description,
             grams numeric, kcal, protein_g, carbs_g, fat_g, fibre_g,
             method /* barcode|search|recent|llm_text|llm_photo|manual */, confidence real, photo_path)
foods_custom(id, user_id, name, per_100g jsonb)            -- "my foods" and recipes: the speed win
health_samples(...)  sleep_nights(...)  health_ingest_raw(...)  ingest_tokens(...)   -- section 2.1
workout_sessions(id, user_id, started_at, ended_at, local_date, template_id, payload jsonb) -- start as jsonb, normalise later
engine_snapshots(id, user_id, as_of_date, weight_trend_kg, est_tdee_kcal, adherence jsonb, verdict jsonb, model_version)
```

Rules:
- Store `timestamptz` **plus** a `local_date` computed with the user's tz at write time. Day boundaries and "last night's sleep" (attribute it to the **wake date**) are where these apps usually go wrong.
- Raw samples are immutable. Derived tables are rebuildable.

---

## 4. Q3 — Food data

### 4.1 Sources

| Source | Cost | Licence and obligations | Coverage and quality | Use |
|---|---|---|---|---|
| **CoFID** (McCance & Widdowson, 2021, PHE) | Free download (Excel) | **Open Government Licence v3.0** ("All content … except where otherwise stated") [official: https://www.gov.uk/government/publications/composition-of-foods-integrated-dataset-cofid] | Authoritative UK generic foods; a few thousand items (exact count not verified); last update March 2021; no brands | **Primary generic-food table** (import into Postgres) |
| **USDA FoodData Central** | Free; data.gov key; **1,000 req/hr per IP** | **CC0 / public domain**; credit requested [official: https://fdc.nal.usda.gov/api-guide/] | Foundation, SR Legacy, FNDDS, US branded; excellent for raw ingredients | Import Foundation + SR Legacy as a gap-filler |
| **Open Food Facts** | Free; **15 product reads/min and 10 searches/min per IP**; custom User-Agent required; v3 API current; bulk dumps preferred for heavy use [official: https://openfoodfacts.github.io/openfoodfacts-server/api/] | **ODbL** (database), DbCL (contents), CC BY-SA (images). **Attribution with a link** required; **derivative databases must be shared alike** [official: https://world.openfoodfacts.org/terms-of-use] | UK branded coverage good but uneven. Spot check [observed]: McVitie's Digestives, Weetabix and Coca-Cola 330 ml all found, but completeness ranged 0.575–0.9, and the Coke record had `added-sugars_100g` 17.5 g against carbs 10.6 g, which is inconsistent. UK product count not verified. | **Barcode lookup**, server-side, cached per barcode, with a "check the label" confirm step |
| FatSecret Platform | Basic free (5k calls/day); Premier Free (startups, unlimited); Premier (paid, on request) | Attribution on free tiers | **Basic and Premier Free are US datasets only.** UK and 62 other countries are Premier only (paid) [official: https://platform.fatsecret.com/api-editions] | Skip unless you pay for UK Premier |
| Nutritionix | Not published; the page returned HTTP 402 to my fetch | — | US-centric | **Couldn't verify; skip** |
| Edamam Food DB | Enterprise Basic **$14/mo** (100k calls); Core $69; Plus $299 [third-party summary of official page: https://developer.edamam.com/food-database-api] | Attribution required on all plans | Global; NLP parsing | Optional later, if you want a hosted NLP parser |

**ODbL handling** [inferred, not legal advice]:
- Keep OFF data in its own table (`off_products`) with an attribution line in the UI ("Product data from Open Food Facts, ODbL").
- Your *user food logs* are a "produced work", not a derivative database. A *corrected or merged product database* that you redistribute or expose publicly would trigger share-alike, so don't merge OFF rows into a proprietary master table.

### 4.2 LLM/vision estimation — what the evidence says

**Photo → nutrients, Claude models** [official journal: *Nutrients* 2026;18(12):2017, https://pmc.ncbi.nlm.nih.gov/articles/PMC13306177/]. Median absolute % error, with the "visual estimation" prompt:

| | Haiku 4.5 | Sonnet 4.6 | Opus 4.6 |
|---|---|---|---|
| Energy, Japanese mixed meals | 51.5% | **35.9%** | 34.9% |
| Energy, SNAPMe (US mixed meals) | 38.6% | **33.5%** | 32.8% |
| Energy, packaged foods (JBFD) | 37.7% | **19.3%** | 14.2% |
| Protein, mixed meals | 48–62% | **~38–39%** | ~38% |

- Chain-of-thought *lowered* accuracy. Salt was poor everywhere (34–64%).
- The authors say it is not suitable as the sole input for individual dietary management.
- Sonnet and Opus are within 1–3 points of each other, so pay for Sonnet, not Opus.

**Other evidence:**
- **Nutrition5k benchmark** (3,229 images, 10 approaches): best calorie result Gemini 3.0 Flash, MAE 80.7 kcal, CCC 0.767. GPT-4o and Claude Haiku 4.5 were tested, but their figures aren't in the abstract [preprint, bioRxiv 2026-07-29: https://www.biorxiv.org/content/10.64898/2026.07.26.740845v1].
- **Text descriptions:** older studies with GPT-3.5/4 on 222 items found energy within 10% for only ~35–48% of items, and protein over-estimated [third-party report of a JAMA-network study: https://www.healthday.com/healthpro-news/health-technology/chatgpt-provides-accurate-nutritional-information].
- **Chatbots vs dietitians** on packaged meals: 70–90% accuracy for calories and macros, sodium under-estimated [official journal: https://www.ncbi.nlm.nih.gov/pmc/articles/PMC12526241/].

**Implication** [inferred]: for a physique coach, where protein and kcal targets matter at about ±10%, **the LLM should do recognition and portion parsing, not nutrient arithmetic.** Pipeline:
1. Text or photo goes to Claude Sonnet with a structured output: items, estimated grams, and a confidence for each.
2. Each item is matched to CoFID/USDA/OFF/custom (`pg_trgm` search).
3. Macros come from the database.
4. The user confirms or edits the grams.
5. Store `method` and `confidence`.

Most of the speed win comes from **"recent / my meals" one-tap re-logging**, not AI: lifters on a cut eat repetitively.

### 4.3 Barcode scanning

**Web (iOS Safari / Home-Screen app):**
- The native `BarcodeDetector` API is **behind a flag in Safari** and unavailable by default on iOS; Chrome Android has it [official: MDN browser-compat-data, `api/BarcodeDetector.json`].
- Use the **`barcode-detector` polyfill** (3.2.2, ZXing-C++ WASM [observed]) or `zxing-wasm` 3.1.5 with `getUserMedia`. `html5-qrcode` (last release 2023) is stale.
- Expect slower focus and lock than native [inferred].

**Native:**
- Capacitor: `@capacitor-mlkit/barcode-scanning` 8.2.1 (2026-09-10) [observed].
- Expo: `expo-camera` 58.x has built-in barcode scanning [observed version; feature per Expo docs].

**Recommendation:** ship the WASM polyfill in P2, and swap in ML Kit when the Capacitor shell lands.

---

## 5. Q4 — Compliance basics (UK-first; not legal advice)

### 5.1 UK GDPR

| Topic | What applies | Source |
|---|---|---|
| Special-category data | Sleep, HRV, resting HR, body composition and likely diet logs are **health data**. You need an Art 6 basis (contract) **and** an Art 9 condition. For a consumer app that means **Art 9(2)(a) explicit consent**: specific, opt-in, confirmed in a clear statement, naming the data types, withdrawable. Consent forced as a condition of service with no alternative "is not valid" (the ICO's gym example). | [official: https://ico.org.uk/for-organisations/uk-gdpr-guidance-and-resources/lawful-basis/special-category-data/what-are-the-conditions-for-processing/] The ICO says this guidance is "under review" because of the **Data (Use and Access) Act**. |
| Founder-only phase | Processing only your own data is very low exposure. Obligations bite when the **first tester's data** arrives [inferred]. | |
| DPIA | Do one before testers: special-category data + innovative technology (LLMs) + profiling [inferred from ICO DPIA criteria; not re-fetched]. | |
| ICO fee | **£52/yr tier 1** (£47 by Direct Debit), in force since Feb 2025 | [third-party: https://acuitylaw.com/rise-in-ico-fees-data-protection-fees-february/; official consultation response: https://www.gov.uk/government/consultations/data-protection-fee-regime-proposed-changes/outcome/data-protection-fee-regime-government-response] |
| International transfers | Anthropic and OpenAI (US) process prompts that contain health data. You need DPAs and a transfer mechanism (UK IDTA/Addendum or the UK Extension to the DPF). Pin Supabase to London and Vercel functions to `lhr1`. | [inferred] |
| Minimisation for AI | Send the engine's **derived summaries** (trend weight, 7-day sleep average) to the LLM, not raw sample streams. Strip names and emails from prompts. | [inferred] |

### 5.2 Apple App Store (applies from the first external TestFlight build)

Quotes from [official: https://developer.apple.com/app-store/review/guidelines/]:
- **5.1.3(i):** no use or disclosure of HealthKit data to third parties for advertising or data mining other than improving health management; "**You must disclose the specific health data that you are collecting**".
- **5.1.3(ii):** no false data written to HealthKit; "**may not store personal health information in iCloud**". So no CloudKit or iCloud backup of health tables.
- **5.1.2(i):** "You must clearly disclose where personal data will be shared with third parties, **including with third-party AI**, and obtain explicit permission before doing so." This hits the assistant directly: you need an in-app consent before health-derived context goes to Claude or OpenAI.
- **2.5.1:** HealthKit must be used for health/fitness purposes and integrate with the Health app.
- **4.2:** the app must be "beyond a repackaged website". HealthKit sync, native barcode, haptics and offline logging are the defence for the Capacitor build.
- **1.4.1:** medical apps get more scrutiny. Disclose methodology for health-measurement claims; remind users to consult a doctor.
- Also needed: App Privacy "nutrition label" answers, and HealthKit purpose strings (`NSHealthShareUsageDescription`/`NSHealthUpdateUsageDescription`).

### 5.3 Google Health Connect (not needed while iPhone-only)

- Permissions must be declared and justified per data type in Play Console, and all access is reviewed.
- Allowed use cases include fitness, wellness and coaching.
- Prohibited: ads, selling, and credit/insurance/employment uses, plus third-party sharing without explicit consent.
- You need a comprehensive privacy policy reachable in-app [official: https://support.google.com/googleplay/android-developer/answer/12991134].

### 5.4 Wellness vs medical device

- **UK (MHRA):** software with a medical purpose (diagnosis, prevention, monitoring or treatment of disease; clinical calculators) can be a medical device. The MHRA guidance page was last updated 2023-07-01 [official: https://www.gov.uk/government/publications/medical-devices-software-applications-apps]. In Jan 2026 MHRA added guidance on digital *mental health* technology [third-party].
- **US (FDA):** the revised **General Wellness** final guidance (2026-01-06) keeps the two-factor test (intended only for general wellness, and low risk). It widens room for wearables estimating physiological values used only for wellness [third-party: https://www.gtlaw.com/en/insights/2026/01/fda-updates-two-digital-health-final-guidance-documents].
- **Product guardrails** [inferred]:
  - Frame everything as body-composition and performance coaching for healthy adults (18+).
  - Never claim to detect or treat sleep disorders, eating disorders, diabetes or hypertension.
  - Put a hard floor on kcal targets, and add a screening question (pregnancy, ED history) that routes to "see a professional".
  - Keep "HRV low → maybe deload" language advisory, not diagnostic.

### 5.5 What the privacy policy must cover

- Controller identity and contact.
- **Exact health data types** (list them) and their sources: HealthKit via the app or HAE, manual entry.
- Purposes, with the Art 6 and Art 9 bases; how to **withdraw consent**.
- **AI processing:** which vendors (Anthropic, OpenAI), what is sent, retention, and no training use (verify each vendor's terms).
- Sub-processors (Supabase, Vercel, Open Food Facts lookups).
- International transfers and safeguards; retention periods.
- Rights (access, rectification, erasure, portability) and how to exercise them in-app (export plus delete account).
- Automated decision-making and profiling: explain the engine's logic. Not legally significant under Art 22, but transparency is expected.
- Security; children (18+ only); the ICO complaint route.
- **HealthKit statements:** not used for ads, not sold, not stored in iCloud.
- Change log.

---

## 6. Q5 — Claude Code tooling

### 6.1 How Claude Code picks things up [official unless noted]

- **CLAUDE.md** [https://code.claude.com/docs/en/memory]:
  - `./CLAUDE.md` or `./.claude/CLAUDE.md` loads at launch, together with files in parent directories. Subdirectory `CLAUDE.md` files load **on demand** when Claude touches files there.
  - `CLAUDE.local.md` is for personal notes (gitignore it). `@path` imports are supported (max depth 4).
  - `.claude/rules/*.md` with `paths:` frontmatter gives path-scoped rules. `AGENTS.md` is also read.
  - Keep each file **under ~200 lines**.
- **Skills** [https://code.claude.com/docs/en/skills]:
  - Locations: `.claude/skills/<name>/SKILL.md` (project), `~/.claude/skills` (personal), `<plugin>/skills`.
  - They auto-load when the `description` matches the task, or on `/name`. Changes are live-reloaded.
  - Frontmatter: `disable-model-invocation`, `allowed-tools`, `paths`.
  - The docs don't mention `.agents/skills`. This repo works because `.claude/skills/impeccable` is a symlink into `.agents/skills/impeccable` [observed].
- **`npx skills` (skills.sh CLI, `skills` 1.7.2 [observed])** [official: https://github.com/vercel-labs/skills]:
  - Installs into each agent's directory. Claude Code = `.claude/skills/` (project) or `~/.claude/skills/` (`-g`). Generic agents use `.agents/skills/`.
  - Default mode is a **symlink to a canonical copy**; `--copy` copies instead.
  - Flags: `-a claude-code`, `--skill <name>|'*'`, `-y`, `--list`. Commands: `npx skills list | update [-p|-g] | remove`.
  - The lock file is `skills-lock.json`, as in this repo.
  - Telemetry is on by default; set `DISABLE_TELEMETRY=1` to opt out.
- **Cloud sessions** [https://code.claude.com/docs/en/cloud-environments, "What carries over"]:
  - Committed `CLAUDE.md`, `.claude/skills|agents|commands|rules`, `.claude/settings.json` hooks and permissions, and `.mcp.json` (single-repo sessions) **do** load.
  - **Plugins and marketplaces declared in `.claude/settings.json` do not**, and nor does anything in `~/.claude` on your laptop.
  - `/plugin` isn't available in cloud sessions [https://code.claude.com/docs/en/claude-code-on-the-web].
  - Skills you enable on claude.ai do load.
  - **So for cloud work:** vendor skills into the repo with `npx skills add … -a claude-code -y` and commit them. Put MCP servers in `.mcp.json` with token headers, stored as environment network secrets. OAuth-only MCPs may not authenticate headlessly.
  - Installing plugins from a setup script (`claude plugin install … --scope user`) is **untested** [inferred].

### 6.2 Tooling table

| Tool | What it gives | Install (local CLI) | Cloud-session route | Phase | Verdict |
|---|---|---|---|---|---|
| **CLAUDE.md** (write one) | Stack, commands (`npm run dev/build/lint/eval`), architecture (engine in `lib/`, storage seam), data rules (no health data in localStorage after P1; RLS; UTC + local_date), compliance guardrails (no medical claims; AI consent), which skill to use when. Import `@PRODUCT.md`. | `/init`, then edit | Committed, so it loads | P0 | **Do now** |
| **impeccable** (pbakaus/impeccable) | Design and UX workflow (shape, craft, critique, audit, polish) wired to `PRODUCT.md`/`DESIGN.md`; web-oriented | Already vendored; update with `npx skills update impeccable` (lock present) | Already in `.claude/skills` | P0–P3 | **Keep as the primary UI skill.** Run `$impeccable document` to create `DESIGN.md`. |
| **Supabase plugin** (supabase-community/supabase-plugin; in the official marketplace) | Hosted MCP (`https://mcp.supabase.com/mcp`: projects, SQL, migrations, edge functions, logs) plus skills `supabase` and `supabase-postgres-best-practices` | `claude plugin install supabase@claude-plugins-official` (marketplace manifest [observed]) or `npx plugins add supabase-community/supabase-plugin` [official: https://supabase.com/docs/guides/ai-tools/plugins] | `.mcp.json` with `"url": "https://mcp.supabase.com/mcp?project_ref=${SUPABASE_PROJECT_REF}&read_only=true"` and `"headers": {"Authorization": "Bearer ${SUPABASE_ACCESS_TOKEN}"}` (scoped PAT) [official: https://supabase.com/docs/guides/getting-started/mcp]. Skills via `npx skills add supabase/agent-skills -a claude-code` (repo named in the plugin README as the skills source; command inferred). | P1+ | **Install.** Scope to the dev project; read-only for anything production. |
| **Vercel agent-skills** (vercel-labs/agent-skills) | `react-best-practices` (40+ React/Next perf rules), `web-design-guidelines` (100+ UI/a11y rules), `react-native-guidelines` (16 RN rules), `vercel-optimize` | `npx skills add vercel-labs/agent-skills --skill react-best-practices --skill web-design-guidelines -a claude-code -y` [official README] | Commit the result | P1–P2 (web); RN skill only if Expo | **Install the 2 web skills** |
| **Vercel plugin** (vercel/vercel-plugin; official marketplace) | Deployments, logs, domains, env from Claude | `claude plugin install vercel@claude-plugins-official` or `npx plugins add vercel/vercel-plugin` | MCP or CLI via `.mcp.json`; needs a Vercel token | P1 | Optional |
| **Capgo Capacitor skills** | Agent instructions to install and wire Capgo plugins, including `@capgo/capacitor-health` | `npx skills add Cap-go/capgo-skills` or `npx skills add https://github.com/cap-go/capacitor-skills --skill capacitor-plugins` [official, plugin README] | Commit | P3 | Install at P3 |
| **UXKIN** (uxkin/agent) | 7 free MIT skills, including **`ios-screens`** (native-feeling iPhone screens: safe areas, Dynamic Type, sheets, 44 pt targets), `no-ui-slop`, `ui-states`. **I found no skill literally named "Mobile App Design (iOS)"**; `ios-screens` is the match. The optional MCP (`https://uxkin.com/mcp`, tools `find_ui_references`, `get_journey` for real iOS journeys) **needs a paid UXKIN plan** for searches. | Skills: `npx skills add uxkin/agent --skill ios-screens -a claude-code`. Plugin: `/plugin marketplace add uxkin/agent` then `/plugin install uxkin@uxkin` (marketplace.json present [observed]). MCP: `claude mcp add --scope user --transport http uxkin https://uxkin.com/mcp`, then `/mcp` → Authenticate [official README]. | Skills commit fine. The MCP is OAuth, so it may not work headless. | P3 | Install `ios-screens` + `ui-states`. **Skip the paid MCP:** a **Mobbin** connector (real app screens and flows) is already attached to this account [observed in this session's tool list]. |
| **Expo plugin** (expo/skills; official marketplace) | 24 skills (expo-router, expo-dom, expo-web-to-native, expo-ui, eas-app-stores, eas-update, eas-workflows, eas-simulator…) **plus the Expo MCP** (`https://mcp.expo.dev/mcp`: build/submit/inspect, TestFlight crashes; local simulator automation with the `expo-mcp` package) | `claude plugin install expo@claude-plugins-official [--scope project]` [official: https://docs.expo.dev/agents/claude] | Skills: `npx skills add expo/skills -a claude-code`. MCP: `claude mcp add --scope project --transport http expo https://mcp.expo.dev/mcp` (OAuth with Expo account) [official: https://docs.expo.dev/eas/ai/mcp/] | P4 (only if Expo) | Conditional |
| **Callstack agent-skills** (callstackincubator/agent-skills) | `react-native-best-practices` (FPS, startup, memory, bundle), `react-navigation`, `upgrading-react-native`, testing (`react-native-testing`, `agent-device`, `dogfood`), migration skills | `npx skills@latest add callstackincubator/agent-skills --skill react-native-best-practices` [official README]. Or plugin: `/plugin marketplace add callstackincubator/agent-skills` then `/plugin install building-react-native-apps@callstack-agent-skills` (from its marketplace.json [observed]; command inferred). | Commit skills | P4 (only if Expo/RN) | Conditional. Prefer this over Vercel's smaller RN skill for perf work. |
| **frontend-design** (anthropics/claude-plugins-official) | One skill: "distinctive, opinionated" aesthetic direction, take "aesthetic risk" | `claude plugin install frontend-design@claude-plugins-official` | Copy `plugins/frontend-design/skills/frontend-design` into `.claude/skills` | — | **Don't install.** It conflicts with PRODUCT.md's calm, anti-hype brief and duplicates impeccable. Two auto-triggering design skills will fight [inferred]. |
| **Neon / Convex plugins** (official marketplace) | Alternatives to Supabase | `claude plugin install neon@…` / `convex@…` | — | — | Not needed if Supabase |
| **playwright** (official marketplace) | Browser automation to check UI flows | `claude plugin install playwright@claude-plugins-official` | `.mcp.json` | P1–P3 | Useful for regression checks on the web app |

---

## 7. Recommended phased technical route

| Phase | When | Build | Health data | Tooling used | Cost delta |
|---|---|---|---|---|---|
| **P0 — Safety and context** | This week | `CLAUDE.md`; `DESIGN.md` via impeccable; use the app from the Home Screen; manual JSON export as backup | Manual bodyweight/sleep entry | impeccable, `/init` | £0 |
| **P1 — Backend + ingest** | Weeks 1–3 | Supabase (London) + email-OTP auth + RLS. `lib/storage` seam. Dexie + outbox. Legacy snapshot import. Tables from §3.5. `POST /api/ingest/hae` (lhr1, bearer token, raw + normalised, idempotent). Engine reads `daily_logs`, `sleep_nights`, `health_samples`. API routes verify the Supabase JWT. | **HAE Premium → webhook.** Optional Shortcut "Sync now". One-off history backfill. | Supabase plugin/MCP, Vercel `react-best-practices`, playwright | HAE £6.99/yr; Supabase £0 (+ nightly dump) |
| **P2 — Food** | Weeks 3–6 | CoFID + USDA import; OFF barcode proxy (custom UA, cache, ODbL attribution); "my foods / recent meals"; Claude text and photo parsing to items + grams, then DB macros, then user confirm; `barcode-detector` WASM scanner | — | impeccable, `web-design-guidelines` | LLM tokens only |
| **P3 — Tester-ready native shell** | Start ~4–6 weeks before the first tester | Capacitor 8 + static export (fix the 2 dynamic routes, API base URL + bearer, exclude API from the export build); `@capgo/capacitor-health` foreground sync on launch/resume into the **same** ingest tables; ML Kit barcode; TestFlight. **Compliance pack:** explicit-consent screens (health data + third-party AI), privacy policy, DPIA, ICO fee, Supabase Pro. | In-app HealthKit; HAE kept as founder fallback | Capgo skills, UXKIN `ios-screens`/`ui-states`, Mobbin connector | Apple ~£79/yr; Supabase $25/mo; cloud Mac builds ~$9/mo if no Mac |
| **P4 — Conditional** | After tester feedback | **Either** App Store submission of the Capacitor app (4.2 defence: HealthKit, offline, native scanner) **or**, if triggered (§2.7), an Expo app sharing `lib/` as a workspace package, with `@kingstinct/react-native-healthkit` anchored + background sync | Background delivery (Expo) | Expo plugin + MCP, Callstack skills | EAS $0–19/mo |

---

## 8. Unverified or open items (flagged, not padded)

- How Shortcuts' Find Health Samples serialises sleep-stage values. Needs an on-device spike.
- Whether HAE's aggregated sleep `date` is the bedtime or the wake date. Log raw payloads and decide.
- Whether HealthKit works on a free (personal team) Apple provisioning profile. Apple's capability table didn't render.
- Convex free and pro limits; Neon's London region; Nutritionix pricing; OFF's UK product count.
- `capacitor-rook-sdk` and Spike acquisition details (competitor-sourced).
- Whether a cloud-session setup script can install Claude Code plugins.
- Apple Developer Program UK price (~£79) and the 4.8 Sign in with Apple rule were not re-fetched this session.

## 9. Key sources

- **Capacitor:** https://capacitorjs.com/docs/config · https://capacitorjs.com/docs/apis/health-fitness · https://cdn.jsdelivr.net/npm/@capgo/capacitor-health@8.11.12/README.md · https://capawesome.io/blog/announcing-the-capacitor-health-plugin/
- **Next.js:** https://nextjs.org/docs/app/guides/static-exports
- **Expo:** https://docs.expo.dev/guides/dom-components/ · https://docs.expo.dev/agents/claude · https://docs.expo.dev/skills.md · https://docs.expo.dev/eas/ai/mcp/ · https://expo.dev/pricing
- **Health Auto Export:** https://apps.apple.com/gb/app/health-auto-export-json-csv/id1115567069 · https://help.healthyapps.dev/en/health-auto-export/automations/rest-api/ · https://help.healthyapps.dev/en/health-auto-export/export-format/health-metrics · https://github.com/HealthyApps/health-auto-export-server · https://github.com/irvinlim/apple-health-ingester
- **HealthKit and Shortcuts:** https://support.apple.com/guide/security/protecting-access-to-users-health-data-sec88be9900f/web · https://developer.apple.com/documentation/healthkit/protecting-user-privacy · https://support.apple.com/guide/shortcuts/create-a-new-personal-automation-apdfbdbd7123/ios
- **Aggregators:** https://tryterra.co/pricing · https://docs.tryterra.co/unified-api/mobile-only-sources.md · https://www.junction.com/pricing · https://sahha.ai/compare/rook-alternatives/
- **Wearable APIs:** https://developer.whoop.com/docs/developing/app-approval · https://support.ouraring.com/hc/en-us/articles/4415266939155-The-Oura-API · https://developer.garmin.com/gc-developer-program/health-api/ · https://developers.google.com/health/about
- **Backend:** https://supabase.com/pricing · https://supabase.com/docs/guides/platform/regions · https://supabase.com/docs/guides/getting-started/mcp · https://neon.com/pricing · https://docs.convex.dev/production/regions · https://vercel.com/docs/functions/limitations · https://webkit.org/blog/10218/full-third-party-cookie-blocking-and-more/
- **Food data:** https://openfoodfacts.github.io/openfoodfacts-server/api/ · https://world.openfoodfacts.org/terms-of-use · https://fdc.nal.usda.gov/api-guide/ · https://www.gov.uk/government/publications/composition-of-foods-integrated-dataset-cofid · https://platform.fatsecret.com/api-editions · https://developer.edamam.com/food-database-api · https://pmc.ncbi.nlm.nih.gov/articles/PMC13306177/ · https://www.biorxiv.org/content/10.64898/2026.07.26.740845v1
- **Compliance:** https://developer.apple.com/app-store/review/guidelines/ · https://developer.apple.com/testflight/ · https://support.google.com/googleplay/android-developer/answer/12991134 · https://ico.org.uk/for-organisations/uk-gdpr-guidance-and-resources/lawful-basis/special-category-data/what-are-the-conditions-for-processing/ · https://www.gov.uk/government/publications/medical-devices-software-applications-apps · https://www.gtlaw.com/en/insights/2026/01/fda-updates-two-digital-health-final-guidance-documents
- **Claude Code docs:** https://code.claude.com/docs/en/skills · https://code.claude.com/docs/en/memory · https://code.claude.com/docs/en/cloud-environments · https://code.claude.com/docs/en/settings
- **Skills and plugins:** https://github.com/anthropics/claude-plugins-official (`.claude-plugin/marketplace.json`) · https://github.com/vercel-labs/skills · https://github.com/vercel-labs/agent-skills · https://github.com/callstackincubator/agent-skills · https://github.com/uxkin/agent · https://github.com/supabase-community/supabase-plugin
