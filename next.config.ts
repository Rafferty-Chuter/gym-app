import type { NextConfig } from "next";

const nextConfig: NextConfig = {
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
