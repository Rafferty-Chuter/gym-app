import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { buildClientErrorPayload, isNoiseError, scrubMessage, scrubRoute, scrubStack, type ClientErrorPayload } from "@/lib/errors/clientError";
import { MAX_REPORTS_PER_PAGE, reportClientError, resetClientErrorReportsForTest } from "@/lib/errors/reportClientError";
import { POST } from "@/app/api/client-error/route";

// ── Made-up stored data (TR3: a report must never carry any of it) ──

const WEIGH_IN = { id: "w1", date: "2026-10-19", kg: 83.71, loggedAt: "2026-10-19T06:12:00.000Z", source: "manual", schemaVersion: 1 };
const FOOD = { id: "f1", date: "2026-10-19", name: "Greek yoghurt", brand: "Fage", kcal: 2437, proteinG: 187.5, source: "search", schemaVersion: 1 };
const SLEEP = { id: "s1", date: "2026-10-19", hours: 7.35, bedtime: "23:05", wake: "06:40", source: "health", schemaVersion: 1 };
const EMAIL = "tester@example.com";

/** Every stored value as it could appear in text. Times have a leading zero, so a stack's line:col can't match them. */
const STORED_VALUES = ["83.71", "83,71", "2026-10-19", "06:12", "Greek yoghurt", "yoghurt", "Fage", "2437", "187.5", "7.35", "23:05", "06:40", EMAIL];

function seedStorage(): void {
  localStorage.setItem("physique.weighIns.v1", JSON.stringify([WEIGH_IN]));
  localStorage.setItem("physique.food.v1", JSON.stringify([FOOD]));
  localStorage.setItem("physique.sleep.v1", JSON.stringify([SLEEP]));
  localStorage.setItem("account.email", JSON.stringify(EMAIL));
}

/** Line and column numbers in stack frames are code positions, not data; drop them before looking for values. */
function withoutPositions(text: string): string {
  return text.replace(/:\d+:\d+/g, ":L:C").replace(/:\d+\)/g, ":L)");
}

function expectNoStoredValues(p: ClientErrorPayload): void {
  const text = withoutPositions(JSON.stringify(p));
  for (const v of STORED_VALUES) expect(text, `payload leaked "${v}"`).not.toContain(v);
}

const ctx = { source: "boundary" as const, route: "/food?date=2026-10-19#entry-2437", appVersion: "1.0 beta (2c2c083)" };

/** Errors the way app code could really produce them from stored data. */
function realisticErrors(): unknown[] {
  const errors: unknown[] = [];
  const capture = (fn: () => unknown) => {
    try {
      fn();
    } catch (e) {
      errors.push(e);
    }
  };
  // A truncated stored record: V8 quotes the snippet it choked on.
  capture(() => JSON.parse(localStorage.getItem("physique.food.v1")!.slice(0, 48)));
  capture(() => JSON.parse(`${localStorage.getItem("physique.weighIns.v1")}x`));
  // Values interpolated into a message, plain and as JSON.
  capture(() => {
    throw new Error(`Weigh-in ${WEIGH_IN.kg} kg on ${WEIGH_IN.date} at 06:12 is out of range`);
  });
  capture(() => {
    throw new RangeError(`Bad food entry ${JSON.stringify(FOOD)}`);
  });
  capture(() => {
    throw new Error(`Sleep '${SLEEP.bedtime}' to '${SLEEP.wake}' (${SLEEP.hours} h) for ${EMAIL}`);
  });
  // A decimal comma, as a UK/EU locale might format it.
  capture(() => {
    throw new Error(`Trend ${String(WEIGH_IN.kg).replace(".", ",")} kg`);
  });
  // A message over several lines: Chrome repeats it at the top of the stack.
  capture(() => {
    throw new Error(`Import failed\n  row: ${FOOD.name}, ${FOOD.kcal} kcal\n  next: ${SLEEP.hours} h`);
  });
  // Non-errors thrown or rejected: the value itself is the data.
  errors.push(FOOD, `${WEIGH_IN.kg}`, [SLEEP.bedtime], { message: `Unexpected "${FOOD.name}" (${FOOD.kcal})`, stack: `Error: ${FOOD.name}\n    at x (https://gym.example/body?date=${WEIGH_IN.date}&kg=${WEIGH_IN.kg}:3:9)` });
  return errors;
}

describe("client error payload (TR3)", () => {
  beforeEach(() => {
    localStorage.clear();
    seedStorage();
  });

  it("never contains a stored value, however the error was made", () => {
    const errors = realisticErrors();
    expect(errors.length).toBeGreaterThanOrEqual(11);
    for (const e of errors) expectNoStoredValues(buildClientErrorPayload(e, ctx));
  });

  it("has exactly the five fields, with the route stripped of its query and hash", () => {
    const p = buildClientErrorPayload(new TypeError("x"), ctx);
    expect(Object.keys(p).sort()).toEqual(["appVersion", "message", "route", "source", "stack"]);
    expect(p.route).toBe("/food");
    expect(p.appVersion).toBe("1.0 beta (2c2c083)");
    expect(p.source).toBe("boundary");
  });

  it("keeps what helps debugging: the error name, a property V8 names, React's error code and the frames", () => {
    let thrown: unknown;
    try {
      const entry = (JSON.parse(localStorage.getItem("physique.food.v1")!) as Array<{ macros?: { kcal: number } }>)[0];
      thrown = entry.macros!.kcal;
    } catch (e) {
      thrown = e;
    }
    const p = buildClientErrorPayload(thrown, ctx);
    expect(p.message).toBe("TypeError: Cannot read properties of undefined (reading 'kcal')");
    expect(p.stack.split("\n")[0]).toMatch(/^at /);
    expect(scrubMessage("Minified React error #418; visit https://react.dev/errors/418?args[]=83.71 for the full message")).toBe(
      "Minified React error #418; visit https://react.dev/errors/# for the full message",
    );
  });

  it("describes a thrown non-error by its type only", () => {
    expect(buildClientErrorPayload(FOOD, ctx).message).toBe("Non-error thrown (object)");
    expect(buildClientErrorPayload("83.71", ctx).message).toBe("Non-error thrown (string)");
    expect(buildClientErrorPayload(null, ctx).message).toBe("Non-error thrown (null)");
  });

  it("keeps only stack frames, without URL queries", () => {
    const stack = [
      "Error: Weigh-in 83.71 kg",
      "on 2026-10-19",
      "    at save (https://gym.example/_next/static/chunks/app.js?dpl=dpl_9xQ:12:345)",
      "    at https://gym.example/body?date=2026-10-19:1:20",
      "save@https://gym.example/_next/static/chunks/app.js?dpl=dpl_9xQ:12:345",
      "forEach@[native code]",
    ].join("\n");
    expect(scrubStack(stack).split("\n")).toEqual([
      "at save (https://gym.example/_next/static/chunks/app.js:12:345)",
      "at https://gym.example/body:1:20",
      "save@https://gym.example/_next/static/chunks/app.js:12:345",
      "forEach@[native code]",
    ]);
  });

  it("scrubbing twice changes nothing (the server scrubs again)", () => {
    for (const e of realisticErrors()) {
      const p = buildClientErrorPayload(e, ctx);
      expect(scrubMessage(p.message)).toBe(p.message);
      expect(scrubStack(p.stack)).toBe(p.stack);
      expect(scrubRoute(p.route)).toBe(p.route);
    }
  });

  it("skips browser noise", () => {
    expect(isNoiseError(buildClientErrorPayload({ message: "ResizeObserver loop completed with undelivered notifications." }, ctx))).toBe(true);
    expect(isNoiseError(buildClientErrorPayload({ name: "Error", message: "Script error." }, ctx))).toBe(true);
    expect(isNoiseError(buildClientErrorPayload({ message: "boom", stack: "at x (chrome-extension://abc/inject.js:1:2)" }, ctx))).toBe(true);
    expect(isNoiseError(buildClientErrorPayload(new Error("boom"), ctx))).toBe(false);
  });
});

describe("reportClientError (TR3)", () => {
  const fetchMock = vi.fn(async () => new Response(null, { status: 204 }));

  beforeEach(() => {
    resetClientErrorReportsForTest();
    fetchMock.mockClear();
    vi.stubGlobal("fetch", fetchMock);
    localStorage.clear();
    seedStorage();
    window.history.replaceState(null, "", "/food?date=2026-10-19");
  });
  afterEach(() => vi.unstubAllGlobals());

  it("posts the scrubbed payload once per message, and at most a handful a page", () => {
    reportClientError(new Error(`Weigh-in ${WEIGH_IN.kg} kg`), "window");
    reportClientError(new Error(`Weigh-in ${WEIGH_IN.kg} kg`), "boundary");
    expect(fetchMock).toHaveBeenCalledTimes(1);
    const [url, init] = fetchMock.mock.calls[0] as unknown as [string, RequestInit];
    expect(url).toBe("/api/client-error");
    const body = JSON.parse(String(init.body)) as ClientErrorPayload;
    expect(body).toMatchObject({ source: "window", route: "/food", message: "Error: Weigh-in # kg" });
    expectNoStoredValues(body);
    for (let i = 0; i < 20; i++) reportClientError(new Error(`distinct ${"x".repeat(i)}`), "window");
    expect(fetchMock).toHaveBeenCalledTimes(MAX_REPORTS_PER_PAGE);
  });
});

// ── The route ──

function post(body: unknown, ip = "203.0.113.7"): Request {
  return new Request("http://localhost/api/client-error", {
    method: "POST",
    headers: { "Content-Type": "application/json", "x-forwarded-for": ip },
    body: typeof body === "string" ? body : JSON.stringify(body),
  });
}

describe("POST /api/client-error (TR3)", () => {
  const logged: string[] = [];
  beforeEach(() => {
    logged.length = 0;
    vi.spyOn(console, "error").mockImplementation((...args: unknown[]) => {
      logged.push(args.map(String).join(" "));
    });
  });
  afterEach(() => vi.restoreAllMocks());

  const valid = { source: "boundary", message: "TypeError: x is undefined", stack: "at f (https://gym.example/a.js:1:2)", route: "/food", appVersion: "1.0 beta (2c2c083)" };

  it("logs one line with exactly the five fields", async () => {
    const res = await POST(post(valid, "203.0.113.1"));
    expect(res.status).toBe(204);
    expect(logged).toHaveLength(1);
    expect(logged[0].startsWith("[client-error] ")).toBe(true);
    const entry = JSON.parse(logged[0].slice("[client-error] ".length)) as Record<string, unknown>;
    expect(Object.keys(entry).sort()).toEqual(["appVersion", "message", "route", "source", "stack"]);
  });

  it("scrubs again, so a client that sent raw values still logs none", async () => {
    const raw = {
      ...valid,
      message: `Error: weigh-in ${WEIGH_IN.kg} kg on ${WEIGH_IN.date}, "${FOOD.name}" ${FOOD.kcal} kcal, ${EMAIL}`,
      stack: `Error: ${FOOD.name}\n    at f (https://gym.example/body?date=${WEIGH_IN.date}:1:2)`,
    };
    expect((await POST(post(raw, "203.0.113.2"))).status).toBe(204);
    const text = withoutPositions(logged.join("\n"));
    for (const v of STORED_VALUES) expect(text).not.toContain(v);
  });

  it("refuses extra fields, a route with a query, bad JSON and an oversize body", async () => {
    expect((await POST(post({ ...valid, weightKg: 83.71 }, "203.0.113.3"))).status).toBe(400);
    expect((await POST(post({ ...valid, route: "/food?date=2026-10-19" }, "203.0.113.3"))).status).toBe(400);
    expect((await POST(post({ ...valid, source: "server" }, "203.0.113.3"))).status).toBe(400);
    expect((await POST(post("{not json", "203.0.113.3"))).status).toBe(400);
    expect((await POST(post({ ...valid, stack: "x".repeat(13_000) }, "203.0.113.3"))).status).toBe(413);
    expect(logged).toHaveLength(0);
  });

  it("rate-limits one address", async () => {
    const statuses: number[] = [];
    for (let i = 0; i < 25; i++) statuses.push((await POST(post(valid, "198.51.100.9"))).status);
    expect(statuses.slice(0, 20).every((s) => s === 204)).toBe(true);
    expect(statuses.slice(20).every((s) => s === 429)).toBe(true);
    // Another address is unaffected.
    expect((await POST(post(valid, "198.51.100.10"))).status).toBe(204);
  });
});
