# Issue #12646: Settings section tokens from registry

## Summary

- Reviewed PR #13154 against issue #12646 and package-local guidance for `packages/ui` and `packages/app-core`.
- Confirmed settings section aliases now live with the section metadata/registry and token resolution reads from the live registry for plugin-registered sections.
- Applied the required Biome import-order formatting fix in `packages/ui/src/components/settings/settings-section-tokens.ts`.

## Verification

- `bun run --cwd packages/ui test src/components/settings/settings-section-tokens.test.ts src/components/settings/settings-section-registry.test.ts src/components/settings/settings-sections.registration.test.ts src/chat/useSlashCommandController.catalog.test.ts src/chat/slash-menu.test.ts`
  - Pass: 5 files, 52 tests.
- `bun run --cwd packages/app-core test src/api/dev-route-catalog.test.ts`
  - Pass: 1 file, 9 tests.
- `bun run --cwd packages/ui typecheck`
  - Pass.
- `bunx @biomejs/biome check packages/ui/src/components/settings/settings-section-meta.ts packages/ui/src/components/settings/settings-section-registry.ts packages/ui/src/components/settings/settings-section-tokens.ts packages/ui/src/components/settings/settings-sections.ts packages/ui/src/components/settings/settings-section-tokens.test.ts`
  - Pass after applying the import-order formatting fix.
- `bun run --cwd packages/ui build`
  - Pass; build completed and verified 43 runtime exports.
- `bun run --cwd packages/app-core build`
  - Pass.
- `bun run audit:type-safety-ratchet`
  - Pass.
- `bun run audit:error-policy-ratchet`
  - Pass; no new fallback-slop in touched production files.
- `git diff --check`
  - Pass.

## Known blockers outside this PR

- `bun run --cwd packages/app-core typecheck` is blocked by existing optional plugin/native dependency diagnostics and plugin-discord metadata errors outside the touched files.
- Root `bun run verify` is blocked by an unrelated electrobun lint formatting error in `packages/app-core/platforms/electrobun/src/voice/voice-service.test.ts`.
- No app visual audit was run because the change is resolver/registry logic only and does not alter rendered app layout or styling.
