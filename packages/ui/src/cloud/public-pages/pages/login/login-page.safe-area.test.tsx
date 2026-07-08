/**
 * Guard for the sign-in surface safe-area contract (#15361).
 *
 * On the installed iOS standalone PWA the login view rendered a black band at
 * the top (the `--launch-bg` FOUC guard showing through the status-bar zone)
 * PLUS a pushed-down card. Two facts drive the fix:
 *
 *   1. The `body.desktop { padding-top: env(safe-area-inset-top) }` rule the
 *      issue suspected is Electrobun-DESKTOP only (added by
 *      `initializeDesktopShell()`); it is NOT present on the installed iOS PWA.
 *      The standalone-PWA CSS blocks (base.css / styles.css) apply the
 *      scroll-lock + height geometry but NO body-level top safe-area padding.
 *   2. This `/login` route renders through `CloudRouterShell` (a public route),
 *      NOT the `App.tsx` catch-all shell column — so it does NOT inherit the
 *      shell column's `paddingTop: max(calc(var(--safe-area-top)..))`.
 *
 * So the login page is the SINGLE owner of the top inset on its own surface.
 * The correct shape is therefore:
 *   - EXACTLY ONE `env(safe-area-inset-top)` inset (the content padding), and
 *   - a `fixed inset-0` `bg-bg` underlay so the background fills edge-to-edge
 *     under the status bar (no black band) instead of a collapsed
 *     `min-h-[100dvh]` slab that starts at the layout-viewport top.
 *
 * This is a source-level scan (jsdom cannot resolve `env()` / device viewport
 * collapse), matching the established App.safe-area-fill.test.ts idiom.
 */

import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

const here = dirname(fileURLToPath(import.meta.url));
const LOGIN_SRC = readFileSync(join(here, "login-page.tsx"), "utf8");

describe("login page safe-area (#15361)", () => {
  it("applies env(safe-area-inset-top) exactly once on the login surface", () => {
    const matches = LOGIN_SRC.match(/env\(safe-area-inset-top/g) ?? [];
    expect(
      matches.length,
      "the login surface must own the TOP inset exactly once (no double-count vs a body-level inset)",
    ).toBe(1);
  });

  it("applies env(safe-area-inset-bottom) exactly once on the login surface", () => {
    const matches = LOGIN_SRC.match(/env\(safe-area-inset-bottom/g) ?? [];
    expect(
      matches.length,
      "the login surface must own the BOTTOM inset exactly once (audit both edges)",
    ).toBe(1);
  });

  it("fills the background with a fixed inset-0 underlay so no black band shows under the status bar", () => {
    // The bg fill must be viewport-anchored (fixed inset-0), not an in-flow
    // min-h-[100dvh] slab that collapses above the status bar on iOS standalone.
    expect(
      /pointer-events-none fixed inset-0[^"]*bg-bg/.test(LOGIN_SRC),
      "expected a `fixed inset-0 ... bg-bg` underlay on the login surface",
    ).toBe(true);
  });

  it("does not put the opaque bg fill on a min-h-[100dvh] in-flow slab (the collapsed-viewport black-band shape)", () => {
    // Guard against reintroducing `min-h-[100dvh] bg-bg` on the outer wrapper,
    // which is exactly what left the status-bar band unpainted on device.
    expect(
      /min-h-\[100dvh\][^"]*\bbg-bg\b/.test(LOGIN_SRC),
      "the bg-bg fill must not sit on a min-h-[100dvh] in-flow wrapper",
    ).toBe(false);
  });
});

describe("login page short-viewport scroll", () => {
  // Short screens (e.g. Light Phone III, 1080x1240) make the sign-in card
  // taller than the viewport. A flex `justify-center` centers it but the top
  // overflows above scrollTop 0 and is unreachable — the OAuth / wallet rows
  // fell below an unscrollable fold. The viewport owner must be height-bounded
  // and the card region must be `min-h-0 flex-1 overflow-y-auto` with the card
  // itself `my-auto`, so it centers when it fits and scrolls from the top when
  // it overflows.
  it("bounds the login surface to the visual viewport instead of growing under a locked root", () => {
    expect(
      /theme-cloud[^"]*h-\[100dvh\][^"]*min-h-0[^"]*overflow-hidden/.test(
        LOGIN_SRC,
      ),
      "the login surface must own a fixed 100dvh box so the child scroller has a real viewport",
    ).toBe(true);
    expect(
      /flex h-full min-h-0 w-full flex-col/.test(LOGIN_SRC),
      "the safe-area padded content owner must pass a bounded height to the scroll region",
    ).toBe(true);
  });

  it("makes the sign-in card region scrollable instead of clipping when it exceeds the viewport", () => {
    expect(
      /min-h-0 flex-1[^"]*overflow-y-auto/.test(LOGIN_SRC),
      "the sign-in card region must be min-h-0 flex-1 overflow-y-auto to scroll when taller than the viewport",
    ).toBe(true);
  });

  it("centers the card with my-auto (not a parent justify-center that clips the top)", () => {
    expect(
      /\bmy-auto\b[^"]*\bmax-w-md\b/.test(LOGIN_SRC),
      "the sign-in card must center via my-auto so its top stays reachable while scrolling",
    ).toBe(true);
    expect(
      /\bmax-w-md\b[^"]*\bshrink-0\b/.test(LOGIN_SRC),
      "the card must not shrink to fake-fit inside the short viewport instead of scrolling",
    ).toBe(true);
    expect(
      /flex-1 items-center justify-center/.test(LOGIN_SRC),
      "the card region must not use the top-clipping `flex ... items-center justify-center` centering",
    ).toBe(false);
  });
});
