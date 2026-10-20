import type { CapacitorConfig } from "@capacitor/cli";

/**
 * The iPhone app (B11): a native shell around the live site, so the web app
 * and the app ship from one deploy. The shell adds what a home-screen web
 * app can't have: Apple Health read directly on the phone (no Health Auto
 * Export) and a durable copy of the app's data. Build and sign on a Mac:
 * docs/plan/B11-iphone-app.md.
 *
 * `appId` is the App Store bundle id: pick it before the first TestFlight
 * upload, because it cannot change afterwards.
 */
const config: CapacitorConfig = {
  appId: "app.gymai.coach",
  appName: "Gym AI",
  // Shown only when the live site can't load (offline on first open).
  webDir: "native/www",
  server: {
    url: "https://gym-app-eta-nine.vercel.app",
    errorPath: "offline.html",
  },
  ios: {
    // The page draws its own safe areas (DESIGN.md), as it does on the home screen.
    contentInset: "never",
  },
};

export default config;
