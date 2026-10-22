import { defineConfig } from "vitest/config";
import path from "node:path";

export default defineConfig({
  resolve: {
    alias: {
      "@": path.resolve(__dirname, "."),
    },
  },
  test: {
    environment: "happy-dom",
    include: ["**/__tests__/**/*.test.ts", "**/__tests__/**/*.test.tsx"],
    exclude: ["node_modules", ".next", ".agents", ".claude"],
    // The engines' made-up-data studies (IN4, IN5, IN9) take 1 to 3 s alone and past the 5 s default when every file runs in parallel.
    testTimeout: 30_000,
  },
});
