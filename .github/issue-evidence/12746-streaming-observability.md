# Issue #12746 - streaming observability evidence

PR: https://github.com/elizaOS/eliza/pull/13138
Branch: `fix/12746-infra-connectivity-observability`

## Scope

This is the `plugin-streaming` slice of the broader #12275-H
infra/connectivity non-route sweep.

Changed behavior:

- `StreamManager.writeFrame()` still returns `false` for a failed FFmpeg stdin
  write, preserving the existing fail-soft contract, but now emits throttled
  `logger.warn` diagnostics so a broken FFmpeg pipe no longer masquerades as an
  idle stream.
- The write-failure throttle resets on stream start/stop so a restarted FFmpeg
  process always surfaces its first broken-pipe write.
- `getOverlayLayoutJson()` now warns when an existing overlay layout file cannot
  be read and then continues to fallback candidates. Genuinely missing files
  remain quiet.

No route files were changed. No model, prompt, TTS provider, STT, or audio
generation behavior changed.

## Verification

Streaming plugin tests:

```bash
bun run --cwd plugins/plugin-streaming test
```

Result: PASS, 5 files / 23 tests passed.

Streaming plugin typecheck:

```bash
bun run --cwd plugins/plugin-streaming typecheck
```

Result: PASS.

Touched-file Biome check:

```bash
bunx biome check plugins/plugin-streaming/src/api/stream-persistence.ts \
  plugins/plugin-streaming/src/api/stream-persistence.test.ts \
  plugins/plugin-streaming/src/services/stream-manager.ts \
  plugins/plugin-streaming/src/services/stream-manager.write-frame.test.ts
```

Result: PASS, 4 files checked, no fixes applied.

## Evidence exclusions

- UI screenshots/video: N/A, no rendered UI route/view changed.
- Real LLM trajectory: N/A, no agent prompt/model/tool-selection behavior
  changed.
- Audio/TTS/STT capture: N/A for this slice. The change is FFmpeg frame-pipe
  and overlay-layout persistence observability, not audio generation,
  recognition, wake-word, or voice-loop behavior.
- Live RTMP/FFmpeg recording: not captured in this worktree. The tests install
  a fake running FFmpeg child whose `stdin.write` throws, directly exercising
  the broken-pipe boundary without launching or connecting to a real ingest.
