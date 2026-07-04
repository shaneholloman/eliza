# Issue #12693 - Connector Role Defaults Shared Catalog

## Scope

- PR: #13074
- Branch: `fix/12693-connector-role-catalog`
- Packages: `packages/shared`, `packages/ui`
- Refactor only: moves plugin-managed connector `defaultRole`, `defaultPurpose`, and `supportsOAuth` literals from the UI options map into `@elizaos/shared/connector-account-catalog`.
- No visual UI redesign, route behavior, database schema, migration, model, audio, native, or deployment surface changed.

## Behavior Verified

- The shared catalog preserves the historical connector defaults for telegram, signal, google, x/twitter, slack, and whatsapp.
- UI plugin-managed account options project role, purpose, and OAuth support directly from the shared catalog.
- Alias and plugin-prefix normalization still resolve `twitter -> x`, `gmail -> google`, `@elizaos/plugin-*`, and `plugin-*` forms.
- A grep guard prevents the deprecated UI-local `defaultRole: "..."`, `defaultPurpose: [...]`, and `supportsOAuth: true|false` object literals from returning to `connector-account-options.ts`.
- `@elizaos/shared/connector-account-catalog` builds as a dedicated subpath export and `@elizaos/ui` build/runtime export verification passes with the new import.

## Commands

| Command | Result |
| --- | --- |
| `bun run --cwd packages/shared test src/connector-account-catalog.test.ts` | PASS - 1 file, 10 tests |
| `bun run --cwd packages/ui test src/components/connectors/connector-account-catalog.test.ts src/components/connectors/connector-account-options.test.ts src/components/connectors/connector-mode-registry.test.ts` | PASS - 3 files, 24 tests |
| `bun run --cwd packages/shared typecheck` | PASS |
| `bun run --cwd packages/ui typecheck` | PASS |
| `bunx @biomejs/biome check packages/shared/src/connector-account-catalog.ts packages/shared/src/connector-account-catalog.test.ts packages/ui/src/components/connectors/connector-account-catalog.test.ts packages/ui/src/components/connectors/connector-account-options.ts` | PASS |
| `bun run --cwd packages/shared build:dist` | PASS |
| `bun run --cwd packages/ui build` | PASS |
| `bun run audit:type-safety-ratchet` | PASS |
| `bun run audit:error-policy-ratchet` | PASS - no new fallback-slop in touched files |
| `git diff --check` | PASS |
| `bun run verify` | BLOCKED by unrelated workspace lint (`@elizaos/tui#lint` reported as failed; log also includes plugin-computeruse diagnostics); root write-mode lint side effects were reverted |

Package lint notes:

- `bun run --cwd packages/shared lint:check` is blocked by unrelated formatting in `packages/shared/src/voice/aec/echo-alignment.ts`; touched connector catalog formatting is clean.
- `bun run --cwd packages/ui lint:check` is blocked by unrelated pre-existing diagnostics in cloud-route-gate, first-run, chat callback, and voice test files; touched connector files are clean.

## Evidence N/A

- Screenshots/video: N/A - no visible UI behavior changed; catalog values are asserted by tests.
- Browser/network capture: N/A - no HTTP route or browser workflow changed.
- Real-LLM trajectory: N/A - no prompt/model/action behavior changed.
- Audio/native/deploy capture: N/A - no audio, native bridge, mobile, desktop, or deployment path changed.
- Migration/DB state: N/A - no schema or persistence change.
