# Issue #12795 - Google GenAI image description fail-closed

PR: https://github.com/elizaOS/eliza/pull/13084
Branch: `fix/12795-hosted-provider-failclose`
Verified commit: `e6d588ed23fc3de0b90f4d62f893ef355c302cc0` plus evidence follow-up

## Scope checked

This slice covers `plugins/plugin-google-genai/models/image.ts`, the
`IMAGE_DESCRIPTION` model handler, plus
`plugins/plugin-google-genai/__tests__/image-description.shape.test.ts`.

The handler no longer turns provider/image-fetch failures into a successful
`{ title, description }` object. It now rethrows the real error, and an empty
model completion throws `Google GenAI API returned an empty image description`
instead of fabricating `Image Analysis` with a blank description.

## Passing verification

- PASS `bun run --cwd plugins/plugin-google-genai test`
  - 4 files passed, 1 skipped
  - 22 tests passed, 1 skipped
- PASS `bun run --cwd plugins/plugin-google-genai typecheck`
  - `tsgo --noEmit -p tsconfig.json`
- PASS `bun run --cwd plugins/plugin-google-genai lint:check`
  - Biome checked 22 files; no fixes applied
- PASS `bun run --cwd plugins/plugin-google-genai build`
  - Node, browser, CJS bundles, and TypeScript declarations generated

## Repo verify

- `bun run verify`
  - PASS `check:agents-claude`
  - PASS `audit:type-safety-ratchet`
  - PASS `audit:error-policy-ratchet`
  - BLOCKED by unrelated `@elizaos/electrobun#lint` formatting diagnostics.
    The verify run also replayed unrelated lint diagnostics in other packages;
    write-mode formatter side effects in `plugins/plugin-computeruse` were
    restored before committing this evidence.

## Failure paths proven by tests

- uninitialized Google GenAI client rejects
- image fetch failure rejects with the fetch error
- provider `generateContent` rejection propagates the provider error
- empty/whitespace completion rejects
- success paths still parse JSON and prose responses into title/description

## Live provider trajectory

N/A in this lane: `GOOGLE_GENERATIVE_AI_API_KEY` is not set in the execution
environment. I verified the absence with `printenv GOOGLE_GENERATIVE_AI_API_KEY`.
The added unit suite covers the changed fail-closed behavior without making a
mocked provider look like live evidence.

## Other N/A evidence

- UI screenshots/video: N/A; model-provider error-policy change, no UI surface.
- Audio: N/A; image description path, no audio.
