"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";

/** Routines now live on Train (TR3), each with its own Start; old links land there. */
export default function TemplatesRedirect() {
  const router = useRouter();
  useEffect(() => {
    router.replace("/train");
  }, [router]);
  return <main className="min-h-screen" style={{ background: "#0a0a0b" }} aria-busy />;
}
