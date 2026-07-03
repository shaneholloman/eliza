# 11349 hosted frontend session analytics evidence

Date: 2026-07-02

## What changed

- Hosted frontend pageview beacons now include stable visitor and session IDs.
- Hosted frontend serving tolerates malformed analytics cookie percent-encoding.
- App analytics can aggregate `pageview` request rows into sessions, visitor counts, bounce rate, recent sessions, and ordered funnel steps.
- `/api/v1/apps/:id/analytics/requests?view=sessions` returns the sessions DTO only for the owning organization.
- The app analytics UI has a Sessions tab that renders the session summary, ordered funnel, and recent session table.

## Verification

- `bunx biome check packages/cloud/shared/src/lib/services/app-analytics.ts packages/cloud/api/__tests__/apps-analytics-sessions.integration.test.ts`
  - Passed.
- `bun run --cwd packages/cloud/shared typecheck`
  - Passed.
- `bun run --cwd packages/cloud/api typecheck`
  - Passed.
- `bun run --cwd packages/ui typecheck`
  - Passed.
- `bun test packages/cloud/shared/src/lib/services/app-analytics.test.ts packages/cloud/shared/src/lib/services/app-frontend-hosting.test.ts`
  - Passed: 22 tests.
- `bun test packages/cloud/api/__tests__/hosted-frontend-serve.integration.test.ts packages/cloud/api/__tests__/apps-analytics-sessions.integration.test.ts`
  - Passed: 13 tests.
- `bun test packages/cloud/api/__tests__/apps-analytics-sessions.integration.test.ts`
  - Passed: 2 tests.
- `bun test packages/cloud/shared/src/db/repositories/__tests__/apps.test.ts`
  - Passed, including the PGlite-backed `AppAnalyticsService session analytics from app_requests` test.
- `bun run --cwd packages/ui test -- src/cloud/applications/components/app-analytics.test.tsx`
  - Passed: 1 test.
- `bun run --cwd packages/app audit:app`
  - Ran the full app visual sweep: 348 captures passed.
  - The `builtin-apps` route, which reaches the app analytics surface, was `good` on mobile portrait, mobile landscape, desktop landscape, and iPad portrait.
  - The command exited 1 on unrelated visual audit debt:
    - `plugin-inbox-gui @ mobile-landscape`: minimalism ratchet regression.
    - `plugin-screenshare-gui @ mobile-portrait`: minimalism ratchet regression.
    - `plugin-finances-gui @ mobile-landscape`: hover probe timeout.
    - `plugin-finances-tui @ mobile-landscape`: hover probe timeout.

## Manual review

The app analytics entry route captured by the audit (`builtin-apps`) was marked `good` across all audited viewports. The remaining audit failures are outside the #11349 app analytics surface and should be handled separately before a final PR can satisfy the repo-wide UI audit gate.
