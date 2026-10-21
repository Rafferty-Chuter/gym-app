"use client";

import { useEffect } from "react";
import { reportClientError } from "@/lib/errors/reportClientError";

/**
 * Reports errors React's error screens never see (TR3): ones thrown in
 * event handlers, timers and promises. Renders nothing; mounted once in
 * the root layout.
 */
export default function ClientErrorReporter() {
  useEffect(() => {
    const onError = (e: ErrorEvent) => {
      // Without an error object (a cross-origin script), only the browser's message is known.
      reportClientError(e.error ?? { name: "Error", message: e.message }, "window");
    };
    const onRejection = (e: PromiseRejectionEvent) => reportClientError(e.reason, "rejection");
    window.addEventListener("error", onError);
    window.addEventListener("unhandledrejection", onRejection);
    return () => {
      window.removeEventListener("error", onError);
      window.removeEventListener("unhandledrejection", onRejection);
    };
  }, []);
  return null;
}
