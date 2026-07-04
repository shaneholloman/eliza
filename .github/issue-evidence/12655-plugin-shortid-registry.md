# Issue #12655 evidence - registry-owned optional plugin short ids

## Scope

- PR: #13143
- Branch: `fix/12655-plugin-shortid-registry`
- Packages touched: `packages/agent`, `packages/registry`, first-party plugin registry entries
- Behavior surface: runtime optional plugin name collection for `plugins.allow`, `plugins.entries`, and `config.features`
- Not in scope: UI, model prompts/actions, connector I/O, persistence, native/mobile capture

## Behavior verified

- Registry-owned optional aliases now live in each declaring plugin's `registry-entry.json` `shortIds` field.
- `packages/registry` generates `short-id-plugin-map.json` from those declarations, including stable sorted output.
- Duplicate short-id claims across different npm packages fail loudly during generation.
- Entries without `npmName` do not emit short-id package aliases.
- The agent collector layers the generated registry map over the explicitly marked legacy host-owned fallback.
- Short IDs such as `evm`, `wallet`, `browser`, `vision`, and `discordLocal` resolve to canonical package names instead of bare package literals.
- Legacy host-owned aliases for plugins without registry entries still resolve.
- Formatting was normalized for the touched registry JSON manifests.

## Verification

| Check | Result | Notes |
| --- | --- | --- |
| `bun run --cwd packages/registry test src/first-party/short-id-plugin-map.test.ts` | PASS | 1 file, 5 tests |
| `bun run --cwd packages/agent test src/runtime/plugin-collector-short-id-map.test.ts src/runtime/plugin-collector-channel-map.test.ts` | PASS | 2 files, 6 tests; package export-order warning only |
| `bun run --cwd packages/registry generate:first-party:check` | PASS | Generated artifacts are up to date |
| `bun run --cwd packages/registry test` | PASS | 6 files, 31 tests |
| `bun run --cwd packages/registry typecheck` | PASS | Registry typecheck clean |
| `bun run --cwd packages/agent typecheck` | BLOCKED | Existing optional-plugin and Discord metadata diagnostics: missing `@elizaos/plugin-streaming`, `@elizaos/plugin-vision`, `@elizaos/plugin-background-runner`, `@elizaos/plugin-meetings`; `platformMessageId` missing on `MemoryMetadata` in `plugins/plugin-discord/messages.ts` |
| `bunx @biomejs/biome check <touched files>` | PASS | Touched-file lint/format/import-order check clean after formatting three registry JSON manifests |
| `bun run --cwd packages/registry lint:check` | PASS | Registry lint clean |
| `bun run --cwd packages/agent lint:check` | PASS | Exit 0; one unrelated informational `noUselessContinue` diagnostic in `src/providers/page-scoped-context.ts` |
| `bun run --cwd packages/agent build` | PASS | Agent dist build completed and rewrote 168 files |
| `bun run audit:type-safety-ratchet` | PASS | No new weak typing; baseline can shrink |
| `bun run audit:error-policy-ratchet` | PASS | No new fallback-slop in touched production files |
| `git diff --check` | PASS | No whitespace errors |
| `bun run verify` | BLOCKED | Repo-level CLAUDE/AGENTS and both ratchets passed; Turbo then stopped at unrelated `@elizaos/tui#lint` diagnostics around node-protocol imports, non-null assertions, and control-character regexes. Verify write-mode side effects in app/native plugin files were restored. |

## Notes

- Live LLM trajectory is N/A because this change affects deterministic plugin-name collection and registry generation, not model/provider/action/evaluator turn behavior.
- Backend runtime logs are N/A because the covered path is the pure collector/generator contract; focused tests assert the exact package names that would be loaded.
- Screenshots/video are N/A because no UI surface changed.
- Database/migration evidence is N/A because no persistence schema changed.
- Native/mobile capture is N/A because the runtime behavior is package-name resolution before plugin load, with no platform-specific bridge changes.
