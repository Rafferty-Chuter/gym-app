/**
 * End to end: accounts, consent and delete (PR4, TR1), and signing in from
 * the welcome screen on a fresh device (TR9), in Chromium against a fake
 * Supabase, with the app's real supabase-js and the real delete route.
 *
 * 1. Start the app pointed at the fake project (`.claude/launch.json`,
 *    "dev-accounts-fake"):
 *      NEXT_PUBLIC_SUPABASE_URL=https://fake-project.supabase.co \
 *      NEXT_PUBLIC_SUPABASE_ANON_KEY=test-anon-key \
 *      SUPABASE_URL=http://127.0.0.1:54399 SUPABASE_SERVICE_ROLE_KEY=test-service-key \
 *      npx next dev -p 3141
 * 2. PLAYWRIGHT=/path/to/node_modules/playwright/index.mjs node scripts/e2e-accounts.mjs [screenshots dir]
 *
 * The browser's calls to fake-project.supabase.co are answered through
 * Playwright's routing; the server's admin calls (the delete route) reach a
 * small HTTP server here on :54399. Both read one in-memory store, so a
 * row the phone pushes is a row the delete route deletes. Exits non-zero
 * on the first failed check. Uses made-up data only.
 */

import { createHash } from "node:crypto";
import { mkdirSync } from "node:fs";
import http from "node:http";
import { join } from "node:path";

const { chromium } = await import(process.env.PLAYWRIGHT ?? "playwright");

const APP = process.env.APP_URL ?? "http://localhost:3141";
const FAKE = "https://fake-project.supabase.co";
const ADMIN_PORT = Number(process.env.ADMIN_PORT ?? 54399);
const SERVICE_KEY = "test-service-key";
const OUT = process.argv[2] ?? "e2e-out";
const CODE = "123456";
const HEALTH_TOKEN = "e2e-health-token-0123456789abcdefghijklmnop";
mkdirSync(OUT, { recursive: true });

// ── The fake project's data ──

const store = {
  users: new Map(), // id -> { id, email }
  tokens: new Map(), // access token -> user id
  refresh: new Map(), // refresh token -> user id
  rows: new Map(), // `${uid}|${k}|${id}` -> row
  healthDevices: new Set(),
  healthSamples: new Map(), // device hash -> count
  log: [],
  pushes: [],
};
let clock = Date.parse("2026-10-21T08:00:00Z");
const sha = (s) => createHash("sha256").update(s, "utf8").digest("hex");
const b64 = (o) => Buffer.from(JSON.stringify(o)).toString("base64url");
const uuid = (email) => {
  const h = sha(email);
  return `${h.slice(0, 8)}-${h.slice(8, 12)}-4${h.slice(13, 16)}-8${h.slice(17, 20)}-${h.slice(20, 32)}`;
};

function session(uid) {
  const user = store.users.get(uid);
  const exp = Math.floor(Date.now() / 1000) + 3600;
  const access = `${b64({ alg: "HS256", typ: "JWT" })}.${b64({ sub: uid, email: user.email, aud: "authenticated", role: "authenticated", exp, session_id: sha(String(Math.random())).slice(0, 16) })}.ZmFrZS1zaWduYXR1cmU`;
  const refresh = sha(access).slice(0, 24);
  store.tokens.set(access, uid);
  store.refresh.set(refresh, uid);
  return { access_token: access, token_type: "bearer", expires_in: 3600, expires_at: exp, refresh_token: refresh, user: userJson(uid) };
}
const userJson = (uid) => ({ id: uid, aud: "authenticated", role: "authenticated", email: store.users.get(uid).email, app_metadata: { provider: "email" }, user_metadata: {}, created_at: "2026-10-21T08:00:00Z" });
const rowsOf = (uid) => [...store.rows.values()].filter((r) => r.user_id === uid);

function deleteUser(uid) {
  store.users.delete(uid);
  for (const [t, u] of store.tokens) if (u === uid) store.tokens.delete(t);
  for (const [t, u] of store.refresh) if (u === uid) store.refresh.delete(t);
  // `on delete cascade`
  for (const [key, r] of store.rows) if (r.user_id === uid) store.rows.delete(key);
}

// ── Browser side: Playwright answers the app's supabase-js ──

const cors = { "access-control-allow-origin": "*", "access-control-allow-headers": "*", "access-control-allow-methods": "GET,POST,PATCH,DELETE,OPTIONS", "access-control-expose-headers": "content-range" };
const reply = (route, status, body) => route.fulfill({ status, headers: { ...cors, "content-type": "application/json" }, body: body === undefined ? "" : JSON.stringify(body) });

async function browserRoute(route) {
  const req = route.request();
  const url = new URL(req.url());
  const method = req.method();
  if (method === "OPTIONS") return route.fulfill({ status: 204, headers: cors });
  store.log.push(`${method} ${url.pathname}`);
  const body = req.postData() ? JSON.parse(req.postData()) : null;
  const bearer = (req.headers().authorization ?? "").replace(/^Bearer /, "");
  const uid = store.tokens.get(bearer);
  const p = url.pathname;

  if (p === "/auth/v1/otp" && method === "POST") return reply(route, 200, {});
  if (p === "/auth/v1/verify" && method === "POST") {
    if (body.token !== CODE) return reply(route, 403, { code: 403, error_code: "otp_expired", msg: "Token has expired or is invalid" });
    const id = uuid(body.email);
    if (!store.users.has(id)) store.users.set(id, { id, email: body.email });
    return reply(route, 200, session(id));
  }
  if (p === "/auth/v1/token" && method === "POST") {
    const r = store.refresh.get(body?.refresh_token);
    return r && store.users.has(r) ? reply(route, 200, session(r)) : reply(route, 400, { code: 400, error_code: "refresh_token_not_found", msg: "Invalid Refresh Token" });
  }
  if (p === "/auth/v1/user") return uid && store.users.has(uid) ? reply(route, 200, userJson(uid)) : reply(route, 403, { code: 403, error_code: "user_not_found", msg: "User not found" });
  if (p === "/auth/v1/logout") {
    if (!uid) return reply(route, 404, { code: 404, error_code: "session_not_found", msg: "Session not found" });
    store.tokens.delete(bearer);
    return route.fulfill({ status: 204, headers: cors });
  }
  if (p === "/rest/v1/rpc/sync_push" && method === "POST") {
    if (!uid) return reply(route, 401, { message: "not signed in" });
    store.pushes.push({ uid, rows: body.rows });
    let n = 0;
    for (const r of body.rows) {
      const key = `${uid}|${r.k}|${r.id}`;
      const had = store.rows.get(key);
      if (had && r.updated_at < had.updated_at) continue;
      clock += 1000;
      store.rows.set(key, { user_id: uid, k: r.k, id: r.id, data: r.data ?? null, deleted: !!r.deleted, updated_at: r.updated_at, server_at: new Date(clock).toISOString() });
      n++;
    }
    return reply(route, 200, n);
  }
  if (p === "/rest/v1/sync_records" && method === "GET") {
    if (!uid) return reply(route, 401, { message: "not signed in" });
    const gt = url.searchParams.get("server_at")?.replace(/^gt\./, "");
    const offset = Number(url.searchParams.get("offset") ?? 0);
    const limit = Number(url.searchParams.get("limit") ?? 1000);
    const list = rowsOf(uid)
      .filter((r) => !gt || r.server_at > gt)
      .sort((a, b) => (a.server_at < b.server_at ? -1 : 1))
      .slice(offset, offset + limit)
      .map(({ k, id, data, deleted, updated_at, server_at }) => ({ k, id, data, deleted, updated_at, server_at }));
    return reply(route, 200, list);
  }
  return reply(route, 404, { message: `no fake for ${method} ${p}` });
}

// ── Server side: the delete route's admin calls ──

const admin = http.createServer((req, res) => {
  const url = new URL(req.url, `http://127.0.0.1:${ADMIN_PORT}`);
  const send = (status, body) => {
    res.writeHead(status, { "content-type": "application/json" });
    res.end(body === undefined ? "" : JSON.stringify(body));
  };
  const auth = (req.headers.authorization ?? "").replace(/^Bearer /, "");
  store.log.push(`server ${req.method} ${url.pathname}`);
  if (req.headers.apikey !== SERVICE_KEY) return send(401, { msg: "bad apikey" });
  if (url.pathname === "/auth/v1/user" && req.method === "GET") {
    const uid = store.tokens.get(auth);
    return uid && store.users.has(uid) ? send(200, userJson(uid)) : send(403, { code: 403, error_code: "user_not_found", msg: "User from sub claim in JWT does not exist" });
  }
  const del = /^\/auth\/v1\/admin\/users\/([0-9a-f-]{36})$/.exec(url.pathname);
  if (del && req.method === "DELETE") {
    if (auth !== SERVICE_KEY) return send(403, { msg: "not admin" });
    if (!store.users.has(del[1])) return send(404, { msg: "User not found" });
    deleteUser(del[1]);
    return send(200, {});
  }
  const hash = url.searchParams.get("device_hash")?.replace(/^eq\./, "");
  if (url.pathname === "/rest/v1/health_samples" && req.method === "DELETE") return store.healthSamples.delete(hash), send(204);
  if (url.pathname === "/rest/v1/health_devices" && req.method === "DELETE") return store.healthDevices.delete(hash), send(204);
  if (url.pathname.startsWith("/rest/v1/health_")) return send(200, []);
  send(404, { msg: "no fake" });
});
await new Promise((r) => admin.listen(ADMIN_PORT, "127.0.0.1", r));

// ── Checks ──

let failures = 0;
function check(ok, what) {
  console.log(`${ok ? "PASS" : "FAIL"}  ${what}`);
  if (!ok) failures++;
}

const browser = await chromium.launch();

async function phone(colorScheme) {
  const context = await browser.newContext({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 2, colorScheme });
  await context.route(`${FAKE}/**`, browserRoute);
  const page = await context.newPage();
  const errors = [];
  page.on("pageerror", (e) => errors.push(e.message));
  // Made-up data on the device, and an Apple Health link whose rows sit on the server.
  await page.goto(`${APP}/privacy`);
  await page.evaluate(
    ({ token }) => {
      const w = [1, 2, 3].map((i) => ({ id: `w${i}`, date: `2026-10-1${i}`, loggedAt: `2026-10-1${i}T07:00:00.000Z`, source: "manual", schemaVersion: 1, kg: 82 - i * 0.2 }));
      localStorage.setItem("physique.v1.weighIns", JSON.stringify(w));
      localStorage.setItem("physique.v1.healthLink", JSON.stringify({ token, createdAt: "2026-10-01T08:00:00.000Z" }));
    },
    { token: HEALTH_TOKEN },
  );
  store.healthDevices.add(sha(HEALTH_TOKEN));
  store.healthSamples.set(sha(HEALTH_TOKEN), 12);
  return { context, page, errors };
}

async function until(fn, ms = 15000) {
  const end = Date.now() + ms;
  while (Date.now() < end) {
    if (await fn()) return true;
    await new Promise((r) => setTimeout(r, 200));
  }
  return false;
}

const ls = (page, key) => page.evaluate((k) => localStorage.getItem(k), key);
const weighInIds = async (page) => JSON.parse((await ls(page, "physique.v1.weighIns")) ?? "[]").map((w) => w.id);
/** Full page, or the screen as seen once a sheet has finished sliding up. */
const shot = async (page, name) => {
  const sheet = await page.locator("[data-sheet-root]").count();
  if (sheet) await page.waitForTimeout(400);
  await page.screenshot({ path: join(OUT, `${name}.png`), fullPage: !sheet });
};

async function signIn(page, email) {
  await page.getByRole("checkbox").click();
  await page.getByRole("button", { name: "Continue" }).click();
  await page.getByLabel("Email").fill(email);
  await page.getByRole("button", { name: "Email me a code" }).click();
  await page.getByLabel("6-digit code").fill(CODE);
  await page.getByText(/^Synced /).waitFor({ timeout: 15000 });
}

// ── Run 1 (light): consent → sign in → sync → stop → back on → delete, keeping the device's data ──
{
  const { context, page, errors } = await phone("light");
  const before = store.log.length;
  await page.goto(`${APP}/account`);
  await page.getByRole("heading", { name: "Before you sign in" }).waitFor();
  await page.waitForTimeout(1500);
  check(store.log.length === before, "before the tick, nothing reaches the account (no request at all)");
  check(await page.getByRole("checkbox").getAttribute("aria-checked") === "false", "the consent tick starts empty");
  check(await page.getByRole("button", { name: "Continue" }).isDisabled(), "Continue is off until the tick");
  await shot(page, "consent-light");

  await page.getByRole("checkbox").click();
  await page.getByRole("button", { name: "Continue" }).click();
  const consent = JSON.parse((await ls(page, "consent.v1")) ?? "{}");
  check(consent.sync?.version === 1 && !!consent.sync?.at && consent.ai === null, "the tick is stored on the device as {version, at}, AI left off");
  await page.getByLabel("Email").fill("lifter@example.com");
  await page.getByRole("button", { name: "Email me a code" }).click();
  await page.getByLabel("6-digit code").fill("000000");
  await page.getByText("That code didn't work").waitFor();
  check(true, "a wrong code is refused");
  await page.getByLabel("6-digit code").fill(CODE);
  await page.getByText(/^Synced /).waitFor({ timeout: 15000 });
  const uid = uuid("lifter@example.com");
  const first = store.pushes.find((p) => p.uid === uid);
  check(first && first.rows.every((r) => r.k === "consent.v1"), "the first thing the account receives is the consent record");
  check(rowsOf(uid).some((r) => r.k === "consent.v1" && r.data?.kind === "sync" && r.data?.version === 1), "the account holds the consent {version, at}");
  check(rowsOf(uid).filter((r) => r.k === "physique.v1.weighIns").length === 3, "then the 3 weigh-ins sync");
  check(!rowsOf(uid).some((r) => r.k === "physique.v1.healthLink"), "the Apple Health token stays on the device");
  await shot(page, "signed-in-light");

  await page.getByRole("button", { name: "Stop syncing. Open" }).click();
  await shot(page, "stop-sheet-light");
  await page.getByRole("button", { name: "Stop syncing", exact: true }).click();
  await page.getByText("Sync is off on this device").waitFor();
  check(rowsOf(uid).some((r) => r.k === "consent.v1" && r.data?.withdrawnAt), "Stop syncing records the withdrawal in the account");
  await page.evaluate(() => {
    const w = JSON.parse(localStorage.getItem("physique.v1.weighIns"));
    w.push({ id: "w4", date: "2026-10-20", loggedAt: "2026-10-20T07:00:00.000Z", source: "manual", schemaVersion: 1, kg: 81.2 });
    localStorage.setItem("physique.v1.weighIns", JSON.stringify(w));
  });
  const pushesBefore = store.pushes.length;
  await page.reload();
  await page.getByText("Sync is off on this device").waitFor();
  await page.waitForTimeout(2000);
  check(store.pushes.length === pushesBefore && !rowsOf(uid).some((r) => r.id === "w4"), "with sync off, a new weigh-in stays on the device");
  await shot(page, "sync-off-light");

  await page.getByRole("button", { name: "Turn sync back on" }).click();
  check(await page.getByRole("button", { name: "Turn on sync" }).isDisabled(), "turning sync back on asks for a fresh tick");
  await page.getByRole("checkbox").click();
  await page.getByRole("button", { name: "Turn on sync" }).click();
  check(await until(() => rowsOf(uid).some((r) => r.id === "w4")), "after a fresh tick, the new weigh-in syncs");
  await page.getByText(/^Synced /).waitFor({ timeout: 15000 });
  check(rowsOf(uid).filter((r) => r.k === "consent.v1" && r.data?.kind === "sync").length === 2, "the account keeps both choices: the withdrawn one and the new one");

  await page.getByRole("button", { name: "Delete account. Open" }).click();
  await page.getByRole("dialog").getByText("Everything synced to it").waitFor();
  await shot(page, "delete-sheet-light");
  check(await page.getByRole("radio", { name: /Keep my data here/ }).getAttribute("aria-checked") === "true", "keeping this device's data is the default");
  await page.getByRole("button", { name: "Delete account", exact: true }).click();
  await page.getByText("Your account is deleted.").waitFor({ timeout: 15000 });
  check(!store.users.has(uid), "the account is deleted");
  check(rowsOf(uid).length === 0, "every synced row went with it");
  check(!store.healthDevices.has(sha(HEALTH_TOKEN)) && !store.healthSamples.has(sha(HEALTH_TOKEN)), "the Apple Health link's server rows are deleted");
  check(JSON.stringify(await weighInIds(page)) === JSON.stringify(["w1", "w2", "w3", "w4"]), "this device keeps its data");
  check((await ls(page, "sync.v1.auth")) === null && (await ls(page, "sync.v1.state")) === null, "signed out; no session or sync position left");
  check((await ls(page, "physique.v1.healthLink")) === null, "the Apple Health link is disconnected on the device");
  check(!!JSON.parse(await ls(page, "consent.v1")).sync.withdrawnAt, "the sync consent is marked withdrawn on the device");
  await shot(page, "deleted-light");
  await page.reload();
  await page.getByRole("heading", { name: "Before you sign in" }).waitFor();
  check(true, "after reload the page is signed out and asks for consent again");
  check(errors.length === 0, `no page errors (${errors.join(" | ") || "none"})`);
  await context.close();
}

// ── Run 2 (dark): delete and clear this device ──
{
  const { context, page, errors } = await phone("dark");
  await page.goto(`${APP}/account`);
  await page.getByRole("heading", { name: "Before you sign in" }).waitFor();
  await shot(page, "consent-dark");
  await signIn(page, "second@example.com");
  const uid = uuid("second@example.com");
  check(rowsOf(uid).filter((r) => r.k === "physique.v1.weighIns").length === 3, "a second person signs in and syncs");
  await shot(page, "signed-in-dark");
  await page.getByRole("button", { name: "Delete account. Open" }).click();
  await page.getByRole("radio", { name: /Clear this device too/ }).click();
  await shot(page, "delete-sheet-clear-dark");
  await page.getByRole("button", { name: "Delete account and clear this device" }).click();
  await page.waitForURL((u) => new URL(u).pathname !== "/account", { timeout: 15000 });
  await page.waitForTimeout(1500);
  check(!store.users.has(uid) && rowsOf(uid).length === 0, "account and rows deleted");
  check((await ls(page, "physique.v1.weighIns")) === null && (await ls(page, "consent.v1")) === null && (await ls(page, "sync.v1.auth")) === null, "this device is cleared too");
  check(errors.length === 0, `no page errors (${errors.join(" | ") || "none"})`);
  await shot(page, "after-clear-dark");
  await context.close();
}

// ── Runs 3 and 4: signing in from the welcome screen on a fresh device ──

/** A device with nothing on it, as after a reinstall or on a new phone. */
async function freshDevice(colorScheme) {
  const context = await browser.newContext({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 2, colorScheme });
  await context.route(`${FAKE}/**`, browserRoute);
  const page = await context.newPage();
  const errors = [];
  page.on("pageerror", (e) => errors.push(e.message));
  return { context, page, errors };
}

async function codeFor(page, email) {
  await page.getByLabel("Email").fill(email);
  await page.getByRole("button", { name: "Email me a code" }).click();
  await page.getByLabel("6-digit code").fill(CODE);
}

const pathOf = (page) => new URL(page.url()).pathname;
const welcomeSeen = async (page) => !!JSON.parse((await ls(page, "physique.v1.onboarding")) ?? "{}").welcomeSeenAt;

{
  // The account first gets data from another device.
  const a = await phone("light");
  await a.page.goto(`${APP}/account`);
  await a.page.getByRole("heading", { name: "Before you sign in" }).waitFor();
  await signIn(a.page, "returning@example.com");
  const uid = uuid("returning@example.com");
  check(rowsOf(uid).filter((r) => r.k === "physique.v1.weighIns").length === 3, "a returning person's account holds 3 weigh-ins from their old phone");
  await a.context.close();

  const { context, page, errors } = await freshDevice("light");
  await page.goto(`${APP}/`);
  await page.waitForURL((u) => new URL(u).pathname === "/welcome", { timeout: 15000 });
  const signInLink = page.getByRole("link", { name: "Sign in" });
  await signInLink.waitFor();
  check(true, "a fresh device opens on the welcome screen, which offers Sign in");
  await shot(page, "welcome-sign-in-light");
  const before = store.log.length;
  await signInLink.click();
  await page.getByRole("heading", { name: "Before you sign in" }).waitFor();
  check(pathOf(page) === "/welcome/sign-in", "Sign in opens the welcome's own sign-in page");
  check((await page.locator("nav[aria-label=Main]").count()) === 0, "no tab bar on it, as on the welcome screen");
  await page.waitForTimeout(1000);
  check(store.log.length === before, "before the tick, nothing reaches the account from here either");
  await shot(page, "welcome-consent-light");
  await page.getByRole("checkbox").click();
  await page.getByRole("button", { name: "Continue" }).click();
  await codeFor(page, "returning@example.com");
  await page.waitForURL((u) => new URL(u).pathname === "/", { timeout: 15000 });
  await page.waitForTimeout(1500);
  check(pathOf(page) === "/", "after the code, the person lands on Home and stays there");
  check(JSON.stringify((await weighInIds(page)).sort()) === JSON.stringify(["w1", "w2", "w3"]), "their 3 weigh-ins are on the new device");
  check(await welcomeSeen(page), "the welcome screen is marked seen, so it doesn't come back");
  check(errors.length === 0, `no page errors (${errors.join(" | ") || "none"})`);
  await shot(page, "welcome-signed-in-home-light");
  await context.close();
}

{
  // A new email: the account has nothing logged, so the page says so and offers Set up.
  const { context, page, errors } = await freshDevice("dark");
  await page.goto(`${APP}/welcome/sign-in`);
  await page.getByRole("checkbox").click();
  await page.getByRole("button", { name: "Continue" }).click();
  await codeFor(page, "new-person@example.com");
  await page.getByText("Nothing logged in this account yet").waitFor({ timeout: 15000 });
  check(pathOf(page) === "/welcome/sign-in" && (await page.getByText("new-person@example.com").count()) === 1, "an empty account says so, with the email it signed in as");
  await shot(page, "welcome-empty-dark");
  await page.getByRole("button", { name: "Set up" }).click();
  await page.waitForURL((u) => new URL(u).pathname === "/setup", { timeout: 15000 });
  check(await welcomeSeen(page), "Set up goes to the setup, the welcome marked seen");
  check(errors.length === 0, `no page errors (${errors.join(" | ") || "none"})`);
  await context.close();
}

{
  // A typo: "Use another email" signs out and asks for the email again, then the right account comes down.
  const { context, page, errors } = await freshDevice("dark");
  await page.goto(`${APP}/welcome/sign-in`);
  await page.getByRole("checkbox").click();
  await page.getByRole("button", { name: "Continue" }).click();
  await codeFor(page, "retuning@example.com");
  await page.getByText("Nothing logged in this account yet").waitFor({ timeout: 15000 });
  await page.getByRole("button", { name: "Use another email" }).click();
  await page.getByLabel("Email").waitFor();
  check(true, "Use another email signs out and goes back to the email (no second consent)");
  await codeFor(page, "returning@example.com");
  await page.waitForURL((u) => new URL(u).pathname === "/", { timeout: 15000 });
  check(JSON.stringify((await weighInIds(page)).sort()) === JSON.stringify(["w1", "w2", "w3"]), "the right account's weigh-ins arrive after the typo");
  check(errors.length === 0, `no page errors (${errors.join(" | ") || "none"})`);
  await shot(page, "welcome-after-typo-home-dark");
  await context.close();
}

// ── The route refuses a forged token from outside the app ──
{
  const res = await fetch(`${APP}/api/account/delete`, { method: "POST", headers: { authorization: "Bearer aaa.bbb.ccc", "content-type": "application/json" }, body: JSON.stringify({ confirm: "delete-account" }) });
  check(res.status === 401, "the delete route refuses a token Supabase doesn't know (401)");
}

await browser.close();
admin.close();
console.log(failures ? `\n${failures} check(s) failed` : "\nAll checks passed");
process.exit(failures ? 1 : 0);
