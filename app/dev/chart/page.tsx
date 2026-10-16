import { notFound } from "next/navigation";
import DevChartClient from "./DevChartClient";

/** Dev-only gallery of the U1 primitives on a seeded 8-week series. Never reads or writes user data. */
export default function DevChartPage() {
  if (process.env.NODE_ENV === "production") notFound();
  return <DevChartClient />;
}
