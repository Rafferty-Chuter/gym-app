import { notFound } from "next/navigation";
import SeedPhysiqueClient from "./SeedPhysiqueClient";

/** Dev-only: seed a scenario into the physique repos (after a backup) or clear them. 404 in production. */
export default function SeedPhysiquePage() {
  if (process.env.NODE_ENV === "production") notFound();
  return <SeedPhysiqueClient />;
}
