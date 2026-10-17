import type { MetadataRoute } from "next";

/**
 * Web app manifest. `display: standalone` is what lets an iPhone
 * home-screen install receive web push (Sprint 0, G5); the colours match
 * DESIGN.md so the launch frame is the app's own near-black.
 */
export default function manifest(): MetadataRoute.Manifest {
  return {
    name: "Gym AI",
    short_name: "Gym AI",
    description: "Food, weight, sleep and training in one place, with a plain read on whether the plan is working.",
    start_url: "/",
    display: "standalone",
    background_color: "#0a0a0b",
    theme_color: "#0a0a0b",
    icons: [
      { src: "/icons/icon-192.png", sizes: "192x192", type: "image/png" },
      { src: "/icons/icon-512.png", sizes: "512x512", type: "image/png" },
      { src: "/icons/maskable-512.png", sizes: "512x512", type: "image/png", purpose: "maskable" },
    ],
  };
}
