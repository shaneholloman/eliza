# Issue #12787 evidence - cloud API affiliate fail-closed slice

## Scope

- PR: #13146
- Branch: `fix/12787-cloud-api-fail-closed`
- Package touched: `packages/cloud/api`
- Route slice: `affiliate/create-character`, `affiliate/create-session`
- Behavior surface: affiliate guest character/session provisioning and anonymous-session spend gate
- Not in scope: the rest of the `packages/cloud/api` fallback-slop sweep

## Behavior verified

- `affiliate/create-character` no longer swallows `anonymousSessionsService.create(...)` failures.
- If anonymous session provisioning fails, the route returns a structured non-2xx failure through the outer J1 boundary.
- The route does not return `success: true` or a phantom `sessionId` when the session row was not written.
- The route bails before creating the character when session provisioning fails.
- The happy path still returns `201` and writes the anonymous session before creating the character.
- Malformed JSON returns `400` without default-accepting an empty body or performing downstream writes.
- Remaining affiliate-slice catches are annotated with explicit J1/J3/J7 policy rationale.

## Verification

| Check | Result | Notes |
| --- | --- | --- |
| `bun test packages/cloud/api/__tests__/affiliate-create-character-session-fail-closed.test.ts` | PASS | 3 tests; intentional structured error log for forced session-create failure |
| `bunx @biomejs/biome check packages/cloud/api/__tests__/affiliate-create-character-session-fail-closed.test.ts packages/cloud/api/affiliate/create-character/route.ts packages/cloud/api/affiliate/create-session/route.ts` | PASS | Touched-file check clean |
| `bun run --cwd packages/cloud/api lint` | PASS | Package lint write-mode found no fixes |
| `bun run --cwd packages/cloud/api lint:check` | PASS | Read-only package lint clean |
| `bun run --cwd packages/cloud/api typecheck` | BLOCKED | Unrelated transitive `app-core` auth subpath resolution errors (`@elizaos/auth/account-storage`, `credentials`, `types`, etc.) plus existing implicit-any diagnostics in `app-core/src/services/account-pool.ts` |
| `bun run --cwd packages/cloud/api build` | BLOCKED | Package has no `build` script in `package.json`; `typecheck` is the documented type-only build equivalent but is currently blocked as above |
| `bun run audit:type-safety-ratchet` | PASS | No new weak typing; baseline can shrink |
| `bun run audit:error-policy-ratchet` | PASS | No new fallback-slop |
| `git diff --check` | PASS | No whitespace errors |
| `bun run verify` | BLOCKED | Repo-level CLAUDE/AGENTS and both ratchets passed; Turbo then stopped at unrelated `@elizaos/electrobun#lint` formatting diagnostics in `src/voice/voice-service.test.ts` |

## Notes

- Local `cloud:mock` request traces are N/A for this slice because the focused test drives the real Hono route directly with only the deep service boundaries stubbed; standing up the full mock cloud stack would exercise the same route but requires broader service configuration not needed to prove this fail-closed branch.
- DB row inspection is represented by the stubbed anonymous-session write counter in the route test: failure path writes zero character rows after one failed session-write attempt; happy path asserts one session write and one character create. No schema/migration changed.
- Billing/usage artifacts are N/A because this change prevents minting a phantom anonymous session before downstream billing/usage can occur; API-key usage increment remains detached J7 telemetry and is not the spend gate.
- Live LLM/model trajectory is N/A because no model-backed endpoint or prompt/action/evaluator behavior changed.
- Screenshots/video are N/A because no UI surface changed.
