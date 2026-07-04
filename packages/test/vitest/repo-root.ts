/** Configures the repo root shared Vitest lane used by workspace package tests. */
import { resolveRepoRootFromImportMeta } from "../../app-core/scripts/lib/repo-root.mjs";

export const repoRoot = resolveRepoRootFromImportMeta(import.meta.url);
