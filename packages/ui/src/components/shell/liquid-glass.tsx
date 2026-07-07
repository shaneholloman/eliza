/**
 * Liquid-glass recipe for the chat sheet — refraction + beveled edge on top of
 * the existing frosted (blur/saturate) surface.
 *
 * A frosted panel blurs what is behind it; a *liquid* glass panel also refracts
 * it, so the ember field / home widgets behind the open chat bend at the panel
 * edge the way light bends through a real slab. The refraction is an SVG
 * displacement filter (feTurbulence → feDisplacementMap) applied to
 * `backdrop-filter`; the glassy bevel is a pair of inset box-shadows (a bright
 * top-left highlight, a soft bottom-right shade). Technique adapted from
 * Mael-667/Liquid-Glass-CSS, tuned down for a always-present chat surface
 * (subtle displacement, one filter budget) rather than a hero showcase.
 *
 * Consumed by ContinuousChatOverlay (the sheet surface) and ChatSurface (the
 * composer bar). `backdrop-filter: url(#…)` refraction is a Chromium-only
 * capability today; `LiquidGlassRefraction` is a separate, purely-decorative
 * layer so Safari/Firefox degrade cleanly to the frosted surface underneath it
 * with no visual break.
 */
import { type MotionValue, motion } from "motion/react";
import type * as React from "react";

/** Stable filter ids — referenced by `backdrop-filter: url(#…)` from the layers below. */
export const LIQUID_GLASS_FILTER_ID = "milady-liquid-glass";

/**
 * The refraction filter definition. Mount exactly once per document (the overlay
 * mounts it at its root); the `<filter>` is referenced by id, so a second copy
 * only wastes a compositing node. `scale` is deliberately low (~14): a chat
 * panel is read against, not admired, so the edge should bend the backdrop just
 * enough to read as a glass slab without smearing text behind it.
 */
export function LiquidGlassDefs(): React.JSX.Element {
  return (
    <svg
      aria-hidden="true"
      width={0}
      height={0}
      style={{ position: "absolute", pointerEvents: "none" }}
    >
      <defs>
        <filter
          id={LIQUID_GLASS_FILTER_ID}
          colorInterpolationFilters="sRGB"
          x="0%"
          y="0%"
          width="100%"
          height="100%"
        >
          <feTurbulence
            type="fractalNoise"
            baseFrequency="0.008 0.009"
            numOctaves={2}
            seed={8}
            stitchTiles="stitch"
            result="turbulence"
          />
          <feDisplacementMap
            in="SourceGraphic"
            in2="turbulence"
            scale={14}
            xChannelSelector="R"
            yChannelSelector="B"
          />
        </filter>
      </defs>
    </svg>
  );
}

/**
 * The inset bevel — a bright top-left highlight over a soft bottom-right shade —
 * that makes the panel edge catch light like a glass rim. Pair with the frosted
 * surface fill; kept as a token string so the sheet and the composer share one
 * edge dialect. Neutral white/black only (no accent), per the shell's no-blue,
 * accent-is-orange-only rule.
 */
export const LIQUID_GLASS_EDGE_SHADOW =
  "inset 1px 1px 1.5px 0 rgb(255 255 255 / 30%), inset -1px -2px 3px 0 rgb(0 0 0 / 22%)";

/**
 * Decorative refraction layer: an absolutely-positioned fill whose only job is
 * to run the displacement filter over the backdrop. It carries no color and no
 * pointer surface, so where `backdrop-filter: url(#…)` is unsupported it simply
 * renders nothing and the frosted surface beneath stands in unchanged. `radius`
 * tracks the sheet's live corner radius so the refracted edge stays flush with
 * the panel as it morphs between the inset sheet and full-bleed.
 */
export function LiquidGlassRefraction({
  radius,
  opacity = 1,
}: {
  /** Live corner radius — a plain value or the sheet's morph MotionValue. */
  radius: MotionValue<string> | MotionValue<number> | string | number;
  /** Crossfade with the surface — a plain value or the openProgress MotionValue. */
  opacity?: MotionValue<number> | number;
}): React.JSX.Element {
  return (
    <motion.div
      aria-hidden="true"
      className="pointer-events-none absolute inset-0 z-0"
      style={{
        borderRadius: radius,
        opacity,
        backdropFilter: `url(#${LIQUID_GLASS_FILTER_ID})`,
        WebkitBackdropFilter: `url(#${LIQUID_GLASS_FILTER_ID})`,
      }}
    />
  );
}
