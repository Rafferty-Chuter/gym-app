# B11. The iPhone app: build, install, ship

The iPhone app is a native shell (Capacitor 8) around the live site, so every web deploy reaches the app at once. It adds what the home-screen web app can't have:

- **Apple Health read directly on the phone.** Sleep with stages, HRV, resting heart rate, weight, body fat and steps. This replaces Health Auto Export, its subscription and its split nights.
- **A durable copy of your data** in the app's own folder. It is restored if iOS clears the page's storage.

Everything else is the web app as it is.

## What you need

- A Mac with the current Xcode (Mac App Store). Open it once so it installs its components.
- Node 22: `brew install node@22`, or the installer from nodejs.org.
- An iPhone with Developer Mode on: Settings → Privacy & Security → Developer Mode.
- For TestFlight and the App Store: the Apple Developer Program (£79 a year). Enrol at developer.apple.com/programs. The identity check takes 1 to 3 days, so start it first.

  Xcode's free personal team can install on your own phone for 7 days at a time. If Xcode says the personal team does not support HealthKit, you need the paid programme.

## Decide once, before the first upload

**Bundle id:** `app.gymai.coach` is set in `capacitor.config.ts` and in Xcode. It is permanent once the app exists in App Store Connect.

To change it:
1. Edit `appId` in `capacitor.config.ts`.
2. Run `npx cap sync ios`.
3. Set the same id in Xcode under the App target → General → Bundle Identifier.

## Build and run on your iPhone

```sh
git clone https://github.com/rafferty-chuter/gym-app.git
cd gym-app
git checkout claude/admiring-ptolemy-mz6jwu   # or main once merged
npm ci
npx cap sync ios
npx cap open ios
```

In Xcode:

1. Select the **App** target → **Signing & Capabilities**:
   - Tick "Automatically manage signing" and pick your team.
   - **HealthKit** should already be listed, because it comes from `App/App.entitlements`. If it isn't, press **+ Capability** → HealthKit.
2. Plug in the iPhone, pick it as the run destination at the top, and press **Run** (⌘R). The first build fetches the Swift packages, which takes a few minutes.
3. On the phone, the app opens the live site.

## Test in the simulator (no Apple account needed)

```sh
npx cap sync ios        # the app loads the live site
```

Then build the **App** scheme for an iPhone simulator (Xcode, or `xcodebuild -project ios/App/App.xcodeproj -scheme App -destination 'platform=iOS Simulator,name=iPhone 18 Pro' build`). To try changes before they are deployed, point the app at the dev server: `CAP_SERVER_URL=http://localhost:3000 npx cap sync ios`, rebuild, and **run `npx cap sync ios` again without it before any real build** so the app loads the live site. The simulator's Health app works for the Apple Health connection; Apple's permission sheet takes a few seconds to appear.

## Move your data in, once

The app does not share storage with the home-screen web app.

1. In the **home-screen web app**: Profile → Move to another phone → copy.
2. In the **iPhone app**: Profile → Import → paste.
3. In the iPhone app: Profile → Apple Health → **Connect Apple Health** → allow every type. The first read covers 60 days. Later reads re-read the last 14 days each time the app opens.
4. When the nights look right, turn off the Health Auto Export automation. The app no longer needs it.

## TestFlight

The texts to paste (What to Test, the beta description, the review notes, the App Privacy answers) and the Xcode checks are in `docs/plan/testers/testflight.md`.

1. In App Store Connect (appstoreconnect.apple.com), create the app with the bundle id above.
2. In Xcode, set the run destination to **Any iOS Device**, then Product → **Archive**. In the Organizer, Control-click the archive → Generate Privacy Report and check it against testflight.md §5. Then Validate App, then Distribute App → App Store Connect → Upload.
3. When processing finishes, about 15 minutes, add yourself as an internal tester. Install the build from the TestFlight app.

Every upload needs a higher build number than the last (App target → General → Build: 1, 2, 3, and so on). The version (1.0) changes only for an App Store release. Xcode can raise the build for you: in Distribute App choose Custom and leave "Manage Version and Build Number" ticked. `Info.plist` already answers the export-compliance question, so TestFlight doesn't ask it on each build.

## When a rebuild is needed

| Change | Rebuild? |
|---|---|
| Anything in the web app (pages, engine, copy) | No: it is live in the app after the Vercel deploy |
| A native plugin added or updated, `capacitor.config.ts`, `Info.plist`, entitlements, the privacy manifest, icon, launch screen | Yes: `npx cap sync ios`, then build in Xcode. A new plugin also needs its Swift checked for required-reason APIs (`lib/__tests__/iosPrivacy.test.ts` fails until it is) |
| A new App Store version | Yes: raise the version and build, archive, upload |

## Before App Store review (not needed for TestFlight)

- **A privacy policy URL** is required for any app that uses HealthKit. Health data may not be used for advertising or sold.
- **Guideline 4.2 (minimum functionality).** Reviewers reject apps that are only a website. The case for this one is the direct HealthKit read and the on-device data copy; say so in the review notes.
- **Screenshots** at 6.9-inch and 6.5-inch sizes.

## Not in the app yet (B11 step 2)

- **Android.** `npx cap add android` and Health Connect through the same plugin.

## How it fits together

| File | What it does |
|---|---|
| `capacitor.config.ts` | The live site URL, the offline page, the bundle id |
| `ios/` | The Xcode project. Info.plist has the Health usage text, the export-compliance answer and portrait only; `App.entitlements` has HealthKit; `PrivacyInfo.xcprivacy` is the privacy manifest (testflight.md §1) |
| `native/www/` | The offline page, shown when the live site can't load |
| `lib/nativeApp.ts` | `isNativeApp()`: true only inside the app |
| `lib/health/native.ts` | Pure: HealthKit samples → the samples the Health Auto Export path already merges (one sleep source a night, the morning weigh-in, the day's mean HRV) |
| `lib/physique/io/nativeHealth.ts` | Connect, sync on open and on return, and the Apple Health sheet's state |
| `lib/storage/nativeMirror.ts`, `components/NativeShell.tsx` | The data copy in the app's Library folder: written in the background, restored when storage comes back empty |

Plugins (pinned):
- `@capgo/capacitor-health` 8.10.6 (MPL-2.0) reads HealthKit.
- `@capacitor/filesystem` 8.1.3 holds the data copy.
- `@capacitor/local-notifications` 8.3.1 (MIT) schedules the daily reminder on the phone (TR11): `lib/physique/localReminders.ts` (pure plan), `lib/physique/io/nativeReminders.ts`, `components/physique/NativeReminderSync.tsx`. No APNs or server.
