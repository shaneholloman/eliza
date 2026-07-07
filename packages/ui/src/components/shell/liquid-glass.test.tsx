// @vitest-environment jsdom
/**
 * Unit coverage for the chat-sheet liquid-glass recipe: the refraction filter
 * mounts a real feDisplacementMap, the decorative layer references it through
 * `backdrop-filter`, and the bevel is neutral-only (no accent/blue). jsdom can
 * assert structure + inline style; the refracted pixels are a browser concern.
 */
import { render } from "@testing-library/react";
import { describe, expect, it } from "vitest";

import {
  LIQUID_GLASS_EDGE_SHADOW,
  LIQUID_GLASS_FILTER_ID,
  LiquidGlassDefs,
  LiquidGlassRefraction,
} from "./liquid-glass";

describe("liquid-glass", () => {
  it("defines a displacement-map refraction filter under the shared id", () => {
    const { container } = render(<LiquidGlassDefs />);
    const filter = container.querySelector(`filter#${LIQUID_GLASS_FILTER_ID}`);
    expect(filter).not.toBeNull();
    expect(filter?.querySelector("feTurbulence")).not.toBeNull();
    const displace = filter?.querySelector("feDisplacementMap");
    expect(displace).not.toBeNull();
    // A zero-scale displacement is a no-op — the whole point is a real bend.
    expect(Number(displace?.getAttribute("scale"))).toBeGreaterThan(0);
  });

  it("points the refraction layer at the filter and stays pointer-inert", () => {
    const { container } = render(<LiquidGlassRefraction radius="1.5rem" />);
    const layer = container.firstElementChild as HTMLElement;
    expect(layer.getAttribute("aria-hidden")).toBe("true");
    expect(layer.className).toContain("pointer-events-none");
    expect(layer.style.backdropFilter).toContain(LIQUID_GLASS_FILTER_ID);
    expect(layer.style.borderRadius).toBe("1.5rem");
  });

  it("keeps the bevel neutral — inset highlight + shade, no accent/blue", () => {
    expect(LIQUID_GLASS_EDGE_SHADOW).toContain("inset");
    expect(LIQUID_GLASS_EDGE_SHADOW).toContain("255 255 255");
    expect(LIQUID_GLASS_EDGE_SHADOW.toLowerCase()).not.toMatch(
      /blue|#[0-9a-f]*[0-9a-f]{2}(ff|cc)\b|var\(--accent/,
    );
  });
});
