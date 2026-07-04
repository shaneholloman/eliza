# Issue #12741 - sub-agent transcript fallback-slop evidence

## Scope

- `SessionRecorder.record()` now writes before hashing and only advances the
  digest/byte count after a successful append.
- Transcript write failures are recorded, emitted once to stderr, and finalized
  as `agent.session_record` audit events with `result: "failure"` and
  `transcript_complete: false`.
- Failed session-record audit emits and permission-denial audit emits remain
  non-fatal but are no longer silent; both warn on stderr.
- Retention prune and process-kill teardown keeps are annotated as
  `error-policy:J6` best-effort teardown.
- No UI, schema, route, prompt, model, or deployment changes.

## Verification

Commands run from `/private/tmp/codex-12845-cloud-shared-db`.

| Check | Result | Notes |
| --- | --- | --- |
| `bun test src/sub-agent-claude-code/ src/worker-runtime/dispatch.test.ts` from `packages/plugin-remote-manifest` | PASS | 41 tests passed, 1111 assertions; includes real filesystem append failure and stderr-captured audit sink failures. |
| `bun run --cwd packages/plugin-remote-manifest typecheck` | PASS | `tsgo --noEmit -p tsconfig.json` completed with no type errors. |
| `bun run --cwd packages/plugin-remote-manifest lint:check` | PASS | Package Biome check passed after applying Biome to touched tests only. |
| `bun run audit:error-policy-ratchet` | PASS | Empty catches reduced in touched production files; no new fallback-slop. |
| `git diff --check` | PASS | No whitespace errors. |
| `bun run verify` | BLOCKED | Ratchets passed, then root verify failed in unrelated `@elizaos/plugin-computeruse#lint`; write-mode side effects in `plugins/plugin-computeruse` were restored. |

## Evidence Not Applicable

- UI screenshots/video: N/A, no user-facing UI changed.
- Real-LLM trajectory: N/A, no prompt/model/action behavior changed.
- Backend runtime logs: N/A, no server route was changed; the changed library
  paths are covered by isolated package tests with real filesystem failure
  simulation and stderr capture.
- Database migration evidence: N/A, no schema or migration changed.
