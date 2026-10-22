import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { Component, act, type ReactNode } from "react";
import { createRoot, type Root } from "react-dom/client";
import { renderToStaticMarkup } from "react-dom/server";
import PageError from "@/app/error";
import GlobalError from "@/app/global-error";
import { resetClientErrorReportsForTest } from "@/lib/errors/reportClientError";
import type { ClientErrorPayload } from "@/lib/errors/clientError";

// React only runs effects inside act() when it is told it's in a test.
(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

/** Stands in for the boundary Next wraps each page in: a page that throws renders `app/error.tsx` instead. */
class Boundary extends Component<{ children: ReactNode }, { error: Error | null }> {
  state = { error: null as Error | null };
  static getDerivedStateFromError(error: Error) {
    return { error };
  }
  render() {
    return this.state.error ? <PageError error={this.state.error} /> : this.props.children;
  }
}

/** A page that reads a stored weigh-in and crashes on it. */
function CrashingPage(): ReactNode {
  const stored = JSON.parse(localStorage.getItem("physique.weighIns.v1") ?? "[]") as Array<{ kg: number; date: string }>;
  throw new Error(`Weigh-in ${stored[0].kg} kg on ${stored[0].date} is out of range`);
}

describe("error screen (TR3)", () => {
  const fetchMock = vi.fn(async () => new Response(null, { status: 204 }));
  let container: HTMLDivElement;
  let root: Root;

  beforeEach(() => {
    resetClientErrorReportsForTest();
    fetchMock.mockClear();
    vi.stubGlobal("fetch", fetchMock);
    // React logs a caught render error to the console; that's expected here.
    vi.spyOn(console, "error").mockImplementation(() => {});
    localStorage.clear();
    localStorage.setItem("physique.weighIns.v1", JSON.stringify([{ id: "w1", date: "2026-10-19", kg: 83.71 }]));
    window.history.replaceState(null, "", "/body?date=2026-10-19");
    container = document.createElement("div");
    document.body.appendChild(container);
    root = createRoot(container);
  });

  afterEach(() => {
    act(() => root.unmount());
    container.remove();
    vi.unstubAllEnvs();
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
  });

  it("a page that throws shows the error screen and reports it without the stored values", () => {
    act(() => {
      root.render(
        <Boundary>
          <CrashingPage />
        </Boundary>,
      );
    });
    expect(container.querySelector("h1")?.textContent).toBe("Something went wrong");
    expect(container.textContent).toContain("Your log is still saved on this phone");
    const reload = [...container.querySelectorAll("button")].find((b) => b.textContent === "Reload");
    expect(reload).toBeDefined();
    expect(container.textContent).toMatch(/Liftworks 1\.0 beta \(.+\)/);

    expect(fetchMock).toHaveBeenCalledTimes(1);
    const [url, init] = fetchMock.mock.calls[0] as unknown as [string, RequestInit];
    expect(url).toBe("/api/client-error");
    const body = JSON.parse(String(init.body)) as ClientErrorPayload;
    expect(Object.keys(body).sort()).toEqual(["appVersion", "message", "route", "source", "stack"]);
    expect(body.source).toBe("boundary");
    expect(body.route).toBe("/body");
    expect(body.message).toBe("Error: Weigh-in # kg on #-#-# is out of range");
    const sent = JSON.stringify(body).replace(/:\d+:\d+/g, "");
    expect(sent).not.toContain("83.71");
    expect(sent).not.toContain("2026-10-19");
  });

  it("offers Send feedback only when the feedback form is set", async () => {
    act(() => root.render(<PageError error={new Error("boom")} />));
    expect(container.querySelector("a")).toBeNull();

    // The form's address is read once at build time (lib/feedback.ts), so load the screen afresh with it set.
    vi.stubEnv("NEXT_PUBLIC_TALLY_FEEDBACK_URL", "https://tally.so/r/abc123");
    vi.resetModules();
    const { default: PageErrorWithForm } = await import("@/app/error");
    act(() => root.render(<PageErrorWithForm error={new Error("boom again")} />));
    const link = container.querySelector("a");
    expect(link?.textContent).toBe("Send feedback");
    expect(link?.getAttribute("href")).toBe("https://tally.so/r/abc123");
    expect(link?.getAttribute("rel")).toContain("noopener");
  });

  it("the root error screen brings its own document", () => {
    const html = renderToStaticMarkup(<GlobalError error={new Error("layout failed")} />);
    expect(html.startsWith("<html")).toBe(true);
    expect(html).toContain("<body");
    expect(html).toContain("Something went wrong");
    expect(html).toContain("Reload");
  });
});
