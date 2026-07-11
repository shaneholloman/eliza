/**
 * Vitest configuration for the orchestrator package: Node environment, shared setup file, and the unit + `src` test globs.
 */
import { defineConfig } from "vitest/config";

export default defineConfig({
  resolve: {
    alias: {
      "@elizaos/auth": new URL(
        "../../packages/auth/src/index.ts",
        import.meta.url,
      ).pathname,
    },
  },
  test: {
    environment: "node",
    setupFiles: ["./__tests__/setup.ts"],
    include: ["__tests__/**/*.test.ts", "src/__tests__/**/*.test.ts"],
    coverage: {
      reporter: ["text", "json", "html"],
    },
  },
});
