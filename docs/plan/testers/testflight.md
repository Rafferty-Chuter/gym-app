# TestFlight: what to paste, and what to check in Xcode

For FT7 (`07-tester-ready.md`). Written 2026-10-21 (TR5). Sections 3 to 5 are ready to paste into App Store Connect; `[FOUNDER]` marks what only you can fill in. Section 2 is the checklist for Xcode. Section 6 lists the calls I made and the review risks I found.

**Paste these once TR1, TR2 and TR3 are deployed.** The app loads the live site, so the reviewer sees whatever production serves on the day. The notes below describe the consent screen, Delete account, the privacy page and error reporting. Production is still at A2 (`HANDOFF.md`), so deploy first (FT3).

## 1. What the build declares

`ios/App/App/PrivacyInfo.xcprivacy` is in the App target's resources. `lib/__tests__/iosPrivacy.test.ts` checks it against Apple's lists of allowed keys and reason codes.

**Required-reason APIs.** I read the Swift source of every native part of the app:

| Code in the app | Required-reason APIs it uses | Where it's declared |
|---|---|---|
| The app's own Swift (`AppDelegate`, `SceneDelegate`) | None | — |
| Capacitor 8.5 (Apple-signed xcframeworks from capacitor-swift-pm) | None | Its own manifest, inside the framework |
| `@capacitor/filesystem` 8.1.3 and its `IONFilesystemLib` | File timestamps: `attributesOfItem` reads creation and modification dates for `stat` and `readdir` | Ours: **C617.1** (files inside the app's container; the data copy lives in Library) |
| `@capgo/capacitor-health` 8.10.6 | None; it only uses HealthKit | — |
| WKWebView | System framework | — |

- Nothing uses UserDefaults. `@capacitor/preferences` isn't installed, so the ticket's guess of CA92.1 doesn't apply.
- Neither plugin ships its own manifest, and neither does upstream (capgo 8.11.12, capacitor-filesystem main). Both are Swift packages linked into the app's own binary, so our manifest has to cover their code.
- A new Capacitor package in `package.json` fails the test until someone reads its Swift and adds it to `NATIVE_PACKAGES` in the test.

**Collected data.** This is the same list as section 5. Health, Fitness, Email Address and User ID are linked to the user. Device ID, Search History and Crash Data are not. None is used for tracking, and every one is for App Functionality only.

**Info.plist.**
- The Health read text now names every type and why: "Gym AI reads your sleep, HRV, resting heart rate, weight, body fat and steps to show them beside your training and food, and to work out your weight trend and maintenance calories."
- The write text stays ("only reads… does not write anything"). The HealthKit framework references write APIs, and App Store Connect rejects an upload without it (ITMS-90683). iOS never shows it, because the app never asks to write.
- `ITSAppUsesNonExemptEncryption = NO` is added: the app only uses HTTPS through the system. TestFlight then stops asking the export-compliance question on every build.

**Nothing writes to Health.** The only authorisation call is `Health.requestAuthorization({ read: [...], write: [] })` in `lib/physique/io/nativeHealth.ts`. Nothing calls `saveSample`. Both are checked by the test.

## 2. In Xcode (FT7)

1. `npm ci && npx cap sync ios && npx cap open ios`.
2. **The manifest is bundled.** In the navigator, App → App shows `PrivacyInfo.xcprivacy`. Select it; in the File inspector (right pane), Target Membership has **App** ticked. I added it to the project by editing `project.pbxproj`; the lint and the test pass, but Xcode hasn't opened it yet. If the file shows red or unticked, delete the reference (Remove Reference), then drag the file back in with "App" ticked.
3. **Signing & Capabilities.** HealthKit is listed. Leave "Clinical Health Records" and "Background Delivery" unticked: the app uses neither.
4. **General → Identity.** Version 1.0, Build 1. Each upload needs a higher build. Either raise it here, or in the Distribute dialog choose Custom and leave "Manage Version and Build Number" ticked if it's offered.
5. **General → Supported Destinations.** This is currently iPhone *and* iPad (Capacitor's default, `TARGETED_DEVICE_FAMILY = "1,2"`). For TestFlight either is fine. Decide before the first App Store release: once a store version supports iPad, later versions can't drop it, and iPad means iPad screenshots and iPad review. My suggestion is to remove iPad now: the app is laid out for phones, and portrait is already the only iPhone orientation.
6. Set the run destination to **Any iOS Device**, then Product → **Archive**.
7. **Privacy report.** In the Organizer, Control-click the archive → **Generate Privacy Report**. It should list Health, Fitness, Email Address, User ID (linked), Device ID, Search History, Crash Data (not linked), and File Timestamp with C617.1. Check it against section 5 before answering App Privacy.
8. **Validate App** before **Distribute App**. It catches missing purpose strings and manifest errors before the upload does.
9. After the upload, watch for Apple's email. If it says "ITMS-91053: Missing API declaration", add the category it names to the manifest, add the package to the test, and upload a new build.
10. **App Store Connect app record:** bundle id `app.gymai.coach` (permanent), primary category Health & Fitness. The store name must be unique. If "Gym AI" is taken, the name on the home screen (`CFBundleDisplayName`) can stay "Gym AI" while the store name differs (for example "Gym AI: Training Log").

## 3. TestFlight → Test Information

**Feedback email:** `[FOUNDER]` (the same address as `NEXT_PUBLIC_SUPPORT_EMAIL`).

**Privacy policy URL:** `https://gym-app-eta-nine.vercel.app/privacy`

**Marketing URL:** leave empty.

**Beta App Description** (testers see this before they install; limit 4,000 characters):

```
Gym AI is a training and physique log for lifters who train three or more times a week. You log workouts, food, bodyweight and sleep in one place. The app works out your weight trend, your maintenance calories and how each main lift is moving. With enough history it shows which habits line up with better or worse sessions, in kilograms (for example, top sets after short nights).

On iPhone it reads sleep, HRV, resting heart rate, weight, body fat and steps from Apple Health, so you don't log them by hand. It only reads. It never writes to Apple Health.

Everything works without an account. Signing in with an email code is optional and keeps a copy of your log in your account so it's on every device. You can delete the account in the app.

This is an early build for a small group of lifters testing it for 6 to 8 weeks. Some parts are rough. Tell us what's wrong or confusing.
```

**What to Test** (per build; limit 4,000 characters; rewrite it for each build that changes features):

```
Thanks for testing. Log as you normally would for the next 6 to 8 weeks. In the first few days, please try:

1. Setup: the basics, today's weight and your goal.
2. Profile → Apple Health → Connect Apple Health. Allow the types you're happy to share. Check that last night's sleep and your latest weigh-in look right.
3. Log a workout, a weigh-in and a day of food. If you've used Hevy or Strong, import your history: Profile → Import.
4. Open Progress after a few days. Tell us anything that looks wrong or that you don't understand.
5. Optional: Profile → Account to sign in with an email code, so your log is kept in your account.

To send feedback, use Profile → Send feedback, or take a screenshot and share it from the TestFlight prompt.
```

## 4. TestFlight → Beta App Review Information

- **Contact:** `[FOUNDER]` first name, last name, phone, email.
- **Sign-in required:** No. Untick it and leave the demo account empty.
- **Review notes** (limit 4,000 characters):

```
Gym AI is a training and physique log for lifters. It is built with Capacitor: most screens are web content, and the parts below need the native app. A website in Safari can't do them.

1. Apple Health, read on the phone (HealthKit). Profile → Apple Health → Connect Apple Health opens the system sheet for six read types: sleep, HRV, resting heart rate, weight, body fat and steps. The app reads the last 60 days on connect, then re-reads the last 14 days each time it opens. Progress shows them beside training and food: sleep against lift performance, the weight trend and maintenance calories. The app never writes to Health. NSHealthUpdateUsageDescription is present only because the HealthKit framework references write APIs; the app never requests write access. If the review device has no Health data, add a weight in the Health app (Browse → Body Measurements → Weight → Add Data), return to Gym AI and tap Read now in the Apple Health sheet.

2. A copy of the log on the device. Months of weigh-ins, food and workouts are copied to a file in the app's own container and restored if the web view's storage is cleared. A home-screen web app can't do this.

3. An offline start page. With no connection, the app opens its own bundled page instead of a browser error.

No account is needed, so there is no demo account. Every feature works without signing in. Sign-in is optional: an emailed six-digit code, no password. It only keeps a copy of the log in the user's account so it reaches their other devices, and the app asks for consent before anything is uploaded. Profile → Account → Delete account deletes the account and its server data inside the app.

Health data is used only to show the user their own log. It is not used for advertising or marketing and is not sold. Privacy policy: https://gym-app-eta-nine.vercel.app/privacy

There are no in-app purchases in this build.
```

When the food Describe feature asks for AI consent (section 6, first item), add this paragraph before "No account is needed":

```
Food → Describe sends the text the user types (for example "2 eggs on toast") to Anthropic's Claude to estimate the food. The app asks permission first and names Anthropic. No Health data is sent.
```

## 5. App Privacy (App Store Connect → App Privacy)

"Do you or your third-party partners collect data from this app?" → **Yes.** Then tick the seven types below. For each one, answer: **Purpose:** App Functionality only. **Linked to the user's identity:** as shown. **Used for tracking:** No.

| Data type (as App Store Connect names it) | What it is in Gym AI | Why it counts as collected | Linked? |
|---|---|---|---|
| Health & Fitness → **Health** | Weight, body fat, waist, food and nutrition, sleep, HRV, resting heart rate; sex, age and height from setup. Read from Apple Health or entered | Copied to the account (Supabase, Frankfurt) when signed in; Health Auto Export samples are held on our server; food Describe text goes to our server and Anthropic | Yes |
| Health & Fitness → **Fitness** | Workouts (exercises, sets, reps, loads), steps, training programme | Copied to the account when signed in | Yes |
| Contact Info → **Email Address** | The sign-in email | Supabase Auth stores it | Yes |
| Identifiers → **User ID** | The account id | Every synced record is stored under it | Yes |
| Identifiers → **Device ID** | A random id the app makes on install, sent with each food Describe request | The server counts requests against it for the daily limit; it's never joined to the account | No |
| Search History → **Search History** | Food search text and scanned barcodes | Sent to our server and Open Food Facts to find foods; the response is cached for a day under the query alone | No |
| Diagnostics → **Crash Data** | Error reports from TR3: message, stack, page path, app version | Written to the server logs; no ids, no stored values | No |

**Not collected:** Name, Phone, Physical Address, Location, Contacts, Photos, Audio, Sensitive Info, Browsing History, Purchases, Product Interaction, Advertising Data, Other Usage Data, Performance Data, Other Diagnostic Data, Other User Content. There are no analytics or ads SDKs, and web push doesn't run inside the app.

**The label people will see:** Data Linked to You: Health & Fitness, Contact Info, Identifiers. Data Not Linked to You: Identifiers, Search History, Diagnostics. Data Used to Track You: none (so no tracking prompt is needed).

**Third parties involved** (service providers acting for us; none uses the data for its own purposes): Supabase (database and sign-in), Vercel (hosting and logs), Anthropic (food Describe, and the coach once it's on), Open Food Facts (the search text only).

**Update these answers** (and the manifest, then rebuild) when any of these change:
- **The coach is switched on:** add Other User Content (the chat; linked, App Functionality). TR1's AI consent must be in place first.
- **The daily AI limit is keyed by the account** (HANDOFF open work, item 3): remove Device ID if nothing else sends it.
- **Sentry replaces TR3's built-in reporter:** still Crash Data; if it attaches a user id, mark it linked.
- **Native push reminders** (B11 step 2): add Device ID, linked (the push token).
- **Subscriptions:** add Purchases.

## 6. Calls I made, and review risks

- **Food Describe sends text to Anthropic without asking first (5.1.2(i)).** `components/food/DescribePanel.tsx` posts the typed text to `/api/food/parse`, which calls Claude. Since November 2025, Apple has required explicit permission, naming the AI provider, before personal data goes to a third-party AI. TR1's `hasAiConsent()` is built for the coach. Describe should check it too, or ask in place, before external testing. A reviewer logging food is likely to try Describe. I've flagged this as its own task.
- **4.2 (a repackaged website).** This is the main risk for a Capacitor app that loads a live site. The review notes lead with the three things only the app can do. If the first review is rejected under 4.2, reply in Resolution Center with the HealthKit flow described step by step.
- **2.5.2 / 2.3.1 (features changing after review).** Web deploys reach the app without a new build. Bug fixes and copy are fine. For a new feature or a feature switched on (the coach above all), upload a new build that names it in What to Test.
- **5.1.3(ii) (no health data in iCloud).** The on-device copy (`lib/storage/nativeMirror.ts`) is a file in the app's Library folder. Like the web view's own storage, it is part of the phone's encrypted device backup. Nothing is written to iCloud Drive, CloudKit or iCloud key-value storage. If a reviewer objects anyway, the fix is `Directory.LibraryNoCloud` in `nativeMirror.ts`, plus a one-time read from the old path.
- **Device ID and Search History marked not linked.** Neither is ever stored with the account or the email, which meets Apple's test for "not linked". If you'd rather be cautious, marking them linked costs nothing except a longer "Linked to You" list.
- **Template defaults left as they are.** `UIRequiredDeviceCapabilities = armv7` and the iPad setting both come from Capacitor's own template (checked against `@capacitor/cli` 8.5.2), and builds upload fine with them. The iPad choice is item 5 in section 2.
