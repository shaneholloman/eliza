/**
 * Voice-capture lifecycle tracing (opt-in). Prefix: `[eliza][voice-capture]`.
 *
 * Purpose: make the next "tapped the mic, then crickets" report diagnosable
 * from the device console in seconds. Each breadcrumb marks one step of the
 * capture lifecycle so a silent no-op is legible instead of invisible:
 *
 *   `start:cloud` / `start:local-inference` — a WAV recorder began.
 *   `pause:cancel` — an APP_PAUSE discarded an in-flight capture.
 *   `pause:kept` — an APP_PAUSE fired inside the permission-prompt grace window
 *                  and the young capture was KEPT (the iOS getUserMedia dialog
 *                  steals focus → visibilitychange → this must not cancel).
 *   `silent:drop` — the pre-POST silence guard no-op'd a near-silent WAV
 *                   (crickets BY DESIGN — the UI now surfaces a subtle hint).
 *   `posted` — a WAV was POSTed to the STT proxy.
 *   `transcript` — a final transcript was emitted.
 *
 * Zero-cost when disabled: the predicate short-circuits before any string work.
 *
 * Enable with:
 * - **Renderer (WebView / installed PWA):** `localStorage.setItem("eliza:voice:debug", "1")`
 *   then reload — the fastest path on a physical device (Safari Web Inspector or
 *   the installed-PWA remote console), no rebuild needed.
 * - **Build-time:** `ELIZA_VOICE_DEBUG=1` (mirrored via Vite `define`), same as
 *   the sibling TTS debug flag.
 */
type RuntimeImportMeta = ImportMeta & {
  env?: Record<string, unknown>;
};

function truthy(raw: string | undefined | null): boolean {
  if (raw == null) return false;
  const v = String(raw).trim().toLowerCase();
  return v === "1" || v === "true" || v === "yes" || v === "on";
}

function voiceDebugEnabled(): boolean {
  // localStorage first: it's the on-device toggle that needs no rebuild — set
  // it in the console on the physical iPhone and reload to capture the next tap.
  try {
    if (
      typeof localStorage !== "undefined" &&
      truthy(localStorage.getItem("eliza:voice:debug"))
    ) {
      return true;
    }
  } catch {
    /* localStorage blocked (sandbox / private mode) — fall through */
  }

  if (typeof process !== "undefined" && process.env) {
    if (truthy(process.env.ELIZA_VOICE_DEBUG)) return true;
  }

  try {
    const viteEnv = (import.meta as RuntimeImportMeta).env;
    if (truthy(String(viteEnv?.ELIZA_VOICE_DEBUG ?? ""))) return true;
    if (truthy(String(viteEnv?.VITE_ELIZA_VOICE_DEBUG ?? ""))) return true;
  } catch {
    /* no import.meta */
  }

  return false;
}

/** Same predicate as {@link voiceCaptureDebug}. */
export function isVoiceCaptureDebugEnabled(): boolean {
  return voiceDebugEnabled();
}

/** One lifecycle-step breadcrumb. No secrets in `detail`. */
export function voiceCaptureDebug(
  step: string,
  detail?: Record<string, unknown>,
): void {
  if (!voiceDebugEnabled()) return;
  if (detail && Object.keys(detail).length > 0) {
    console.info(`[eliza][voice-capture] ${step}`, detail);
  } else {
    console.info(`[eliza][voice-capture] ${step}`);
  }
}
