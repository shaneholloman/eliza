# Issue #12639 evidence - roles metadata connector registry

## Scope

- PR: #13144
- Branch: `fix/12639-roles-discord-decouple`
- Packages touched: `packages/core`, `packages/shared`, `plugins/plugin-discord-local`
- Behavior surface: core role/world resolution and connector metadata declarations
- Not in scope: Discord desktop send/receive automation, UI, model prompts, database schema, native/mobile capture

## Behavior verified

- Core role identity projection no longer branches on `source === "discord"` in `roles.ts`.
- Discord flat metadata fields are declared as connector metadata (`fromId` / `entityName`) and projected generically into nested connector identity.
- Discord world id derivation is declared as ordered connector metadata (`discordServerId`, then `discordChannelId`) and resolved generically.
- Missing or blank declared user-id fields fail closed.
- Explicit nested `metadata[source]` identity takes precedence over flat-field projection.
- A new connector can opt into identity projection by registering connector metadata, with no core role-code edit.
- Runtime-registered metadata can override the legacy Discord default and unregistering the owner restores the default.
- `plugin-discord-local` declares the same mapping on its `connectorSources` contract.
- Core source-mode barrel now exports `./connectors.ts`, so tests and shared source-mode consumers do not resolve stale checked-in sidecar JavaScript.

## Verification

| Check | Result | Notes |
| --- | --- | --- |
| `bun run --cwd packages/core test src/roles.test.ts src/access-context.test.ts src/entities.trusted-components.test.ts` | PASS | 3 files, 46 tests |
| `bun run --cwd packages/shared test src/connectors.test.ts` | PASS | 1 file, 9 tests |
| `bun run --cwd packages/core typecheck` | PASS | Core typecheck clean |
| `bun run --cwd packages/shared typecheck` | PASS | Shared typecheck clean |
| `bun run --cwd plugins/plugin-discord-local typecheck` | PASS | Discord-local connector declaration compiles |
| `bunx @biomejs/biome check packages/core/src/connectors.ts packages/core/src/index.node.ts packages/core/src/roles.ts packages/core/src/roles.test.ts packages/shared/src/connectors.ts packages/shared/src/connectors.test.ts plugins/plugin-discord-local/src/index.ts` | PASS | Touched-file lint/format/import-order check |
| `bun run --cwd packages/core build` | PASS | Core Node/browser/edge/testing build completed |
| `bun run --cwd packages/shared build:dist` | PASS | Shared package build completed |
| `bun run --cwd plugins/plugin-discord-local build` | PASS | Discord-local build completed |
| `rg -n "source\\s*===\\s*['\\\"]discord['\\\"]|discordServerId|discordChannelId" packages/core/src/roles.ts; test $? -eq 1` | PASS | Old Discord role literals absent from executable `roles.ts` |
| `bun run --cwd plugins/plugin-discord-local lint:check` | PASS | Package lint clean |
| `bun run --cwd packages/core lint:check` | BLOCKED | Unrelated existing formatting diagnostics in PII swap tests and prompt batcher |
| `bun run --cwd packages/shared lint:check` | BLOCKED | Unrelated existing formatting diagnostic in `src/voice/aec/echo-alignment.ts` |
| `bun run audit:type-safety-ratchet` | PASS | No new weak typing; baseline can shrink |
| `bun run audit:error-policy-ratchet` | PASS | No new fallback-slop in touched files |
| `git diff --check` | PASS | No whitespace errors |
| `bun run verify` | BLOCKED | Repo-level CLAUDE/AGENTS and both ratchets passed; Turbo then stopped at unrelated `@elizaos/tui#lint` diagnostics around control-character regex/node-protocol/non-null assertions. Verify write-mode side effects in native runtime scripts were restored. |

## Notes

- Initial focused tests exposed stale source-mode sidecar resolution: `roles.ts` and the core source barrel used extensionless imports/exports that resolved checked-in stale `.js` files during Vitest/shared source-mode tests. This update points the touched role path and source barrel at `connectors.ts`, matching the new connector registry contract.
- Live Discord desktop round-trip evidence is N/A because this PR changes connector-owned metadata declarations and core role/world resolution, not Discord IPC, OAuth, message ingestion, or outbound UI automation.
- Screenshots/video are N/A because no UI surface changed.
- Live LLM trajectory is N/A because no model/action/provider turn behavior changed.
- Database/migration evidence is N/A because no schema or persistence changes were made.
