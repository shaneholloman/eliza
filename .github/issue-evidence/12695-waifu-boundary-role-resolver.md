# Issue #12695 evidence - WaifuChat boundary role resolver

## Scope

- PR: #13079
- Branch: `fix/12695-waifu-role-extension`
- Packages touched: `packages/agent`
- User-facing surface: API auth behavior only
- Not in scope: UI, browser flows, model prompts, native platforms, audio, database schema, deployment

## Behavior verified

- WaifuChat role names and JWT interpretation now live in `waifu-chat-role-resolver.ts`, not the generic server auth helper.
- Generic server authorization now goes through the token boundary-role resolver registry.
- Without a registered resolver, WaifuChat roles are not granted by the generic helper.
- Registering the WaifuChat resolver restores the expected role mapping and route-specific authorization behavior.
- JWT validation coverage includes issuer, audience, expiration, signature, wallet, token id, chain, cloud agent, and scoped/admin route access.
- Existing auth route coverage still passes after the resolver boundary change.
- Package build completes successfully.

## Verification

| Check | Result | Notes |
| --- | --- | --- |
| `bun run --cwd packages/agent test test/api/waifu-chat-role-resolver.test.ts test/api/boundary-role-resolver.test.ts test/api/server-helpers-auth.test.ts` | PASS | 3 files, 43 tests |
| `bun run --cwd packages/agent test test/api/auth-routes.test.ts` | PASS | 1 file, 2 tests |
| `bunx biome check packages/agent/src/api/boundary-role-resolver.ts packages/agent/src/api/conversation-routes.ts packages/agent/src/api/server-helpers-auth.ts packages/agent/src/api/server.ts packages/agent/src/api/waifu-chat-role-resolver.ts packages/agent/test/api/boundary-role-resolver.test.ts packages/agent/test/api/server-helpers-auth.test.ts packages/agent/test/api/waifu-chat-role-resolver.test.ts` | PASS | Touched-file lint/format/import-order check |
| `bun run --cwd packages/agent lint:check` | PASS | Exit 0; reports one unrelated info in `src/providers/page-scoped-context.ts` |
| `bun run --cwd packages/agent build` | PASS | Package build completed |
| `bun run --cwd packages/agent typecheck` | BLOCKED | Unrelated existing workspace errors: missing optional plugin packages and unrelated plugin-discord `MemoryMetadata.platformMessageId` typing |
| `bun run audit:type-safety-ratchet` | PASS | No new weak typing; baseline can shrink |
| `bun run audit:error-policy-ratchet` | PASS | No new fallback-slop in touched files |
| `bun run verify` | BLOCKED | Repo-level ratchets passed, then unrelated `@elizaos/plugin-computeruse#lint` failed on existing non-null assertion diagnostics; Biome write-mode side effects were restored |
| `git diff --check` | PASS | No whitespace errors |

## Notes

- The PR body listed additional consumer test names, but in this checkout those files are not present except `test/api/auth-routes.test.ts`; that test was run explicitly and passed.
- Screenshots/video are N/A because this is API auth boundary behavior with no UI surface.
- Browser console/network logs are N/A because no browser flow is affected.
- Real-LLM trajectory is N/A because no agent prompt/action/model behavior changed.
- Audio/native capture is N/A because no voice, transcript, mobile, desktop, or native bridge behavior changed.
- Migration/deploy evidence is N/A because no database schema, infrastructure, or runtime deployment changes were made.
