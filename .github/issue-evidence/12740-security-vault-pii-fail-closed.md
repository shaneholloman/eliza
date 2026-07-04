# Issue #12740 - Security/Vault/PII Fail-Closed Sweep

## Scope

- PR: #13076
- Branch: `fix/12740-security-fail-closed`
- Packages: `packages/security`, `packages/vault`, `plugins/plugin-pii-guard`
- No UI, mobile, desktop, native bridge, schema, or migration changes.

## Behavior Verified

- MCP remote URL validation rejects malformed URLs, non-http(s) schemes, private/link-local IP literals, localhost/local suffix hosts, and unresolvable DNS names.
- MCP stdio validation rejects path-bearing commands and commands outside the allow-list.
- Vault decrypt rejects tampered ciphertext and wrong master keys; failures surface as `CryptoError`, never as fabricated secret values.
- PII NER model-load failure remains the explicit regex-only degrade path, while post-load classifier failures reject `recognize()` instead of returning empty or partial spans.

## Commands

| Command | Result |
| --- | --- |
| `bun run --cwd packages/security test` | PASS - 9 files, 60 tests |
| `bun run --cwd packages/vault test` | PASS - 11 files, 195 tests |
| `bun run --cwd plugins/plugin-pii-guard test` | PASS - 2 files, 31 tests |
| `bun run --cwd packages/security typecheck` | PASS |
| `bun run --cwd packages/vault typecheck` | PASS |
| `bun run --cwd plugins/plugin-pii-guard typecheck` | PASS |
| `bun run --cwd packages/security lint:check` | PASS exit 0; reports 6 pre-existing warnings in non-touched files |
| `bun run --cwd packages/vault lint:check` | PASS |
| `bun run --cwd plugins/plugin-pii-guard lint:check` | PASS |
| `bun run audit:error-policy-ratchet` | PASS - no new fallback-slop in touched files |
| `git diff --check` | PASS |
| `bun run verify` | BLOCKED by unrelated `@elizaos/plugin-computeruse#lint` non-null assertion diagnostics; root write-mode lint side effects were reverted |

## Evidence N/A

- Screenshots/video: N/A, no UI surface changed.
- Browser/network capture: N/A, no HTTP route or browser workflow changed.
- Real-LLM trajectory: N/A, no prompt/model/action behavior changed.
- Deployment capture: N/A, no deployable app surface changed.
