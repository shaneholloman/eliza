/**
 * Vitest configuration for the CLI package unit tests; templates are excluded
 * because generated projects carry their own test configuration.
 */

import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { defineConfig } from "vitest/config";

const rootDir = dirname(fileURLToPath(import.meta.url));
// Vite alias replacements must be POSIX-separated even on Windows.
const toVitePath = (value: string): string => value.replaceAll("\\", "/");
const agentSrc = resolve(rootDir, "../agent/src");

export default defineConfig({
  resolve: {
    alias: [
      // `migrate.test.ts` exercises the real `@elizaos/agent` importer via the
      // `./services/agent-export` subpath. That subpath only resolves to source
      // through the package's `eliza-source`/`bun` export conditions, which
      // vitest does not apply — bare resolution falls through to `./dist`, which
      // is absent when this suite runs standalone (e.g. the Windows CI lane
      // builds only core/shared, not agent). Anchor the subpath to source; its
      // transitive imports are `@elizaos/core` (prebuilt) plus sibling source.
      {
        find: /^@elizaos\/agent\/services\/agent-export$/,
        replacement: toVitePath(resolve(agentSrc, "services/agent-export.ts")),
      },
    ],
  },
  test: {
    environment: "node",
    include: ["src/**/*.test.ts"],
    exclude: ["dist/**", "**/node_modules/**", "templates/**"],
  },
});
