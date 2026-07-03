# Issue #11742 - Media Model Roster Evidence

## What Changed

- Added `packages/cloud/shared/src/lib/services/media-model-roster.ts` as the checked-in FAL/Google media model roster.
- Marked currently routed families as `wired` and every non-routed candidate as `deferred` with an explicit rationale.
- Added `media-model-roster.test.ts` to prove source/rationale completeness and ensure every wired model id remains indexed in the supported pricing definitions.

## Reviewed Sources

- FAL Veo 3 model page: `https://fal.ai/models/fal-ai/veo3`
- FAL Kling exploration page: `https://fal.ai/explore/kling`
- FAL pricing page: `https://fal.ai/pricing`
- Google Gemini API model roster: `https://ai.google.dev/gemini-api/docs/models`
- Google DeepMind Imagen page: `https://deepmind.google/models/imagen/`
- Atlas Cloud Google provider page: `https://www.atlascloud.ai/providers/google`

## Roster Decisions

- Wired: FAL FLUX image, FAL Veo video, FAL Kling video, FAL Hailuo video, FAL MiniMax Music, adjacent FAL Wan/PixVerse/Seedance video, and Atlas-hosted Google Nano Banana image generation.
- Deferred: Recraft, Ideogram, Luma, Runway, Stable Audio, MMAudio, direct Google Imagen 4, direct Google Veo, and direct Gemini Omni/media routes.

## Validation

- `bun run install:light`
- `node packages/shared/scripts/generate-keywords.mjs --target ts`
- `node packages/shared/scripts/generate-keywords.mjs --target js`
- `bun test packages/cloud/shared/src/lib/services/media-model-roster.test.ts`
- `bun run --cwd packages/cloud/shared typecheck`
- `bun run --cwd packages/cloud/shared lint`
- `bunx @biomejs/biome check --write packages/cloud/shared/src/lib/services/media-model-roster.ts packages/cloud/shared/src/lib/services/media-model-roster.test.ts`
- `git diff --check`

## N/A

- Live media generation: N/A - this issue is the roster/catalog decision slice; live generated artifacts are tracked separately by #11745.
- UI screenshots/video: N/A - no UI changed.
- Live LLM trajectories: N/A - no agent prompt/model behavior changed.
