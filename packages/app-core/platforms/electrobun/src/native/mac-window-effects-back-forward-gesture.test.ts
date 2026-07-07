/** Source-contract guard that the macOS shell keeps the WKWebView two-finger
 * swipe back/forward history gesture OFF. The gesture is a native KVC flag set
 * from `bun:ffi`, so it cannot be exercised in the vitest/Node harness (no
 * `dlopen`); this pins the contract at the source level the way
 * `styles/overscroll-behavior.test.ts` pins the CSS gesture contract. If a
 * future edit flips the flag back to `@YES` or re-introduces an `enable`-named
 * path, this fails instead of silently re-hijacking the app's own horizontal
 * swipe UI (chat-sheet dismiss, pager row-swipes). */
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

const mmSource = readFileSync(
  fileURLToPath(new URL("../../native/macos/window-effects.mm", import.meta.url)),
  "utf8",
);
const wrapperSource = readFileSync(
  fileURLToPath(new URL("./mac-window-effects.ts", import.meta.url)),
  "utf8",
);
const shellSource = readFileSync(
  fileURLToPath(new URL("../index.ts", import.meta.url)),
  "utf8",
);

describe("macOS webview back/forward swipe gesture stays disabled", () => {
  it("native code pins allowsBackForwardNavigationGestures to NO, never YES", () => {
    // Every KVC write to the flag must set @NO.
    const writes = [
      ...mmSource.matchAll(
        /setValue:@(YES|NO)\s*\n?\s*forKey:@"allowsBackForwardNavigationGestures"/g,
      ),
    ];
    expect(writes.length).toBeGreaterThan(0);
    for (const [, value] of writes) {
      expect(value).toBe("NO");
    }
    expect(mmSource).not.toMatch(
      /setValue:@YES[\s\S]*?allowsBackForwardNavigationGestures/,
    );
  });

  it("exposes a disable-named native symbol and no enable-named remnant", () => {
    expect(mmSource).toContain("disableWindowBackForwardNavigationGestures");
    expect(mmSource).not.toContain(
      "enableWindowBackForwardNavigationGestures",
    );
    expect(wrapperSource).toContain(
      "disableWindowBackForwardNavigationGestures",
    );
    expect(wrapperSource).toContain("disableBackForwardNavigationGestures");
    expect(wrapperSource).not.toMatch(/enable\w*BackForwardNavigationGestures/);
  });

  it("the window-chrome restack pass disables (not enables) the gesture", () => {
    expect(shellSource).toContain("disableBackForwardNavigationGestures");
    expect(shellSource).not.toMatch(/enable\w*BackForwardNavigationGestures/);
  });
});
