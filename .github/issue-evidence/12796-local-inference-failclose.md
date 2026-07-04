# Issue #12796: local inference bootstrap fail-closed sweep

Date: 2026-07-04

## Change

- `plugins/plugin-ollama/models/availability.ts` now throws `OllamaModelUnavailableError` when model discovery cannot reach the daemon, when model pull cannot reach the daemon, or when model pull returns a non-OK response. These paths no longer collapse into a silent "model absent" fallback.
- `plugins/plugin-ollama/__tests__/availability.test.ts` covers show success, daemon-unreachable show failure, pull success, pull rejected by fetch, and pull non-OK response.
- Existing fallback-slop annotations remain scoped to the audited local-inference surfaces:
  - `plugins/plugin-aosp-local-inference/src/aosp-local-inference-bootstrap.ts`
  - `plugins/plugin-cli-inference/src/account-rotation.ts`
  - `plugins/plugin-cli-inference/src/claude-cli.ts`
  - `plugins/plugin-cli-inference/src/claude-sdk-session.ts`
  - `plugins/plugin-cli-inference/src/codex-cli-exec.ts`
  - `plugins/plugin-cli-inference/src/codex-sdk-session.ts`
  - `plugins/plugin-cli-inference/src/sandbox.ts`
  - `plugins/plugin-lmstudio/models/embedding.ts`
  - `plugins/plugin-lmstudio/models/text.ts`
  - `plugins/plugin-lmstudio/utils/detect.ts`
  - `plugins/plugin-lmstudio/utils/model-usage.ts`
  - `plugins/plugin-local-inference/src/services/downloader.ts`
  - `plugins/plugin-ollama/models/embedding.ts`
  - `plugins/plugin-ollama/models/text.ts`
  - `plugins/plugin-ollama/plugin.ts`
  - `plugins/plugin-ollama/utils/ai-sdk-wire.ts`
  - `plugins/plugin-ollama/utils/modelUsage.ts`

## Verification

- PASS: `bun run --cwd plugins/plugin-ollama test`
  - 4 files passed, 2 skipped; 33 tests passed, 5 skipped.
- PASS: `bun run --cwd plugins/plugin-ollama typecheck`
- PASS: `bun run --cwd plugins/plugin-ollama build`
- PASS: `bun run --cwd plugins/plugin-lmstudio test`
  - 5 files passed; 49 tests passed.
- PASS: `bun run --cwd plugins/plugin-lmstudio typecheck`
- PASS: `bun run --cwd plugins/plugin-lmstudio build`
- PASS: `bun run --cwd plugins/plugin-cli-inference test`
  - 7 files passed; 93 tests passed, 1 skipped.
- PASS: `bun run --cwd plugins/plugin-cli-inference typecheck`
- PASS: `bun run --cwd plugins/plugin-cli-inference build`
- PASS: `bun run --cwd plugins/plugin-aosp-local-inference test`
  - 104 tests passed.
- PASS: `bun run --cwd plugins/plugin-aosp-local-inference typecheck`
- PASS: `bun run --cwd plugins/plugin-aosp-local-inference build`
- PASS: `bun run --cwd plugins/plugin-local-inference typecheck`
- PASS: touched-file Biome check:
  - `bunx biome check plugins/plugin-aosp-local-inference/src/aosp-local-inference-bootstrap.ts plugins/plugin-cli-inference/src/account-rotation.ts plugins/plugin-cli-inference/src/claude-cli.ts plugins/plugin-cli-inference/src/claude-sdk-session.ts plugins/plugin-cli-inference/src/codex-cli-exec.ts plugins/plugin-cli-inference/src/codex-sdk-session.ts plugins/plugin-cli-inference/src/sandbox.ts plugins/plugin-lmstudio/models/embedding.ts plugins/plugin-lmstudio/models/text.ts plugins/plugin-lmstudio/utils/detect.ts plugins/plugin-lmstudio/utils/model-usage.ts plugins/plugin-local-inference/src/services/downloader.ts plugins/plugin-ollama/__tests__/availability.test.ts plugins/plugin-ollama/models/availability.ts plugins/plugin-ollama/models/embedding.ts plugins/plugin-ollama/models/text.ts plugins/plugin-ollama/plugin.ts plugins/plugin-ollama/utils/ai-sdk-wire.ts plugins/plugin-ollama/utils/modelUsage.ts`
  - Result: checked 19 files, no fixes applied.
- PASS: `bun run verify` branch-specific preflight stages before workspace lint:
  - `check:agents-claude`
  - `audit:type-safety-ratchet`
  - `audit:error-policy-ratchet` reported "no new fallback-slop in touched files".

## Blocked / unrelated checks

- BLOCKED: `bun run --cwd plugins/plugin-local-inference test src/services/downloader.test.ts`
  - 12 of 26 tests failed before the touched downloader code paths due existing fixture/catalog validation:
    `Invalid Eliza-1 manifest: defaultEligible: true requires all required kernels, supported backends, and evals to pass; kernels.required: missing required kernel for tier 2b: mtp`.
- BLOCKED: `bun run verify`
  - Fails in unrelated `@elizaos/tui#lint` control-character regex diagnostics.
  - The same root run also showed unrelated existing lint diagnostics in `@elizaos/security#lint`.
  - Root lint write-mode side effects in `packages/app/scripts/patch-ios-plist.mjs` and `plugins/plugin-local-inference/src/services/voice/__fixtures__/voice-workbench-logic-baseline.json` were restored before committing.

## Live-provider notes

- Not captured: real Ollama trajectory. `curl -sS --max-time 2 http://localhost:11434/api/tags` failed to connect to the local daemon.
- Not captured: real LM Studio trajectory. `curl -sS --max-time 2 http://localhost:1234/v1/models` failed to connect to the local server.
- Not captured: AOSP device trajectory. No attached Android device was reported by the local `adb devices` probe.
- CLI binaries were present for Claude and Codex, but no live credentialed provider run was captured for this PR. The code change under review is the fail-closed provider bootstrap behavior and is covered by deterministic fetch-level tests.
