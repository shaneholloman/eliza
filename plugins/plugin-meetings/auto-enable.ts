// Auto-enable check for @elizaos/plugin-meetings.
//
// Plugin manifest entry-point — referenced by package.json's
// `elizaos.plugin.autoEnableModule`. Keep this module light: env reads only,
// no service init, no transitive imports of the full plugin runtime (no
// playwright, no service.ts). The auto-enable engine loads dozens of these per
// boot.
//
// The plugin is opt-in because the browser bots need a Chromium binary on the
// host: enable only when the user flagged it (`ELIZA_MEETINGS_ENABLED`) or
// pointed at a browser (`ELIZA_MEETINGS_CHROMIUM_PATH`). The native veto makes
// the flag honest — browser automation cannot run inside an Android / iOS app
// sandbox, so even a set env key must NOT auto-enable there (mobile users get
// meeting transcripts via a cloud-hosted agent — see docs/DEPLOYMENT.md).
import type { PluginAutoEnableContext } from "@elizaos/core";

export function shouldEnable(ctx: PluginAutoEnableContext): boolean {
  if (ctx.isNativePlatform) return false;
  const { env } = ctx;
  return Boolean(
    env.ELIZA_MEETINGS_ENABLED?.trim() ||
      env.ELIZA_MEETINGS_CHROMIUM_PATH?.trim(),
  );
}
