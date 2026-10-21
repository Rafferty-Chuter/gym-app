"use client";

import ErrorScreen from "@/components/errors/ErrorScreen";

/** A page that throws while rendering shows this inside the app's frame, tab bar included (TR3). */
export default function PageError({ error }: { error: Error & { digest?: string } }) {
  return <ErrorScreen error={error} source="boundary" />;
}
