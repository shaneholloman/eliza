# Issue #12637 evidence - widget visibility declarations

## Scope

- PR: #13145
- Branch: `fix/12637-widget-visibility-declarations`
- Packages touched: `packages/core`, `packages/ui`
- User-facing surface: app home/widget registry behavior
- Not in scope: model prompts, backend routes, database schema, native/mobile bridge behavior, audio

## Behavior verified

- Built-in widget visibility is declared on `PluginWidgetDeclaration.visibility` instead of hardcoded executable plugin-id sets.
- The historical `todo` / `todos` drift is pinned: the `todo.items` home declaration resolves on an empty plugin snapshot through `visibility: "fallback"`.
- Explicit `present + disabled` plugin snapshot entries still hide `fallback` and `always` declarations.
- Snapshot-class widgets remain hidden until their plugin is present and active/enabled.
- Server-provided declarations remain snapshot-gated regardless of any visibility flag.
- Third-party `registerBuiltinWidgetDeclarations({ fallbackPluginIds })` compatibility still promotes flag-less declarations to fallback behavior.
- Widget README and core type docs now describe declaration-driven visibility instead of the removed set-based behavior.

## Verification

| Check | Result | Notes |
| --- | --- | --- |
| `bun run --cwd packages/ui test src/widgets/registry.visibility-drift.test.ts src/widgets/registry.home.test.ts src/widgets/registry.defaultWidget.test.ts src/widgets/widget-coverage.test.ts src/widgets/home-priority-integration.test.ts src/widgets/WidgetHost.test.tsx src/widgets/WidgetHost.home-rank.test.tsx src/widgets/visibility.test.ts src/widgets/home-priority.test.ts src/components/chat/widgets/todo.test.tsx` | PASS | 10 files, 94 tests |
| `bun run --cwd packages/ui test src/widgets/registry.visibility-drift.test.ts` | PASS | 1 file, 7 tests |
| `bun run --cwd packages/core typecheck` | PASS | Core contract compiles |
| `bun run --cwd packages/ui typecheck` | PASS | UI contract compiles |
| `bunx @biomejs/biome check packages/core/src/types/plugin.ts packages/ui/src/widgets/registry.ts packages/ui/src/widgets/registry.visibility-drift.test.ts packages/ui/src/widgets/README.md` | PASS | Touched-file lint/format check |
| `bun run --cwd packages/core lint` | PASS | Biome write-mode fixed unrelated files; side effects restored |
| `bun run --cwd packages/ui lint:check` | BLOCKED | Unrelated existing diagnostics in cloud route-gate, first-run conductor, chat callback, and TTS playback tests |
| `bun run --cwd packages/core build && bun run --cwd packages/ui build` | PASS | Core Node/browser/edge/testing build and UI package build completed |
| `ELIZA_NODE_PATH=/Users/shawwalters/.nvm/versions/node/v24.15.0/bin/node bun run --cwd packages/app audit:app` | PASS | 373/373 passed; broken=0, needs-work=0, needs-eyeball=25, good=347; first attempt without override was blocked by Node 23.3.0 |
| `bun run audit:type-safety-ratchet` | PASS | No new weak typing; baseline can shrink |
| `bun run audit:error-policy-ratchet` | PASS | No new fallback-slop in touched files |
| `bun run verify` | BLOCKED | Repo-level CLAUDE/AGENTS and both ratchets passed, then unrelated `@elizaos/tui#lint` failed on existing control-character regex / non-null assertion diagnostics; write-mode side effects were restored |
| `git diff --check` | PASS | No whitespace errors |

## N/A evidence

- Live LLM trajectory: N/A. This is deterministic widget registry/type behavior and does not invoke model-backed agent actions.
- Backend logs: N/A. No server route or runtime service path changed.
- Database/migration evidence: N/A. No schema or persistence changes.
- Audio/native capture: N/A. No voice, transcript, mobile bridge, desktop bridge, or native code changed.
