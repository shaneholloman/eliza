# #10689 Atlas Cloud video provider

## Scope

Agent-actionable slice:
- Add Atlas Cloud as a `/api/v1/generate-video` provider through the existing video registry.
- Add supported Atlas video model definitions and `video:generation` pricing rows.
- Keep the FAL video provider path unchanged.
- Add deterministic provider/pricing tests plus a credential-gated live lane.

## Deterministic evidence

Run from repo root:

```bash
bun test packages/cloud/shared/src/lib/providers/video/atlascloud-video-generation.test.ts \
  packages/cloud/shared/src/lib/providers/video/fal-video-generation.test.ts \
  packages/cloud/shared/src/lib/services/ai-pricing/video-generation-pricing.test.ts \
  packages/cloud/shared/src/lib/services/media-model-roster.test.ts
```

Expected coverage:
- Atlas request body uses `generateVideo` payload fields and image/reference aliases.
- Atlas inline output normalization returns a usable `video/*` object.
- Missing `ATLASCLOUD_API_KEY` fails before upstream dispatch.
- Every supported Atlas video model has an Atlas `video:generation` pricing row.
- The checked-in media model roster indexes the wired Atlas video model IDs.

## Live evidence

N/A from this workspace: no Atlas Cloud production API key or spend budget was available.

Human/operator command when credentials are available:

```bash
TEST_LANE=post-merge ATLASCLOUD_API_KEY=<redacted> \
  bun test packages/cloud/shared/src/lib/providers/video/atlascloud-video-generation.real.test.ts
```

Required manual review after the live lane:
- Open the returned video URL and confirm the media plays.
- Attach the generated video artifact or URL, provider request id, route logs, billing row, and generated `generations` row.
- Add the model matrix required by #10689 for each Atlas model enabled in production.
