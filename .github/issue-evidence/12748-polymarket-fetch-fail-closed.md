# Issue #12748 - polymarket fetch fail-closed evidence

PR: https://github.com/elizaOS/eliza/pull/13136
Branch: `fix/12748-market-fail-closed`

## Scope

This is the polymarket market-readiness slice of the broader #12275-J sweep.
It changes `plugins/plugin-polymarket/src/actions.ts` so an unreadable
Polymarket JSON response body is no longer converted into `null as T`.

Behavior covered:

- 2xx + unreadable JSON body throws a distinct provider-failure error.
- Error status + JSON error body still surfaces the API-provided error.
- Error status + unreadable body still surfaces a status-coded provider error.
- `allowErrorStatus` still returns parsed disabled-readiness bodies for the
  `place_order` readiness path.
- `allowErrorStatus` does not fabricate readiness from an unreadable body.

No route files were changed; `src/routes/**` remains owned by #12275-F. No
wallet signing, order placement, RPC, or on-chain state path is exercised by
this PR.

## Verification

The package test runner needs built workspace package entries for
`@elizaos/shared`, `@elizaos/ui`, and `@elizaos/tui` in this worktree. I built
those local dependencies before running the full suite:

```bash
bun run --cwd packages/shared build
bun run --cwd packages/ui build
bun run --cwd packages/tui build
```

Focused fetch-boundary tests:

```bash
bun run --cwd plugins/plugin-polymarket test src/actions.fetch.test.ts
```

Result: PASS, 1 file / 6 tests passed.

Full plugin suite:

```bash
bun run --cwd plugins/plugin-polymarket test
```

Result: PASS, 7 files passed, 1 skipped; 40 tests passed, 3 skipped.

Package typecheck:

```bash
bun run --cwd plugins/plugin-polymarket typecheck
```

Result: PASS.

Touched-file Biome check:

```bash
bunx biome check plugins/plugin-polymarket/src/actions.ts \
  plugins/plugin-polymarket/src/actions.fetch.test.ts
```

Result: PASS, 2 files checked, no fixes applied.

## Evidence exclusions

- UI screenshots/video: N/A, no rendered UI behavior changed.
- Real LLM trajectory: N/A, no prompt/model/action-selection behavior changed;
  this is a provider fetch boundary.
- Wallet/chain artifacts: N/A, no signing, order placement, RPC, balances, or
  on-chain state changed. The `place_order` path remains trading-readiness only.
- Live Polymarket credentials/API capture: N/A for this unit-level fail-closed
  boundary. The new tests inject real `Response` objects through the runtime
  `fetch` boundary to prove unreadable bodies throw observably instead of
  producing success-shaped `null`.
