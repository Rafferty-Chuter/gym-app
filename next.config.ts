import type { NextConfig } from "next";
import { execSync } from "node:child_process";

/**
 * Which build this is, for the version in Profile and in error reports
 * (TR3, `lib/appVersion.ts`): Vercel's commit for a Git deploy, the local
 * commit for a build from a checkout, else the build time in UTC (a CLI
 * deploy uploads no `.git`).
 */
function buildId(): string {
  const vercelSha = process.env.VERCEL_GIT_COMMIT_SHA;
  if (vercelSha) return vercelSha.slice(0, 7);
  try {
    const sha = execSync("git rev-parse --short=7 HEAD", { stdio: ["ignore", "pipe", "ignore"] }).toString().trim();
    if (/^[0-9a-f]{7}$/.test(sha)) return sha;
  } catch {
    // No git here; fall through to the build time.
  }
  return new Date().toISOString().slice(0, 16).replace("T", " ");
}

const nextConfig: NextConfig = {
  env: {
    NEXT_PUBLIC_APP_BUILD: buildId(),
  },
  /** Routes retired in the cleaning pass (CL1). Their reads live on Train and the signal pages. */
  async redirects() {
    return [
      { source: "/review", destination: "/report", permanent: false },
      { source: "/workout/start", destination: "/train", permanent: false },
      { source: "/coach", destination: "/train", permanent: false },
      { source: "/coach/review", destination: "/train", permanent: false },
      { source: "/analysis", destination: "/train", permanent: false },
      { source: "/progress", destination: "/exercises", permanent: false },
      { source: "/signal/plateau", destination: "/exercises", permanent: false },
      { source: "/signal/progress", destination: "/exercises", permanent: false },
      { source: "/volume", destination: "/signal/volume", permanent: false },
    ];
  },
};

export default nextConfig;
