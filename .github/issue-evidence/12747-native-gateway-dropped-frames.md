# Issue #12747 - plugin-native-gateway dropped frame observability

PR: https://github.com/elizaOS/eliza/pull/13133
Branch: `fix/12747-native-bridge-failclosed`
Verified commit: `bad950ff3eded0451b6b182a73121ceecfa73386` plus evidence follow-up

## Scope checked

This slice covers only the browser/WebSocket implementation in
`plugins/plugin-native-gateway/src/web.ts` and its test coverage in
`plugins/plugin-native-gateway/src/web.test.ts`.

The change does not alter iOS or Android native bridge code. Malformed inbound
web gateway frames are still dropped rather than turned into synthetic
`gatewayEvent` payloads, but each drop now emits a `console.warn` so a drifting
gateway protocol or bad transport frame is visible instead of looking like an
idle healthy connection.

Drop classes covered by tests:

- unparseable JSON
- non-object JSON
- missing or invalid `type`
- unhandled frame `type`
- `res` frame without a valid `id`
- `res` frame for an unknown request id
- `event` frame without a valid `event` name

## Passing verification

- PASS `bun run --cwd plugins/plugin-native-gateway test src/web.test.ts`
  - 1 file passed, 17 tests passed
- PASS `bun run --cwd plugins/plugin-native-gateway typecheck`
  - `tsgo --noEmit -p tsconfig.json`
- PASS `bun run --cwd plugins/plugin-native-gateway lint:check`
  - Biome checked 7 files; no fixes applied
- PASS `bun run --cwd plugins/plugin-native-gateway build`
  - `tsc` plus Rollup generated `dist/plugin.js` and `dist/plugin.cjs.js`

## Repo verify

- `bun run verify`
  - PASS `check:agents-claude`
  - PASS `audit:type-safety-ratchet`
  - PASS `audit:error-policy-ratchet`
  - BLOCKED by unrelated workspace lint:
    - `@elizaos/electrobun#lint` formatting diagnostics in
      `packages/app-core/platforms/electrobun/src/voice/voice-service.test.ts`
    - `@elizaos/tui#lint` existing diagnostics including Node builtin import
      protocol, non-null assertions, and control-character regex warnings in
      `packages/tui`

## Manual review

Reviewed the implementation and tests:

- bad frames return early after warning and do not emit `gatewayEvent`
- valid event frames still emit unchanged
- unknown/late response ids warn without resolving or fabricating a pending
  request
- the warning channel matches existing browser-side sequence-gap and socket
  error warnings in this package

## N/A evidence

- Native iOS/Android device capture: N/A for this slice because no Swift,
  Kotlin, or native discovery/RPC implementation changed. The changed file is
  the web implementation only.
- Model trajectory: N/A; this Capacitor gateway transport change has no model
  interaction.
- Screenshots/video: N/A; this is a non-UI browser WebSocket frame handling
  path. The observable artifact is the console warning asserted in tests.
