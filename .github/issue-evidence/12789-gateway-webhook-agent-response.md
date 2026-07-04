# Evidence: #12789 gateway-webhook malformed agent response

PR: #13122
Branch: `fix/12789-cloud-services-fallback-slop`

## What Changed

- `forwardToServer` now parses agent-server replies through
  `parseAgentResponse(raw, agentId)`.
- Non-JSON responses and JSON bodies missing a string `response` field throw
  instead of returning `undefined`.
- Intentional empty-string replies remain valid.
- The existing async webhook `processMessage` failure path now receives the
  malformed upstream response as an error, making the failure observable in
  `[gateway-webhook]` logs instead of being dropped as success-shaped silence.

## Verification

### Package Tests

Command:

```bash
bun run --cwd packages/cloud/services/gateway-webhook test
```

Result:

```text
27 pass
0 fail
51 expect() calls
Ran 27 tests across 6 files.
```

Manual review:

- `parse-agent-response.test.ts` covers well-formed replies, intentional empty
  replies, non-JSON bodies, missing fields, `null`, number values, top-level
  JSON `null`, and agent-id-in-error observability.
- Existing `webhook-handler.e2e.test.ts` still exercises real webhook handler
  routing through unresolved and linked Twilio identity flows.
- Test logs include structured gateway output such as:

```json
{"level":"info","message":"Identity not linked; routing message to onboarding chat","project":"eliza-app","platform":"twilio","senderId":"+15551234567"}
```

### Typecheck

Command:

```bash
bun run --cwd packages/cloud/services/gateway-webhook typecheck
```

Result:

```text
tsgo --noEmit
```

Exit code: 0.

### Touched-File Biome

Command:

```bash
bunx biome check packages/cloud/services/gateway-webhook/src/server-router.ts packages/cloud/services/gateway-webhook/__tests__/parse-agent-response.test.ts
```

Result:

```text
Checked 2 files in 12ms. No fixes applied.
```

### Service Build

Command:

```bash
bun run --cwd packages/cloud/services/gateway-webhook build
```

Result:

```text
Bundled 185 modules in 31ms
index.js  1.0 MB  (entry point)
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
Failed: @elizaos/electrobun#lint
```

Specific blocker confirmed with:

```bash
bun run --cwd packages/app-core/platforms/electrobun lint
```

It fails on pre-existing formatting in
`packages/app-core/platforms/electrobun/src/voice/voice-service.test.ts`.
Root `verify` also caused one unrelated write-mode lint side effect in
`plugins/plugin-computeruse/src/__tests__/computer-interface.test.ts`; it was
restored before committing evidence.

## Evidence Matrix

- Real request/response trace: covered by the package webhook e2e tests for the
  service path and parser tests for malformed upstream response bodies. Full
  `cloud:mock` was not run because this PR changes a pure parser/forwarder
  failure branch, not deployment wiring.
- Backend logs: structured gateway logs are emitted during the package e2e
  tests; malformed parser cases throw with `agentId` so the existing
  `Forward to server failed` catch logs the operational failure with context.
- Frontend logs/screenshots/video: N/A. No UI/client surface changed.
- Real LLM trajectory: N/A. No prompt/model/action/evaluator behavior changed.
- Audio/voice walkthrough: N/A. No TTS/STT/audio path changed.
- DB/billing/migration artifacts: N/A. No database, billing, migration, task,
  wallet, chain, or file artifacts are produced by this change.
