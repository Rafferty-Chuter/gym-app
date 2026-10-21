/**
 * The app version testers quote (TR3): shown under Profile → About and on
 * the error screen, and sent with every client error report.
 */

/** The release name. It tracks MARKETING_VERSION in `ios/App` (1.0) while the app is in TestFlight. */
export const APP_RELEASE = "1.0 beta";

/**
 * Which web build: the short commit, or the build time (UTC) when the
 * commit isn't known. The iPhone app loads the live site, so this, not the
 * iOS build number, says which code a tester ran. Set by `next.config.ts`;
 * "dev" where Next didn't build it (tests).
 */
export const APP_BUILD = process.env.NEXT_PUBLIC_APP_BUILD || "dev";

/** "1.0 beta (2c2c083)". */
export const APP_VERSION = `${APP_RELEASE} (${APP_BUILD})`;
