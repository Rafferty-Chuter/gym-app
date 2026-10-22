/**
 * Instagram ad images for the tester ad test (docs/plan/testers/ad-test.md),
 * each as a 4:5 feed image (1080 × 1350) and a 9:16 Story / Reels image
 * (1080 × 1920), in the app's own colours and type:
 * - "connections": the showcase Connections screenshot;
 * - "insights": a squat estimated-1RM chart with the sessions after short
 *   nights marked, then three findings in plain words (performance after
 *   short nights, recovery signals, the food log against the weight), each
 *   one something the app really reads, with its numbers under it.
 * The numbers are made up, so every image carries an "Example data" label
 * on it, not only in a caption.
 *
 * PLAYWRIGHT=/path/to/node_modules/playwright/index.mjs node scripts/ad-images.mjs [out dir]
 *
 * Needs no dev server. Retake `docs/plan/testers/showcase/` first if
 * Progress changes (scripts/showcase-screens.mjs).
 */

import { mkdirSync, readFileSync } from "node:fs";
import { join } from "node:path";

const { chromium } = await import(process.env.PLAYWRIGHT ?? "playwright");

const OUT = process.argv[2] ?? "docs/plan/testers/ads";
mkdirSync(OUT, { recursive: true });

const shot = readFileSync("docs/plan/testers/showcase/connections-light.png").toString("base64");
const font = readFileSync("node_modules/next/dist/esm/next-devtools/server/font/geist-latin.woff2").toString("base64");

// The screenshot is 1050 × 1929 (390 px wide at 3×). Its first 1000 px hold the title and the
// sleep, HRV and carbs rows, ending on a row's edge, so nothing shows half cut.
const SHOT_W = 1050;

// ── Shared page ──

function head(w, h) {
  return `<!doctype html><html><head><meta charset="utf-8"><style>
  @font-face { font-family: Geist; src: url(data:font/woff2;base64,${font}) format("woff2"); font-weight: 100 900; }
  :root { --page-top: #d9e6ec; --background: #edf2f0; --surface: #fafcfb; --text: #17272a; --text-secondary: #4a5d5f; --text-tertiary: #677a7a;
    --primary: #2f6b55; --text-on-primary: #f4faf6; --border: #dce4e0; --sky-dim: #d4e2ec; --sky-strong: #3d6d92;
    --hrv-dim: #f3dde4; --hrv: #b8456a; --watch-dim: #f4e6cf; --watch: #b0731a; }
  * { box-sizing: border-box; margin: 0; }
  body { width: ${w}px; height: ${h}px; font-family: Geist, system-ui, sans-serif; color: var(--text);
    background: linear-gradient(180deg, var(--page-top) 0px, var(--background) ${Math.round(h * 0.45)}px);
    display: flex; flex-direction: column; align-items: center; }
  .kicker { font-size: 26px; font-weight: 600; letter-spacing: 0.08em; text-transform: uppercase; color: var(--primary); }
  h1 { margin-top: 20px; font-size: 64px; line-height: 1.08; font-weight: 700; letter-spacing: -0.02em; text-align: center; }
  .sub { margin-top: 18px; font-size: 32px; line-height: 1.3; color: var(--text-secondary); text-align: center; max-width: 900px; }
  .badge { background: var(--text); color: var(--text-on-primary); font-size: 24px; font-weight: 600; padding: 10px 20px; border-radius: 999px; }
  .foot { margin-top: auto; font-size: 28px; font-weight: 500; color: var(--text-secondary); text-align: center; }
  .foot b { color: var(--primary); font-weight: 600; }
  </style></head>`;
}

const FOOT = `<p class="foot"><b>Free 8-week beta</b> · Built for natural lifters</p>`;

// ── "connections": the Connections screenshot ──

function connectionsPage({ w, h, padTop, padBottom, cardW, cropH, headline, sub }) {
  const cardH = Math.round((cropH * cardW) / SHOT_W);
  return `${head(w, h)}<body style="padding: ${padTop}px 64px ${padBottom}px">
  <style>
  .card { position: relative; flex-shrink: 0; margin-top: 44px; width: ${cardW}px; height: ${cardH}px; border-radius: 40px; overflow: hidden;
    box-shadow: 0 24px 60px rgba(23, 39, 42, 0.16); border: 1px solid var(--border); background: var(--surface); }
  .card img { width: ${cardW}px; display: block; }
  .card .badge { position: absolute; top: 24px; right: 24px; z-index: 2; }
  </style>
  <div class="kicker">Liftworks · iPhone beta</div>
  <h1>${headline}</h1>
  <p class="sub">${sub}</p>
  <div class="card"><span class="badge">Example data</span><img src="data:image/png;base64,${shot}" alt=""></div>
  ${FOOT}
  </body></html>`;
}

// ── "insights": a lifting chart, then three findings in plain words ──

const ICON = {
  moon: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M20 14.5A8 8 0 1 1 9.5 4a6.5 6.5 0 0 0 10.5 10.5z"/></svg>`,
  pulse: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M3 12h4l2-5 4 10 2-5h6"/></svg>`,
  scale: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="4" y="4" width="16" height="16" rx="4"/><path d="M9 10a3 3 0 0 1 6 0"/><path d="M12 10l1.5-1.5"/></svg>`,
  barbell: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round"><path d="M2 12h20"/><path d="M5 8v8"/><path d="M8 6v12"/><path d="M16 6v12"/><path d="M19 8v8"/></svg>`,
};

/** The three findings: each something the app reads (Connections, the recovery read, the food log against the weight trend and maintenance). */
const INSIGHTS = [
  { icon: "moon", tint: "var(--sky-dim)", ink: "var(--sky-strong)", title: "Weaker after short nights", data: "Estimated 1RM about 4% lower after nights under 6½&nbsp;h · 30&nbsp;sessions" },
  { icon: "pulse", tint: "var(--hrv-dim)", ink: "var(--hrv)", title: "Low-HRV mornings, weaker sessions", data: "HRV 47 vs 60&nbsp;ms · estimated 1RM about 3% lower" },
  { icon: "scale", tint: "var(--watch-dim)", ink: "var(--watch)", title: "Logged 500 kcal under, weight barely moved", data: "Maintenance re-estimated from your weight, or food is missing from the log" },
];

/**
 * 16 weeks of squat sessions as estimated 1RM: a slow rise, day-to-day
 * noise, and the sessions after a night under 6½ hours about 4% lower and
 * marked. Made up (seeded), like the cards.
 */
function liftChartSvg(W, H) {
  let seed = 7;
  const r = () => (seed = (seed * 1664525 + 1013904223) >>> 0) / 2 ** 32;
  const n = 46;
  const PAD_X = 100;
  const PAD_Y = 16;
  const lo = 147;
  const hi = 164;
  const x = (i) => PAD_X + (i * (W - PAD_X - 12)) / (n - 1);
  const y = (kg) => PAD_Y + ((hi - kg) * (H - 2 * PAD_Y)) / (hi - lo);
  const pts = Array.from({ length: n }, (_, i) => {
    const short = r() < 0.33;
    const kg = (155 + (5 * i) / (n - 1)) * (1 + (r() - 0.5) * 0.024) * (short ? 0.96 : 1);
    return { i, kg, short };
  });
  const grid = [150, 160]
    .map((kg) => `<line x1="${PAD_X}" x2="${W - 12}" y1="${y(kg)}" y2="${y(kg)}" stroke="#dce4e0" stroke-width="2"/><text x="0" y="${y(kg) + 8}" font-size="22" fill="#677a7a">${kg} kg</text>`)
    .join("");
  const usual = `<line x1="${x(0)}" y1="${y(155)}" x2="${x(n - 1)}" y2="${y(160)}" stroke="#4a5d5f" stroke-width="2.5" stroke-dasharray="8 8"/>`;
  const dots = pts
    .map((p) => (p.short ? `<circle cx="${x(p.i)}" cy="${y(p.kg)}" r="8" fill="#3d6d92"/>` : `<circle cx="${x(p.i)}" cy="${y(p.kg)}" r="7" fill="#fafcfb" stroke="#a07a12" stroke-width="3.5"/>`))
    .join("");
  return `<svg width="${W}" height="${H}" viewBox="0 0 ${W} ${H}" font-family="Geist, system-ui, sans-serif">${grid}${usual}${dots}</svg>`;
}

function insightsPage({ w, h, padTop, padBottom, gap, chartH, headline, sub }) {
  const cards = INSIGHTS.map(
    (c) => `<div class="ins"><span class="ico" style="background:${c.tint};color:${c.ink}">${ICON[c.icon]}</span>
    <span class="txt"><span class="t">${c.title}</span><span class="d">${c.data}</span></span></div>`
  ).join("");
  return `${head(w, h)}<body style="padding: ${padTop}px 64px ${padBottom}px">
  <style>
  .kicker { display: flex; align-items: center; gap: 12px; }
  .kicker svg { width: 34px; height: 34px; }
  h1 { font-size: 62px; }
  .sub { font-size: 30px; }
  .stack { position: relative; flex-shrink: 0; margin: 0; width: 952px; display: flex; flex-direction: column; gap: ${gap}px; }
  .stack > .badge { position: absolute; top: -22px; right: 24px; z-index: 2; }
  .panel, .ins { border-radius: 32px; background: var(--surface); border: 1px solid var(--border); box-shadow: 0 16px 40px rgba(23, 39, 42, 0.10); }
  .panel { padding: 28px 32px 22px; }
  .ph { display: flex; justify-content: space-between; align-items: baseline; margin-bottom: 14px; }
  .ph .t { font-size: 30px; font-weight: 650; }
  .ph .m { font-size: 22px; color: var(--text-tertiary); }
  .legend { display: flex; gap: 28px; margin-top: 10px; font-size: 22px; color: var(--text-secondary); }
  .legend i { display: inline-block; width: 16px; height: 16px; border-radius: 50%; margin-right: 8px; vertical-align: -1px; }
  .ins { display: flex; gap: 24px; align-items: center; padding: 24px 30px; }
  .ico { flex-shrink: 0; width: 64px; height: 64px; border-radius: 20px; display: flex; align-items: center; justify-content: center; }
  .ico svg { width: 34px; height: 34px; }
  .txt { display: flex; flex-direction: column; gap: 6px; }
  .ins .t { font-size: 31px; line-height: 1.2; font-weight: 650; letter-spacing: -0.01em; }
  .d { font-size: 23px; line-height: 1.35; color: var(--text-secondary); }
  </style>
  <div class="kicker">${ICON.barbell}<span>Liftworks · for natural lifters</span></div>
  <h1>${headline}</h1>
  <p class="sub">${sub}</p>
  <div style="flex: 1 1 0; min-height: 50px"></div>
  <div class="stack"><span class="badge">Example data</span>
    <div class="panel">
      <div class="ph"><span class="t">Squat · estimated 1RM</span><span class="m">16 weeks · 46 sessions</span></div>
      ${liftChartSvg(886, chartH)}
      <div class="legend"><span><i style="background:#3d6d92"></i>After a night under 6½ h</span><span><i style="border:3.5px solid #a07a12;background:#fafcfb"></i>Other sessions</span><span>– – Your usual</span></div>
    </div>
    ${cards}
  </div>
  <div style="flex: 1 1 0; min-height: 30px"></div>
  <p class="foot"><b>Free 8-week iPhone beta</b> · first year free for 3 check-ins</p>
  </body></html>`;
}

// ── The images ──

const SUB_CONNECTIONS = "Your sleep, food and training, lined up against every top set. In kg.";
const SUB_INSIGHTS = "Your sleep, recovery and food, read against every session.";

const ADS = [
  { file: "ad-feed.png", w: 1080, h: 1350, html: () => connectionsPage({ w: 1080, h: 1350, padTop: 64, padBottom: 56, cardW: 840, cropH: 1000, headline: "What moves your lifts?", sub: SUB_CONNECTIONS }) },
  // Instagram covers about the top 250 px and bottom 340 px of a Story with its own controls.
  { file: "ad-story.png", w: 1080, h: 1920, html: () => connectionsPage({ w: 1080, h: 1920, padTop: 270, padBottom: 360, cardW: 900, cropH: 1000, headline: "What moves<br>your lifts?", sub: SUB_CONNECTIONS }) },
  { file: "ad-insights-feed.png", w: 1080, h: 1350, html: () => insightsPage({ w: 1080, h: 1350, padTop: 56, padBottom: 48, gap: 16, chartH: 190, headline: "What's moving your lifts?", sub: SUB_INSIGHTS }) },
  { file: "ad-insights-story.png", w: 1080, h: 1920, html: () => insightsPage({ w: 1080, h: 1920, padTop: 270, padBottom: 360, gap: 20, chartH: 230, headline: "What's moving<br>your lifts?", sub: SUB_INSIGHTS }) },
];

const browser = await chromium.launch();
try {
  for (const ad of ADS) {
    const p = await browser.newPage({ viewport: { width: ad.w, height: ad.h }, deviceScaleFactor: 1 });
    await p.setContent(ad.html(), { waitUntil: "load" });
    await p.evaluate(() => document.fonts.ready);
    await p.screenshot({ path: join(OUT, ad.file) });
    await p.close();
  }
} finally {
  await browser.close();
}
console.log(`Saved to ${OUT}`);
