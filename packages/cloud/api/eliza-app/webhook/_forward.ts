import { logger } from "@/lib/utils/logger";
import type { AppContext } from "@/types/cloud-worker-env";

type GatewayPlatform = "telegram" | "blooio" | "twilio" | "whatsapp";

const WEBHOOK_GATEWAY_ENV_KEYS = [
  "ELIZA_APP_WEBHOOK_GATEWAY_URL",
  "WEBHOOK_GATEWAY_URL",
  "GATEWAY_WEBHOOK_URL",
] as const;

// Shared secret proving a request actually came from THIS BFF forwarder rather
// than straight at the internal gateway. The forwarders are unauthenticated at
// the edge (providers can't present a Cloud session), so without a local
// signal the gateway has to trust its network boundary alone. Stamping a
// shared secret on the forwarded call lets the gateway reject anything that
// didn't transit the BFF. (finding L3, #12878 / #12227)
//
// This is a DEDICATED secret, deliberately NOT reusing `GATEWAY_INTERNAL_SECRET`
// (which gates the gateway's `/internal/event` K8s path). Coupling the two would
// force every direct provider webhook to present the internal-event secret the
// moment internal events are enabled. Keeping it separate makes the
// forwarder-only gate opt-in without touching existing traffic.
const WEBHOOK_GATEWAY_SECRET_ENV_KEYS = [
  "ELIZA_APP_WEBHOOK_GATEWAY_SECRET",
] as const;

// The header the gateway validates for BFF-forwarded webhooks
// (`validateWebhookForwarderSecret` in
// packages/cloud/services/gateway-webhook/src/internal-auth.ts). Any inbound
// copy of this header from the original caller MUST be stripped before we
// (re)stamp our own value — a client that could inject it would forge the
// "came from the BFF" proof. It is stripped on EVERY proxied request (including
// the Discord handler) and stamped ONLY on gateway forwards.
const GATEWAY_SECRET_HEADER = "x-eliza-webhook-forwarder-secret";

function readStringEnv(c: AppContext, keys: readonly string[]): string | null {
  for (const key of keys) {
    const value = c.env[key];
    if (typeof value === "string" && value.trim()) {
      return value.trim();
    }
  }
  return null;
}

// The forwarder appends the request's trailing path onto the internal gateway
// URL, so a traversal suffix (`..%2f…`, `%2e%2e…`, backslashes) would let a
// caller escape `/webhook/<project>/<platform>` and hit arbitrary gateway paths.
// The URL parser only collapses *literal* dot-segments, so percent-encoded
// separators survive to here. Webhook routes are fixed paths, so a legitimate
// suffix is only ever empty or benign safe-char segments — reject anything else
// rather than forward it. (finding L3, #12878 / #12227)
const SAFE_WEBHOOK_SUFFIX = /^(?:\/[A-Za-z0-9_-]+)*\/?$/;

/**
 * Extract the trailing path to forward from `pathname`, or `null` if it is a
 * traversal attempt. Pure so the allowlist can be exercised directly.
 */
export function safeWebhookSuffix(
  pathname: string,
  platform: string,
): string | null {
  const prefix = `/api/eliza-app/webhook/${platform}`;
  if (!pathname.startsWith(prefix)) return "";
  const suffix = pathname.slice(prefix.length);
  if (suffix === "/" || suffix === "") return "";
  return SAFE_WEBHOOK_SUFFIX.test(suffix) ? suffix : null;
}

function requestSuffix(c: AppContext, platform: string): string | null {
  return safeWebhookSuffix(new URL(c.req.url).pathname, platform);
}

interface ForwardOptions {
  body?: BodyInit | null;
}

interface ProxyOptions extends ForwardOptions {
  // When true, stamp the BFF forwarder secret (gateway forwards only). The
  // trust header is ALWAYS stripped regardless, so a client can never inject it
  // — even on the Discord path, which never stamps.
  stampGatewaySecret?: boolean;
}

async function proxyRequest(
  c: AppContext,
  target: URL,
  serviceName: string,
  options: ProxyOptions = {},
): Promise<Response> {
  const headers = new Headers(c.req.raw.headers);
  headers.delete("host");
  headers.set("x-forwarded-host", new URL(c.req.url).host);
  headers.set(
    "x-forwarded-proto",
    new URL(c.req.url).protocol.replace(":", ""),
  );

  // L3: never let the original caller supply the forwarder trust header. Strip
  // it unconditionally on EVERY proxied request (gateway AND Discord), so a
  // client can never forge the "came from the BFF" proof.
  headers.delete(GATEWAY_SECRET_HEADER);
  // Stamp our own value ONLY on gateway forwards, and only when the dedicated
  // secret is configured. The Discord handler (a potentially separate/public
  // service) must never receive this credential.
  if (options.stampGatewaySecret) {
    const gatewaySecret = readStringEnv(c, WEBHOOK_GATEWAY_SECRET_ENV_KEYS);
    if (gatewaySecret) {
      headers.set(GATEWAY_SECRET_HEADER, gatewaySecret);
    }
  }

  try {
    const upstream = await fetch(target, {
      body:
        c.req.method === "GET" || c.req.method === "HEAD"
          ? undefined
          : (options.body ?? c.req.raw.body),
      headers,
      method: c.req.method,
      redirect: "manual",
    });
    return new Response(upstream.body, {
      headers: upstream.headers,
      status: upstream.status,
      statusText: upstream.statusText,
    });
  } catch (error) {
    logger.error("[ElizaAppWebhook] Upstream request failed", {
      serviceName,
      target: target.origin,
      error: error instanceof Error ? error.message : String(error),
    });
    return c.json(
      {
        success: false,
        code: "WEBHOOK_UPSTREAM_UNREACHABLE",
        error: `${serviceName} is unreachable`,
      },
      502,
    );
  }
}

export async function forwardToWebhookGateway(
  c: AppContext,
  platform: GatewayPlatform,
  options: ForwardOptions = {},
): Promise<Response> {
  const baseUrl = readStringEnv(c, WEBHOOK_GATEWAY_ENV_KEYS);
  if (!baseUrl) {
    return c.json(
      {
        success: false,
        code: "WEBHOOK_GATEWAY_NOT_CONFIGURED",
        error: "Webhook gateway URL is not configured",
      },
      503,
    );
  }

  const suffix = requestSuffix(c, platform);
  if (suffix === null) {
    logger.warn("[ElizaAppWebhook] rejected traversal suffix", { platform });
    return c.json(
      {
        success: false,
        code: "WEBHOOK_INVALID_PATH",
        error: "Invalid webhook path",
      },
      400,
    );
  }

  const project =
    readStringEnv(c, ["ELIZA_APP_WEBHOOK_PROJECT"]) ?? "eliza-app";
  const target = new URL(baseUrl);
  const sourceUrl = new URL(c.req.url);
  target.pathname = `/webhook/${encodeURIComponent(project)}/${platform}${suffix}`;
  target.search = sourceUrl.search;

  return proxyRequest(c, target, "webhook gateway", {
    ...options,
    stampGatewaySecret: true,
  });
}

export async function forwardToDiscordWebhookHandler(
  c: AppContext,
): Promise<Response> {
  const configuredUrl = readStringEnv(c, [
    "ELIZA_APP_DISCORD_WEBHOOK_HANDLER_URL",
    "DISCORD_WEBHOOK_HANDLER_URL",
  ]);
  if (!configuredUrl) {
    return c.json(
      {
        success: false,
        code: "DISCORD_WEBHOOK_HANDLER_NOT_CONFIGURED",
        error: "Discord webhook handler URL is not configured",
      },
      503,
    );
  }

  const target = new URL(configuredUrl);
  target.search = new URL(c.req.url).search;
  return proxyRequest(c, target, "Discord webhook handler");
}
