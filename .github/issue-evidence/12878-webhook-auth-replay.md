# Issue #12878 Webhook Auth and Replay Evidence

## Scope

- `packages/cloud/api/eliza-app/webhook/_forward.ts`
  - Added local platform-native signature validation before forwarding to the internal webhook gateway.
  - Telegram: `x-telegram-bot-api-secret-token`.
  - Blooio: timestamped `x-blooio-signature` HMAC-SHA256 with a 120 second freshness window.
  - WhatsApp: `x-hub-signature-256` HMAC-SHA256.
  - Twilio: `x-twilio-signature` over canonical URL plus sorted form fields.
  - Production fails closed when a platform secret is not configured; non-production preserves existing local/e2e behavior and logs the skip.
- `packages/cloud/api/v1/telegram/webhook/[orgId]/route.ts`
  - Removed the implicit unverified development bypass.
  - Local tunnel testing now requires `NODE_ENV=development` plus `TELEGRAM_WEBHOOK_ALLOW_UNVERIFIED_DEV=1`.
  - The consolidated #13086 behavior returns `200 { ok: true, status:
    "not_configured" }` for unconfigured webhooks so Telegram stops retrying,
    while still not processing the unauthenticated update.
- Existing replay dedupe coverage on develop was re-run for BlueBubbles and Stripe Connect.

## Verification

Commands run from `/private/tmp/codex-12845-cloud-shared-db`:

```bash
bun test packages/cloud/api/__tests__/eliza-app-webhook-gateway-secret.test.ts \
  packages/cloud/api/__tests__/eliza-app-webhook-suffix.test.ts \
  'packages/cloud/api/v1/telegram/webhook/[orgId]/auth-policy.test.ts' \
  'packages/cloud/api/v1/telegram/webhook/[orgId]/dedupe.test.ts' \
  packages/cloud/services/gateway-webhook/__tests__/internal-auth.test.ts
```

Result: passed, 50 tests.

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

Result: passed, 10 files checked.

```bash
bun run --cwd packages/cloud/api typecheck
```

Result: blocked by pre-existing transitive `packages/app-core` errors resolving
`@elizaos/auth/*` imports plus existing implicit-any diagnostics in
`account-pool.ts`; the errors are outside the touched webhook files.

```bash
git diff --check
```

Result: passed.

## Evidence Matrix

- Backend logs: covered by route/logger assertions and rejection paths in unit tests.
- Frontend screenshots/video: N/A, backend-only webhook hardening.
- Real LLM trajectory: N/A, no agent action, prompt, or model behavior change.
- Native/mobile/desktop capture: N/A, backend-only webhook hardening.
- Audio walkthrough: N/A, no voice/TTS/STT surface touched.
