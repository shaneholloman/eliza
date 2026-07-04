# Evidence: #12633 route-mode declarations fail closed

PR: #13128
Branch: `fix/12633-route-mode-declared-failclose`

## What Changed

- Mode-sensitive route namespaces are declared in
  `PROTECTED_MODE_NAMESPACES`.
- Static route-mode rules are owner-tagged and reconciled by
  `assertMatrixReconciled()`.
- Unmatched paths under protected namespaces fail closed instead of
  default-allowing.
- Handler-declared plugin `route.modes` still take precedence over the static
  matrix.
- Slashless namespace roots such as `/api/cloud` and `/api/local-inference`
  are treated as protected and do not slip through the prefix matcher.

## Verification

### Focused Mode Tests

Command:

```bash
bun run --cwd packages/app-core test src/runtime/mode/route-mode-matrix.test.ts src/runtime/mode/route-mode-guard.test.ts src/runtime/mode/runtime-mode.test.ts src/runtime/mode/remote-forwarder.test.ts
```

Result:

```text
Test Files  4 passed (4)
Tests  47 passed (47)
```

Manual review:

- `route-mode-matrix.test.ts` covers protected namespace matching, bare-root
  fail-close behavior, sibling-prefix non-capture, reconciliation invariants,
  and synthetic protected-namespace drift where no rule matches.
- `route-mode-guard.test.ts` covers guard decisions with explicit mode input,
  handler-declared plugin route `modes` precedence, static catch-all behavior,
  protected namespace hiding, and default-allow outside protected namespaces.
- `runtime-mode.test.ts` and `remote-forwarder.test.ts` confirm the adjacent
  mode/remote forwarding contracts still pass.

### Touched-File Biome

Command:

```bash
bunx biome check packages/app-core/src/runtime/mode/route-mode-matrix.ts packages/app-core/src/runtime/mode/route-mode-matrix.test.ts packages/app-core/src/runtime/mode/route-mode-guard.ts packages/app-core/src/runtime/mode/route-mode-guard.test.ts
```

Result:

```text
Checked 4 files in 23ms. No fixes applied.
```

### App-Core Build

Command:

```bash
bun run --cwd packages/app-core build
```

Result:

```text
build:dist
[rewrite-dist-relative-imports] rewrote 119 file(s)
```

Exit code: 0.

### App-Core Typecheck

Command:

```bash
bun run --cwd packages/app-core typecheck
```

Result: blocked by unrelated existing workspace/module-resolution diagnostics
outside the touched route-mode files, including:

```text
../agent/src/api/server-route-dispatch.ts: Cannot find module '@elizaos/plugin-elizacloud/host-routes'
../agent/src/runtime/optional-plugin-imports.generated.ts: Cannot find module '@elizaos/plugin-vision'
src/api/ios-local-agent-transport.ts: Cannot find module '@elizaos/capacitor-bun-runtime'
src/platform/ios-runtime-bridge.ts: 'started'/'status'/'bridgeStatus' is of type 'unknown'
../ui/src/spatial/tui/engine.ts: Cannot find module '@elizaos/tui'
../../plugins/plugin-discord/messages.ts: Property 'platformMessageId' does not exist on type 'MemoryMetadata'
```

### Root Verify

Command:

```bash
bun run verify
```

Result:

```text
[assert-agents-claude-identical] PASS: 301 tracked CLAUDE.md/AGENTS.md pair(s) are byte-identical.
[type-safety-ratchet] scanned 10270 tracked production source files
[error-policy-ratchet] no new fallback-slop in touched files
Failed: @elizaos/plugin-computeruse#lint
```

Root verify is blocked by unrelated `plugin-computeruse` lint diagnostics,
including existing forbidden non-null assertions in
`plugins/plugin-computeruse/src/__tests__/android-scene.test.ts`,
`brain.test.ts`, `dhash.test.ts`, `scene-builder.test.ts`, and
`screen-state.test.ts`. Write-mode lint side effects in unrelated
`plugins/plugin-computeruse`, `plugins/plugin-workflow`, and `packages/app`
files were restored before committing evidence.

## Evidence Matrix

- Real LLM trajectory: N/A. This change is an HTTP route visibility/security
  gate and does not alter prompt, model, action, evaluator, or provider
  behavior.
- Backend logs: covered by focused guard/matrix tests rather than a long-lived
  server log; no new service or scheduler path is introduced.
- Frontend logs/screenshots/video: N/A. No UI files or client rendering changed.
- Audio/voice walkthrough: N/A. No TTS/STT/transcript/audio pipeline changed.
- DB/memory/domain artifacts: N/A. No persistence, memory, embedding, task,
  wallet, chain, or file artifacts are produced by this change.
