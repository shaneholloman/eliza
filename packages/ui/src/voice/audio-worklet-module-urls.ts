/**
 * Same-origin AudioWorklet entry points.
 *
 * `?no-inline` keeps Vite from converting these small modules to `data:` URLs;
 * browser CSPs can therefore load them under the normal same-origin
 * `script-src` policy. The package build copies the matching source directory
 * beside the compiled voice modules for non-Vite consumers.
 */

export const VOICE_SESSION_UPLINK_WORKLET_MODULE_URL = new URL(
  "./worklets/voice-session-uplink.js?no-inline",
  import.meta.url,
).href;

export const VOICE_SESSION_DOWNLINK_WORKLET_MODULE_URL = new URL(
  "./worklets/voice-session-downlink.js?no-inline",
  import.meta.url,
).href;

export const PLAYBACK_REFERENCE_TAP_WORKLET_MODULE_URL = new URL(
  "./worklets/playback-reference-tap.js?no-inline",
  import.meta.url,
).href;
