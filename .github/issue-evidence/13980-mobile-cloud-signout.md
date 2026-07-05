# #13980 Mobile Cloud Sign-Out Affordance Evidence

## Change

Settings -> Cloud -> Overview now shows an inline Cloud account row whenever
Eliza Cloud is connected. The row exposes the existing `handleCloudDisconnect`
state action through a visible `Sign out` button, so mobile users can switch
accounts without clearing app data.

## Verification

```bash
bunx @biomejs/biome check \
  packages/ui/src/components/settings/CloudOverviewSection.tsx \
  packages/ui/src/components/settings/CloudOverviewSection.test.tsx
```

Result: passed.

```bash
bunx vitest run packages/ui/src/components/settings/CloudOverviewSection.test.tsx
```

Result: passed, 1 test file / 3 tests.

The focused test covers:

- connected Cloud sessions render `Cloud account` plus `Sign out`;
- clicking `Sign out` calls `handleCloudDisconnect`;
- disconnected Cloud sessions do not render the sign-out row;
- an in-flight disconnect disables the button and shows `Signing out...`.

## Evidence Still Required Before Merge

- `bun run --cwd packages/app audit:app` with reviewed Settings -> Cloud output.
- Mobile full-page screenshot of Settings -> Cloud showing the account row.
- Mobile sign-out walkthrough video or screen recording.
- Console/network/native logs from a real signed-in mobile Cloud session proving
  the existing disconnect action clears the session and the screen returns to
  the signed-out Cloud state.

These rows are intentionally left pending because this draft PR was prepared
from a code-review/fix worktree without a signed-in Seeker/mobile session.
