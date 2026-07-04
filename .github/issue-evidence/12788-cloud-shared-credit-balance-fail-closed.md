# Issue #12788 - cloud-shared credit_balance fail-closed evidence

## Scope

- Hardened the cloud-shared credit balance read paths so corrupt `credit_balance`
  rows fail closed instead of returning success-shaped values.
- `CreditsService.getOrganizationBalanceUsd` still returns `0` for a missing
  organization as the documented gate fail-safe, annotated with
  `error-policy:J6`.
- `getCreditBalanceResponse` preserves missing-organization `404` behavior and
  throws `500 internal_error` for corrupt balances.
- No schema, migration, UI, model, prompt, or deployment changes.

## Verification

Commands run from `/private/tmp/codex-12845-cloud-shared-db`.

| Check | Result | Notes |
| --- | --- | --- |
| `bun test --isolate packages/cloud/shared/src/lib/services/__tests__/credit-balance-fail-closed.test.ts` | PASS | 8 tests passed; covers corrupt/missing/happy-path behavior for both read paths. |
| `bun test --isolate packages/cloud/shared/src/lib/services/__tests__/inference-billing-ledger.test.ts` | PASS | 21 tests passed; adjacent inference billing ledger coverage. |
| `bunx biome check packages/cloud/shared/src/lib/services/credits.ts packages/cloud/shared/src/lib/services/credit-balance-response.ts packages/cloud/shared/src/lib/services/__tests__/credit-balance-fail-closed.test.ts` | PASS | Touched-file formatting/lint check passed after applying Biome to touched files only. |
| `bun run --cwd packages/cloud/shared typecheck` | BLOCKED | Fails before this change on transitive `packages/app-core/src/services/account-pool.ts` / `coding-account-bridge.ts` missing `@elizaos/auth/*` modules and related implicit-any errors. |
| `bun run audit:error-policy-ratchet` | PASS | No new fallback-slop in touched production files. |
| `git diff --check` | PASS | No whitespace errors. |
| `bun run verify` | BLOCKED | Reached unrelated workspace lint failures in `@elizaos/electrobun#lint`, `@elizaos/tui#lint`, `@elizaos/plugin-training#lint`, and `@elizaos/bun-ios-runtime#lint`; write-mode side effects in native runtime scripts were restored. |

## Evidence Not Applicable

- UI screenshots/video: N/A, no UI surface changed.
- Real-LLM trajectory: N/A, no prompt/model/action behavior changed.
- Backend runtime logs: N/A, no route was exercised in a running cloud stack; the
  changed code paths are covered by isolated service tests.
- Database migration evidence: N/A, no schema or migration changed.
