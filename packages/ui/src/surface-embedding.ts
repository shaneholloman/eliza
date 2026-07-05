/**
 * Turns a view's declared `native-webview` isolation level into the concrete
 * web-content embedding its page actually renders into, per host platform — the
 * enforcement half of the isolation catalogue (#14181, parent #13452). The
 * catalogue in `surface-isolation.ts` *documents* that `native-webview` views
 * embed a native child web-content surface with its own renderer process; this
 * module is what makes that documentation authoritative: the Browser view's tab
 * renderer reads the resolved manifest through {@link resolveBrowserTabRenderPath}
 * and hands out the native child surface ONLY when the manifest declares
 * `native-webview`, so no view that did not opt into that level can ever be
 * given (or wrongly denied) a separate-renderer native surface.
 *
 * The isolation guarantee this protects: arbitrary third-party web content in
 * the Browser view must never share the host renderer realm — its DOM, globals,
 * storage, and a crash/heavy-load in it must not reach the shell. On desktop
 * that separation is a real, distinct renderer process (the Electron/Electrobun
 * `WebContentsView` / CEF OOPIF the Browser view already mounts); this resolver
 * is the single decision point that selects it.
 *
 * Consumer: `packages/ui/src/components/pages/BrowserWorkspaceView.tsx` (the tab
 * render branch). Per-platform native targets (named by the catalogue): desktop
 * Electron/Electrobun `WebContentsView` (CEF out-of-process frame, per-tab
 * `persist:` partition) — wired today; iOS `WKWebView` on a dedicated
 * `WKProcessPool` with its own `WKWebsiteDataStore`, and Android `WebView` with
 * an out-of-process renderer — the mobile shell has no Browser view yet, so
 * those degrade to `sandboxed-iframe` until the native mode lands (#14181).
 */

import type { SurfaceIsolationLevel } from "@elizaos/core";
import type { BrowserWorkspaceMode } from "./api/browser-contracts";

/**
 * The concrete render path the Browser view uses for a tab's page content.
 *
 *  - `native-child-webview` — a native child web-content surface with its own
 *    renderer process (desktop `WebContentsView` / CEF OOPIF). Third-party web
 *    content runs fully outside the host renderer realm. Selected only when the
 *    resolved manifest declares `native-webview`.
 *  - `sandboxed-iframe` — a sandboxed in-realm `<iframe>` (the web platform has
 *    no native child surface, so `native-webview` degrades to a cross-origin
 *    sandboxed iframe there).
 *  - `server-snapshot` — a server-rendered screenshot preview (cloud mode never
 *    runs page content locally).
 */
export type BrowserTabRenderPath =
  | "native-child-webview"
  | "sandboxed-iframe"
  | "server-snapshot";

/**
 * Resolve which embedding the Browser view uses for its tabs, from the view's
 * declared isolation level and the running host mode.
 *
 * The one enforced invariant (#14181): `native-child-webview` — the only path
 * that hands page content a separate renderer process — is returned **iff** the
 * manifest declares `isolation: "native-webview"` AND the host is the desktop
 * shell that can host a native child surface. Any other isolation level, on any
 * mode, can never resolve to the native surface: it degrades to the in-realm
 * sandboxed iframe (or the cloud snapshot). This is what stops a view that did
 * not opt into `native-webview` from being handed a native renderer surface,
 * and stops the Browser view from silently losing it if its manifest drifts.
 */
export function resolveBrowserTabRenderPath(input: {
  isolation: SurfaceIsolationLevel;
  mode: BrowserWorkspaceMode;
}): BrowserTabRenderPath {
  const { isolation, mode } = input;

  // Cloud shows a server-rendered snapshot; no local web content runs, so the
  // isolation level does not select a local embedding here.
  if (mode === "cloud") return "server-snapshot";

  // The native child web-content surface exists only on the desktop shell and
  // is granted only to the declared `native-webview` level. This conjunction is
  // the enforcement point: drop either condition and no native surface is used.
  if (mode === "desktop" && isolation === "native-webview") {
    return "native-child-webview";
  }

  // Web platform (no native child surface) and any non-`native-webview` view
  // both land here: a sandboxed, in-realm iframe. Third-party content is served
  // cross-origin so the sandbox is meaningful.
  return "sandboxed-iframe";
}
