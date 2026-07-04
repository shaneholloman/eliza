# Issue #12799 evidence: shell history provider failure observability

## Summary

- Scoped slice: `@elizaos/plugin-shell` `SHELL_HISTORY` provider.
- A shell history retrieval failure no longer returns blank success-shaped context.
- The provider now reports through `runtime.reportError("shellHistoryProvider", error, ...)` when available.
- Older runtimes/test doubles without `reportError` still log through `logger.error`.
- The model-visible provider text and values include `Shell history is unavailable: <reason>`.

## Verification

- `bun run --cwd plugins/plugin-shell test`
  - Passed: 4 files, 26 tests, 0 failed.
- `bun run --cwd plugins/plugin-shell typecheck`
  - Passed.
- `bunx biome check plugins/plugin-shell/providers/shellHistoryProvider.ts plugins/plugin-shell/__tests__/shell.real.test.ts`
  - Passed.

## Failure-path proof

New real provider tests exercise `shellHistoryProvider.get()` with a throwing shell service:

- reportError path:
  - provider text is non-empty,
  - text includes `Shell history is unavailable`,
  - text and values include the original error message,
  - `data.error` carries the error message,
  - `runtime.reportError` receives scope `shellHistoryProvider` and the original `Error` object.
- logger fallback path:
  - a runtime without `reportError` still returns model-visible failure text,
  - `logger.error` receives a message containing `shellHistoryProvider` and the original failure.

## Live command / model evidence

- CLI/tooling transcript: covered by the package test/typecheck/Biome commands above.
- Model trajectory: N/A - this slice changes provider error reporting/context text only; no model call or agent turn execution path changed.
- UI/audio evidence: N/A - no UI or audio path.

