"use client";

import { useEffect } from "react";
import "./globals.css";
import ErrorScreen from "@/components/errors/ErrorScreen";
import { readAppearance } from "@/lib/ui/appearance";

/**
 * When the root layout itself throws, this replaces the whole document
 * (TR3), so it brings its own <html>, <body> and styles, and applies a
 * pinned light or dark choice from Profile itself.
 */
export default function GlobalError({ error }: { error: Error & { digest?: string } }) {
  useEffect(() => {
    const a = readAppearance();
    if (a !== "auto") document.documentElement.dataset.theme = a;
  }, []);
  return (
    <html lang="en">
      <body className="antialiased">
        <title>Something went wrong · Liftworks</title>
        <ErrorScreen error={error} source="global" />
      </body>
    </html>
  );
}
