import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  /** Routes retired in the cleaning pass (CL1). Their reads live on Train and the signal pages. */
  async redirects() {
    return [
      { source: "/coach", destination: "/train", permanent: false },
      { source: "/coach/review", destination: "/train", permanent: false },
      { source: "/analysis", destination: "/train", permanent: false },
      { source: "/progress", destination: "/signal/progress", permanent: false },
      { source: "/volume", destination: "/signal/volume", permanent: false },
    ];
  },
};

export default nextConfig;
