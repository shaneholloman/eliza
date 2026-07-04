// Observability boundary for optional-plugin dynamic imports (#12089 item 11 /
// #12661). Route handlers pull optional plugin APIs via dynamic import; on the
// mobile agent bundle many desktop/cloud plugins are deliberately excluded, so
// their import REJECTS with a module-resolution error. The host must NOT let
// that rejection 500 every renderer poll, so it falls back to a no-op API whose
// handlers return `false` (route-dispatch then falls through to the normal 404).
//
// The old fallback swallowed BOTH failure modes into one silent debug line +
// `new Proxy({}, { get: () => () => false })`:
//   1. module-absent  — expected on the mobile bundle (benign, quiet fallthrough)
//   2. present-but-broken / renamed-export — a real regression (a plugin that
//      SHOULD load throws at import time, or an accessed handler export was
//      removed/renamed). Under the old Proxy this was indistinguishable from (1):
//      the route silently 404s forever and the drift is invisible.
//
// This module keeps the fail-safe fallthrough behavior but makes mode (2)
// OBSERVABLE: genuine load errors warn (not debug), and the fallback Proxy warns
// once per accessed-but-absent handler name so a renamed/removed export surfaces
// instead of returning a silent `false`.

import { logger } from "@elizaos/core";

/** Node/Bun error codes emitted when a module cannot be resolved. */
function isModuleResolutionError(err: unknown): boolean {
  if (err == null) return false;
  const code = (err as { code?: unknown }).code;
  if (code === "ERR_MODULE_NOT_FOUND" || code === "MODULE_NOT_FOUND") {
    return true;
  }
  const name = (err as { name?: unknown }).name;
  if (name === "ResolveMessage") return true;
  const message = (err as { message?: unknown }).message;
  if (typeof message === "string") {
    // Cover Bun's ResolveMessage and Node's loader text that don't set `code`.
    return (
      message.startsWith("Cannot find module") ||
      message.includes("Cannot find package") ||
      /Cannot find module ['"]/.test(message)
    );
  }
  return false;
}

/**
 * True only when the resolution failure is about the OPTIONAL PLUGIN PACKAGE
 * ITSELF being absent from the bundle — the EXPECTED mobile-bundle exclusion
 * (quiet debug + fallthrough).
 *
 * A present-but-broken plugin whose own top-level/transitive import is missing
 * ALSO reports `ERR_MODULE_NOT_FOUND` (e.g. `Cannot find package 'x' imported
 * from @elizaos/plugin-mcp/...`). Treating every module-resolution error as
 * "plugin absent" would silence exactly the drift this module exists to surface,
 * so we require the error to name the plugin specifier as the UNRESOLVED module
 * — not merely mention it as the importer. When the failing module isn't the
 * plugin package itself (a transitive dep), this returns false so the caller
 * escalates to an observable warning.
 */
export function isModuleNotFoundError(
  err: unknown,
  specifier?: string,
): boolean {
  if (!isModuleResolutionError(err)) return false;
  if (!specifier) return true; // no specifier context: preserve legacy behavior

  const message = (err as { message?: unknown }).message;
  if (typeof message !== "string") return true;

  // Node/Bun phrase the failure as:
  //   Cannot find module '<unresolved>' [imported from '<importer>']
  //   Cannot find package '<unresolved>' imported from <importer>
  // We only treat it as a benign absence when the UNRESOLVED module (the quoted
  // name right after "Cannot find module/package") IS the plugin package itself
  // (or one of its own subpath exports). If the plugin merely appears as the
  // IMPORTER of some OTHER missing module, that's a broken transitive dep in a
  // PRESENT plugin -> drift, not absence.
  const unresolvedMatch = message.match(
    /Cannot find (?:module|package) ['"]([^'"]+)['"]/,
  );
  if (unresolvedMatch) {
    const unresolved = unresolvedMatch[1];
    return unresolved === specifier || unresolved.startsWith(`${specifier}/`);
  }

  // No quoted unresolved module in the text (unusual): fall back to treating a
  // bare mention of the specifier as absence, but only when it is not framed as
  // the importer of some other missing module.
  if (/imported from/.test(message)) return false;
  return message.includes(specifier);
}

function describeError(err: unknown): string {
  return err instanceof Error ? err.message : String(err);
}

/**
 * Build the no-op fallback API returned when an optional plugin is unavailable.
 *
 * Handlers still resolve to `() => false` so route-dispatch
 * (`if (await handleX(...)) return;`) falls through to the normal 404 instead of
 * 500ing — but the FIRST access of each distinct handler name emits an
 * observable warning tagged as drift when `observeAccess` is true. That way a
 * present-but-renamed export (mode 2) is surfaced, while the benign
 * module-absent case (mode 1, `observeAccess=false`) stays silent.
 */
export function createOptionalPluginFallback<T>(
  key: string,
  observeAccess: boolean,
): T {
  const warned = new Set<string>();
  return new Proxy(
    {},
    {
      get: (_target, prop) => {
        // CRITICAL: this fallback is returned from `async`/Promise catch paths
        // (getOptionalPluginApi, getWalletApi). When a promise resolves with an
        // object, the runtime reads its `then` to test for thenable assimilation.
        // If we returned a callable for `then`, the value would be treated as a
        // thenable and the awaiting promise would NEVER settle — every affected
        // optional-plugin route would hang instead of falling through to 404.
        // Return undefined for promise-assimilation keys and any symbol key
        // (Symbol.toPrimitive, Symbol.iterator, …) so the object stays an inert,
        // non-thenable no-op API.
        if (
          prop === "then" ||
          prop === "catch" ||
          prop === "finally" ||
          typeof prop === "symbol"
        ) {
          return undefined;
        }
        if (observeAccess && !warned.has(prop)) {
          warned.add(prop);
          logger.warn(
            `[eliza-api] optional plugin '${key}' loaded but handler '${prop}' ` +
              `is absent (export missing/renamed?); route dispatch will 404. ` +
              `This is a drift signal, not an expected mobile-bundle exclusion.`,
          );
        }
        return () => false;
      },
    },
  ) as T;
}

/**
 * Classify an optional-plugin import rejection and return the appropriate no-op
 * fallback. Module-not-found → quiet fallthrough (expected bundle exclusion).
 * Any OTHER error → the plugin should have loaded but threw: warn (observable
 * drift) and hand back a fallback whose handler access is also observable.
 */
export function resolveOptionalPluginImportFailure<T>(
  key: string,
  err: unknown,
  specifier?: string,
): T {
  // Prefer the package specifier for the absence check so a broken transitive
  // import inside a PRESENT plugin isn't mistaken for a benign bundle exclusion.
  if (isModuleNotFoundError(err, specifier ?? key)) {
    logger.debug(
      `[eliza-api] optional plugin '${key}' not in this bundle: ${describeError(err)}`,
    );
    return createOptionalPluginFallback<T>(key, false);
  }
  // Present-but-broken: a plugin that resolved but failed to initialize (syntax
  // error, failed top-level init, missing transitive dep). Under the old code
  // this was a silent debug line and every route 404'd invisibly. Surface it.
  logger.warn(
    `[eliza-api] optional plugin '${key}' failed to load (present but errored): ` +
      `${describeError(err)}. Routes for this plugin will 404 until fixed.`,
  );
  return createOptionalPluginFallback<T>(key, true);
}
