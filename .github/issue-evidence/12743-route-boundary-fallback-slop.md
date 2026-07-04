# Issue #12743 - route boundary fallback slop

PR: https://github.com/elizaOS/eliza/pull/13103
Branch: `fix/12743-route-boundary-fallback-slop`
Commit verified locally: `7a15c6d9ee78ae32c4fd5a97a067147af02bbc02` plus evidence/formatting follow-up

## Scope checked

Reviewed the long-tail plugin route boundary changes for:

- `plugins/plugin-scheduling/src/routes/scheduled-tasks.ts`
- `plugins/plugin-inbox/src/routes/inbox-routes.ts`
- `plugins/plugin-github/src/routes/github-routes.ts`
- `plugins/plugin-elizacloud/src/routes/*`
- `plugins/plugin-birdclaw/src/routes/birdclaw-routes.ts`
- `plugins/plugin-calendar/src/routes/plugin-routes.ts`
- `plugins/plugin-meetings/src/routes/meetings-routes.ts`

The behavior now keeps route boundary failures classified instead of collapsing
everything into generic fallback responses: validation/not-found/conflict cases
return client-meaningful 4xx responses, upstream GitHub token-validation
failures return 400/502 as appropriate, and malformed Eliza Cloud billing
crypto-status responses fail closed without poisoning the cache.

## Passing verification

- PASS `bun test plugins/plugin-scheduling/src/routes/scheduled-tasks.test.ts`
  - 14 passed
- PASS `bun test plugins/plugin-inbox/test/inbox-routes.test.ts`
  - 4 passed
- PASS `bun test plugins/plugin-github/src/routes-e2e.test.ts`
  - 11 passed
- PASS `bun test plugins/plugin-elizacloud/__tests__/cloud-billing-routes.test.ts`
  - 2 passed
- PASS `bun run --cwd plugins/plugin-elizacloud test -- __tests__/cloud-coding-container-routes.test.ts __tests__/unit/travel-provider-relay-routes.test.ts __tests__/unit/x-relay-routes.test.ts`
  - 3 files passed, 17 tests passed
- PASS `bun run --cwd plugins/plugin-birdclaw test src/routes/birdclaw-routes.test.ts`
  - 16 passed
- PASS `bun run --cwd plugins/plugin-calendar test src/routes/plugin-routes.test.ts`
  - 2 passed
- PASS `bun run --cwd plugins/plugin-meetings test -- src/routes/meetings-routes.test.ts`
  - 4 passed
- PASS `bunx biome check` on the touched route/test files after formatting
- PASS `bun run --cwd plugins/plugin-scheduling typecheck`
- PASS `bun run --cwd plugins/plugin-github typecheck`
- PASS `bun run --cwd plugins/plugin-elizacloud typecheck`

## Blocked / unrelated verification

- `bun run --cwd plugins/plugin-inbox typecheck` is blocked in this checkout by
  unresolved workspace package artifacts, starting with
  `../../packages/agent/src/runtime/operations/vault-bridge.ts:17:64: Cannot find module '@elizaos/vault'`.
- `bun run --cwd plugins/plugin-birdclaw typecheck` is blocked by unresolved
  `@elizaos/tui` imports from `packages/ui/src/spatial/tui/*`.
- `bun run --cwd plugins/plugin-calendar typecheck` is blocked by unrelated
  unresolved workspace package imports in `packages/agent`, `packages/ui`,
  `plugin-local-inference`, and calendar native bridge modules.
- `bun run --cwd plugins/plugin-meetings typecheck` is blocked by unresolved
  `@elizaos/shared` imports across the package.
- `bun run verify` passes `check:agents-claude`,
  `audit:type-safety-ratchet`, and `audit:error-policy-ratchet`, then fails at
  the known unrelated `@elizaos/tui#lint` control-character regex diagnostics
  in `packages/tui/src/keys.ts`, `packages/tui/src/terminal.ts`, and
  `packages/tui/test/truncated-text.test.ts`.

## Notes

- Direct `bun test` for the elizacloud relay route tests fails because Bun's
  built-in test runner does not provide the Vitest `vi.stubGlobal` /
  `vi.unstubAllGlobals` helpers used by those tests. The package's Vitest test
  command passes.
- Direct `bun test` for the meetings route test fails to resolve
  `@elizaos/shared`; the package's Vitest test command passes.
