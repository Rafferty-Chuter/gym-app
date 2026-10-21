import { notFound } from "next/navigation";
import DevCrashClient from "./DevCrashClient";

/** Dev-only: throw on purpose to see the error screen and the `[client-error]` log line (TR3). Never reads or writes user data. 404 in production. */
export default function DevCrashPage() {
  if (process.env.NODE_ENV === "production") notFound();
  return <DevCrashClient />;
}
