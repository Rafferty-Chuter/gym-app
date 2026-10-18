"use client";

import { useEffect } from "react";

/**
 * The Monday review now lives inside the weekly report (W3), which opens on
 * the review's week while the review is due. Old links and notifications
 * land here and go on to /report.
 */
export default function ReviewRedirect() {
  useEffect(() => {
    window.location.replace("/report");
  }, []);
  return <main className="min-h-screen" style={{ background: "var(--page)" }} aria-busy />;
}
