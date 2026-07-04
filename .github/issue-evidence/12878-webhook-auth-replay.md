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
- Existing replay dedupe coverage on develop was re-run for BlueBubbles and Stripe Connect.

## Verification

Commands run from `/private/tmp/codex-12878-webhooks`:

```bash
bun run --cwd packages/cloud/api test __tests__/eliza-app-webhook-suffix.test.ts
```

Result: passed, 17 tests / 21 expects.

```bash
bun test 'packages/cloud/api/v1/telegram/webhook/[orgId]/auth-policy.test.ts'
```

Result: passed, 2 tests / 4 expects.

```bash
bun run --cwd packages/cloud/api typecheck
```

Result: no errors for touched files when filtered for `eliza-app/webhook|v1/telegram/webhook|auth-policy|_forward`.

```bash
bun run build:core
```

Result: passed, 68 tasks successful.

```bash
bun test packages/cloud/api/webhooks/bluebubbles/dedupe.test.ts
```

Result: passed, 2 tests / 8 expects.

```bash
bun test packages/cloud/api/v1/earnings/payout/stripe-connect/webhook/dedupe.test.ts
```

Result: passed, 1 test / 4 expects.

```bash
bunx @biomejs/biome check packages/cloud/api/eliza-app/webhook/_forward.ts packages/cloud/api/__tests__/eliza-app-webhook-suffix.test.ts 'packages/cloud/api/v1/telegram/webhook/[orgId]/route.ts' 'packages/cloud/api/v1/telegram/webhook/[orgId]/auth-policy.test.ts'
```

Result: passed.

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
