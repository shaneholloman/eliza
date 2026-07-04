# Evidence: #12635 local provider capability metadata

PR: #13129
Branch: `fix/12635-local-provider-capability-metadata`

## What Changed

- `ModelRegistrationMetadata` now carries provider-declared `local` and
  `streamable` capability flags.
- Action model routing resolves the `LOCAL` strategy through
  capability-first `isLocalHandler({ provider, metadata })`, with the provider
  name heuristic retained only as the legacy fallback.
- Trajectory pricing consumes declared `local` capability and no longer keeps a
  separate drifting local-provider list.
- `AgentRuntime.useModel` consumes declared `streamable` capability for the
  handler-facing stream callback. `streamable: true` opts in even for
  cloud-looking names; `streamable: false` opts out even for local-looking
  names. The existing `eliza-router` streaming exception is preserved.

## Verification

### Focused Runtime Tests

Command:

```bash
bun run --cwd packages/core test src/runtime/__tests__/action-model-routing.test.ts src/features/trajectories/pricing.test.ts src/runtime/__tests__/streaming-use-model.test.ts
```

Result:

```text
Test Files  3 passed (3)
Tests  97 passed (97)
```

Manual review:

- Routing tests cover declared `metadata.local: true` selecting a
  cloud-looking provider and `metadata.local: false` excluding a local-looking
  provider.
- Pricing tests cover declared local override suppressing missing-price warnings
  and declared non-local override preserving the warning path.
- Streaming tests cover `metadata.streamable: true` passing `onStreamChunk` to
  a cloud-looking provider and `metadata.streamable: false` withholding it from
  a local-looking provider.

### Typecheck

Command:

```bash
bun run --cwd packages/core typecheck
```

Result:

```text
tsgo --noEmit -p ./tsconfig.json
```

Exit code: 0.

### Touched-File Biome

Command:

```bash
bunx biome check packages/core/src/runtime.ts packages/core/src/runtime/action-model-routing.ts packages/core/src/runtime/__tests__/action-model-routing.test.ts packages/core/src/runtime/__tests__/streaming-use-model.test.ts packages/core/src/features/trajectories/pricing.ts packages/core/src/features/trajectories/pricing.test.ts packages/core/src/types/model.ts
```

Result:

```text
Checked 7 files in 109ms. No fixes applied.
```

### Shared Package Build

Command:

```bash
bun run --cwd packages/core build
```

Result:

```text
Node.js build complete
Browser build complete
Edge build complete
Testing module build complete
TypeScript declarations generated
All builds complete
```

Exit code: 0.

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
`brain.test.ts`, `dhash.test.ts`, `scene-multimon-coords.test.ts`, and
`screen-state.test.ts`. Biome write-mode edits made by that failed lane were
restored; only the core PR files remain modified.

## Evidence Matrix

- Real LLM trajectory: N/A. This change is a deterministic runtime registry,
  routing, pricing, and streaming capability contract change; no prompt,
  provider context, action selection, evaluator behavior, or model output
  semantics changed.
- Backend logs: N/A. No server/service path is introduced; the runtime code path
  is covered by focused `AgentRuntime.useModel` tests.
- Frontend logs/screenshots/video: N/A. No UI files or client behavior changed.
- Audio/voice walkthrough: N/A. No TTS/STT/transcript/audio path changed.
- DB/memory/domain artifacts: N/A. No persistence, memory, embedding, task,
  wallet, chain, or file artifacts are produced by this change.
