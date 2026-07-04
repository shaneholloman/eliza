# #12636 Shell-Direct Action Tags Evidence

Branch: `fix/12636-shell-direct-action-tags`
Code PR: #13153

## What Was Proven

- Removed the executable-path `SHELL_DIRECT_ACTIONS` hardcoded set from
  `packages/core/src/services/message.ts`.
- Added `SHELL_DIRECT_ACTION_TAGS` as the declared behavior contract for
  shell-direct actions:
  - `domain:system`
  - `resource:shell`
  - `capability:execute`
- Added `findShellDirectActionName()` and `isShellDirectActionName()` so the
  message pipeline resolves shell-direct routing through action metadata first,
  then through the covered legacy name/simile fallback.
- Migrated `packages/agent/src/actions/terminal.ts` to declare the tags.
- Added regression coverage for an owner-renamed action (`RUN_OS_COMMAND`) that
  keeps the tags and still routes/promotes.
- Added a compatibility regression caught during review: a tagless action named
  `LOCAL_COMMAND` with legacy simile `RUN_IN_TERMINAL` now resolves and
  classifies consistently. Before the review fix, inference could resolve the
  action through its simile while promotion failed to classify it.
- Added a grep guard proving the removed `SHELL_DIRECT_ACTIONS` set and
  `.has()` gate are not present in `message.ts`.

## Focused Verification

```bash
bun run --cwd packages/core test \
  src/services/message/direct-action-heuristics.test.ts \
  src/__tests__/message-routing-live-regression.test.ts
```

Result:

```text
Test Files  2 passed (2)
Tests       59 passed (59)
Duration    1.37s
```

```bash
bun run --cwd packages/core typecheck
```

Result: passed (`tsgo --noEmit -p ./tsconfig.json`).

```bash
bun run --cwd packages/agent typecheck
```

Result: blocked by unrelated existing diagnostics:

- missing optional plugin modules such as `@elizaos/plugin-streaming`,
  `@elizaos/plugin-vision`, `@elizaos/plugin-background-runner`, and
  `@elizaos/plugin-meetings`;
- existing Discord metadata diagnostics for `platformMessageId`.

No diagnostic points at the touched `packages/agent/src/actions/terminal.ts`.

```bash
bunx @biomejs/biome check \
  packages/core/src/services/message/direct-action-heuristics.ts \
  packages/core/src/services/message/direct-action-heuristics.test.ts \
  packages/core/src/services/message.ts \
  packages/core/src/__tests__/message-routing-live-regression.test.ts \
  packages/agent/src/actions/terminal.ts
```

Result:

```text
Checked 5 files in 106ms. No fixes applied.
```

```bash
bun run --cwd packages/core build
bun run --cwd packages/agent build
```

Result: both passed. `packages/core build` completed node, browser, edge, and
testing bundles plus declarations; `packages/agent build` completed dist output.

## Repo-Level Checks

```bash
bun run audit:type-safety-ratchet
bun run audit:error-policy-ratchet
git diff --check
```

Result: passed. The error-policy ratchet reported no new fallback-slop in the
three touched production files:

- `packages/agent/src/actions/terminal.ts`
- `packages/core/src/services/message.ts`
- `packages/core/src/services/message/direct-action-heuristics.ts`

```bash
bun run verify
```

Result: blocked after the CLAUDE/AGENTS check and both ratchets passed. Turbo
stopped on unrelated current-baseline `@elizaos/electrobun#lint` formatting in
`packages/app-core/platforms/electrobun/src/voice/voice-service.test.ts`.

## Evidence Rows

- Focused routing regression: covered by
  `packages/core/src/__tests__/message-routing-live-regression.test.ts`.
- Tag/legacy/simile behavior and grep guard: covered by
  `packages/core/src/services/message/direct-action-heuristics.test.ts`.
- Runtime/log/UI artifacts: N/A for this code-path refactor; no UI surface was
  changed. The behavior is covered at the message-routing helper and live
  routing regression levels.
