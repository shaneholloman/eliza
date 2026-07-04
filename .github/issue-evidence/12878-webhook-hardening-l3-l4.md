# Issue #12878 - webhook hardening L3/L4 evidence

PR: https://github.com/elizaOS/eliza/pull/13086
Branch: `fix/12878-webhook-hardening`
Base: `origin/develop`

## Scope

- Adds an internal BFF-to-gateway webhook forwarder secret for forwarded
  eliza-app webhook requests.
- Strips inbound `x-eliza-webhook-forwarder-secret` before proxying untrusted
  traffic and stamps the configured internal secret only when forwarding to the
  webhook gateway.
- Keeps non-forwarded gateway webhook projects on the existing internal-secret
  path.
- Makes Telegram webhook handling fail closed when no organization webhook
  secret is configured, while returning 200 to stop provider retries.
- Rejects Telegram requests with missing or incorrect configured secrets.
- Adds Telegram `update_id` replay dedupe through `webhookEventsRepository`,
  including rollback for outer route failures after the dedupe marker is
  committed.

## Verification

Targeted route/security tests:

```bash
bun test packages/cloud/api/__tests__/eliza-app-webhook-gateway-secret.test.ts \
  'packages/cloud/api/v1/telegram/webhook/[orgId]/dedupe.test.ts' \
  packages/cloud/services/gateway-webhook/__tests__/internal-auth.test.ts
```

Result: PASS, 31 tests passed. The run includes gateway missing/wrong forwarder
secret rejection, forwarded-project enforcement, non-forwarded project behavior,
BFF secret stripping/stamping, Telegram missing/wrong secret rejection,
not-configured fail-closed behavior, duplicate `update_id` suppression, and
rollback of committed dedupe markers for outer handler failures.

After consolidating the overlapping webhook-auth PR, the same security test
lane also includes provider-native forwarder signature checks and Telegram
auth-policy coverage:

```bash
bun test packages/cloud/api/__tests__/eliza-app-webhook-gateway-secret.test.ts \
  packages/cloud/api/__tests__/eliza-app-webhook-suffix.test.ts \
  'packages/cloud/api/v1/telegram/webhook/[orgId]/auth-policy.test.ts' \
  'packages/cloud/api/v1/telegram/webhook/[orgId]/dedupe.test.ts' \
  packages/cloud/services/gateway-webhook/__tests__/internal-auth.test.ts
```

Result: PASS after consolidation.

Touched-file Biome check:

```bash
bunx biome check packages/cloud/api/__tests__/eliza-app-webhook-gateway-secret.test.ts \
  packages/cloud/api/__tests__/eliza-app-webhook-suffix.test.ts \
  packages/cloud/api/eliza-app/webhook/_forward.ts \
  'packages/cloud/api/v1/telegram/webhook/[orgId]/auth-policy.test.ts' \
  'packages/cloud/api/v1/telegram/webhook/[orgId]/dedupe.test.ts' \
  'packages/cloud/api/v1/telegram/webhook/[orgId]/route.ts' \
  packages/cloud/services/gateway-webhook/__tests__/internal-auth.test.ts \
  packages/cloud/services/gateway-webhook/src/index.ts \
  packages/cloud/services/gateway-webhook/src/internal-auth.ts \
  packages/cloud/shared/src/types/cloud-worker-env.ts
```

Result: PASS, 10 files checked, no fixes applied.

Gateway webhook package typecheck:

```bash
bun run --cwd packages/cloud/services/gateway-webhook typecheck
```

Result: PASS.

Cloud API and cloud shared package typechecks:

```bash
bun run --cwd packages/cloud/api typecheck
bun run --cwd packages/cloud/shared typecheck
```

Result: BLOCKED by pre-existing transitive `packages/app-core` errors resolving
`@elizaos/auth/*` imports and existing implicit-any diagnostics in
`account-pool.ts`. The errors are outside this PR's touched files.

Root verification:

```bash
bun run verify
```

Result: BLOCKED after passing the CLAUDE/AGENTS parity check, type-safety
ratchet, and error-policy ratchet. The workspace run failed at unrelated
`@elizaos/tui#lint` control-character-in-regex diagnostics. Biome write-mode
side effects in unrelated files were restored before committing this evidence.

## Evidence exclusions

- UI screenshots/video: N/A, no UI surface changed.
- Real LLM trajectory: N/A, no model, prompt, or agent action behavior changed.
- Audio/native captures: N/A, no audio or native surface changed.
- Full deployed cloud request trace: not captured in this local worktree because
  the complete cloud stack/secrets are not available here. The targeted tests
  execute the real Hono route handlers and gateway auth middleware with mocked
  repositories/services at the security boundaries under review.
