/**
 * Screenshots of Progress on the showcase history (`lib/physique/showcaseData.ts`),
 * at iPhone size in light and dark, for posts to testers. The data is made
 * up: caption every image as example data, never as someone's own log.
 *
 * 1. A dev server running this repo (`npm run dev`).
 * 2. PLAYWRIGHT=/path/to/node_modules/playwright/index.mjs node scripts/showcase-screens.mjs [out dir]
 *
 * Each run uses a fresh browser profile: it seeds the SHOWCASE preset on
 * /dev/seed-physique (dev only), then opens /body. Nothing touches a real
 * browser's data. Prints the cards' text so the captions can quote it.
 */

import { mkdirSync } from "node:fs";
import { join } from "node:path";

const { chromium } = await import(process.env.PLAYWRIGHT ?? "playwright");

const APP = process.env.APP_URL ?? "http://localhost:3000";
const OUT = process.argv[2] ?? "showcase-out";
mkdirSync(OUT, { recursive: true });

// The tab bar would sit in the middle of a full-page shot, and Next's dev badge in every shot.
const HIDE_DEV = "nav.fixed, nextjs-portal { display: none !important; }";
// The sticky page header too, which would sit over a card's own screenshot.
const HIDE_BARS = `${HIDE_DEV} header.sticky { visibility: hidden !important; }`;

const browser = await chromium.launch();
try {
  for (const scheme of ["light", "dark"]) {
    const context = await browser.newContext({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 3, colorScheme: scheme, isMobile: true, hasTouch: true, locale: "en-GB", timezoneId: "Europe/London" });
    const page = await context.newPage();

    await page.goto(`${APP}/dev/seed-physique`);
    await page.getByRole("button", { name: /SHOWCASE/ }).click();
    await page.getByRole("status").filter({ hasText: "Seeded" }).waitFor({ timeout: 30_000 });

    await page.goto(`${APP}/body`);
    const conn = page.locator('section[aria-label="Connections"]');
    const found = page.locator('section[aria-label="Findings"]');
    await conn.waitFor({ timeout: 30_000 });
    await page.waitForTimeout(800);

    await page.screenshot({ path: join(OUT, `progress-${scheme}.png`), fullPage: true, style: HIDE_DEV });
    await conn.screenshot({ path: join(OUT, `connections-${scheme}.png`), style: HIDE_BARS });

    // The first connection opened: the sessions behind it.
    await conn.locator("button[aria-expanded]").first().click();
    await page.waitForTimeout(600);
    await conn.screenshot({ path: join(OUT, `connection-open-${scheme}.png`), style: HIDE_BARS });

    // The first finding opened: what studies found.
    if (await found.count()) {
      await found.locator("button[aria-expanded]").first().click();
      await page.waitForTimeout(400);
      await found.screenshot({ path: join(OUT, `finding-open-${scheme}.png`), style: HIDE_BARS });
    }

    if (scheme === "light") {
      console.log("── Connections ──\n" + (await conn.innerText()));
      if (await found.count()) console.log("── Findings ──\n" + (await found.innerText()));
    }
    await context.close();
  }
} finally {
  await browser.close();
}
console.log(`Saved to ${OUT}`);
