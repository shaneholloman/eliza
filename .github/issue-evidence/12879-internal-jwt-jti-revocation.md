# Issue #12879 - Internal JWT `jti` Revocation Denylist

## Scope

- PR: #13072
- Branch: `fix/12879-jti-revocation`
- Package: `packages/cloud/shared`
- Files:
  - `packages/cloud/shared/src/lib/auth/jwt-internal.ts`
  - `packages/cloud/shared/src/lib/auth/jwt-internal-denylist.ts`
  - `packages/cloud/shared/src/lib/auth/jwt-internal.test.ts`
- No UI, model, audio, mobile, native, migration, or deployable app surface changed.

## Behavior Verified

- Fresh internal JWTs still verify while within TTL.
- `revokeInternalToken(jti, exp)` rejects the revoked token on the next `verifyInternalToken()` call.
- Revocation is scoped to the single `jti`; unrelated internal JWTs remain valid.
- Expired tokens reject through the normal JWT verifier.
- Redis denylist read errors reject verification, never `catch -> allow`.
- With no Redis backend configured, `isDenylistConfigured()` reports false, valid tokens still verify under the key-rotation + short-TTL model, and `revokeInternalToken()` throws so callers know per-token revocation did not take effect.

## Commands

| Command | Result |
| --- | --- |
| `bun test --isolate packages/cloud/shared/src/lib/auth/jwt-internal.test.ts` | PASS - 8 tests, 13 assertions |
| `bun run --cwd packages/cloud/shared lint` | PASS - 1387 files, no fixes applied |
| `bun run --cwd packages/cloud/shared typecheck` | BLOCKED by unrelated transitive `packages/app-core` `@elizaos/auth/*` module resolution/type errors |
| `bun run --cwd packages/cloud/shared test` | BLOCKED by unrelated package baseline failures; focused JWT auth file passed in this run |
| `bun run audit:error-policy-ratchet` | PASS - no new fallback-slop in touched files |
| `git diff --check` | PASS |
| `bun run verify` | BLOCKED by unrelated workspace lint (`@elizaos/electrobun#lint` reported as failed; log also includes TUI/capacitor lint diagnostics); root write-mode lint side effects were reverted |

Full `packages/cloud/shared test` observed result:

- 2800 pass
- 59 skip
- 8 fail
- 1 module-load error
- 8077 assertions
- Failures/errors observed outside touched JWT files: container billing `settled_at` PGlite schema mismatch, advertising dayparting/bid-control assertions, and missing `src/lib/eliza/shared/utils/helpers` test module.

## Evidence N/A

- Screenshots/video: N/A - security/API hardening, no UI path.
- Browser/network capture: N/A - shared auth helper, no route surface changed in this PR.
- Real-LLM trajectory: N/A - no prompt, model, action, or agent behavior changed.
- Audio evidence: N/A - no voice/TTS/STT path changed.
- Migration up/down and DB state: N/A - Redis TTL marker only; no relational schema or migration changed.
