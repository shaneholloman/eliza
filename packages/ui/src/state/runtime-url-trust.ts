/**
 * Canonical trust gate for persisted/user-entered remote runtime API bases.
 *
 * Remote runtime records are localStorage-backed and can also be created from
 * connect events. Only dial — and attach a bearer token to — loopback,
 * same-origin, private/LAN, CGNAT/Tailscale, or the mobile IPC pseudo-base.
 */
import { isMobileLocalAgentIpcBase } from "../first-run/mobile-runtime-mode";

function isLoopbackHostname(hostname: string): boolean {
  const h = hostname.toLowerCase();
  return h === "127.0.0.1" || h === "localhost" || h === "::1";
}

export function isTrustedRestoreApiBaseUrl(
  apiBase: string | undefined,
): boolean {
  if (!apiBase) return false;
  // The bundled on-device agent's IPC pseudo-base (eliza-local-agent://ipc) is
  // in-process: no network dial, no attacker-choosable host, no bearer-token
  // exfiltration surface.
  if (isMobileLocalAgentIpcBase(apiBase)) return true;

  let parsed: URL;
  try {
    parsed = new URL(apiBase);
  } catch {
    return false;
  }
  if (parsed.protocol !== "http:" && parsed.protocol !== "https:") {
    return false;
  }

  const host = parsed.hostname.toLowerCase().replace(/^\[|\]$/g, "");
  if (isLoopbackHostname(host) || host === "0.0.0.0") return true;
  if (
    typeof window !== "undefined" &&
    host === window.location.hostname.toLowerCase()
  ) {
    return true;
  }
  // IPv6 ULA (fc00::/7) / link-local (fe80::/10).
  if (
    host.includes(":") &&
    (host.startsWith("fc") || host.startsWith("fd") || host.startsWith("fe80:"))
  ) {
    return true;
  }

  // RFC1918 / CGNAT (Tailscale) / link-local IPv4 + private name suffixes.
  return (
    /^10\.\d{1,3}\.\d{1,3}\.\d{1,3}$/.test(host) ||
    /^192\.168\.\d{1,3}\.\d{1,3}$/.test(host) ||
    /^172\.(1[6-9]|2\d|3[0-1])\.\d{1,3}\.\d{1,3}$/.test(host) ||
    /^100\.(6[4-9]|[7-9]\d|1[01]\d|12[0-7])\.\d{1,3}\.\d{1,3}$/.test(host) ||
    /^169\.254\.\d{1,3}\.\d{1,3}$/.test(host) ||
    host === "local" ||
    host === "internal" ||
    host === "lan" ||
    host === "ts.net" ||
    host.endsWith(".local") ||
    host.endsWith(".lan") ||
    host.endsWith(".internal") ||
    host.endsWith(".ts.net")
  );
}
