import { afterAll, beforeEach, describe, expect, mock, test } from "bun:test";
import { Hono } from "hono";

const requireUserOrApiKeyWithOrg = mock();
const getReferrer = mock();
const reserveAndDeductCredits = mock();
const refundCredits = mock();
const getMcpById = mock();
const recordUsageWithoutDeduction = mock();
const getEndpointUrl = mock();
const getContainerById = mock();
const assertSafeOutboundUrl = mock();
const safeFetch = mock();
const loggerWarn = mock();
const loggerError = mock();

mock.module("@/lib/auth/workers-hono-auth", () => ({
  requireUserOrApiKeyWithOrg,
}));
mock.module("@/lib/services/affiliates", () => ({
  affiliatesService: { getReferrer },
}));
mock.module("@/lib/services/credits", () => ({
  creditsService: { reserveAndDeductCredits, refundCredits },
}));
mock.module("@/lib/services/user-mcps", () => ({
  userMcpsService: {
    getById: getMcpById,
    getEndpointUrl,
    recordUsageWithoutDeduction,
  },
}));
mock.module("@/lib/services/containers", () => ({
  containersService: { getById: getContainerById },
}));
mock.module("@/lib/security/outbound-url", () => ({
  assertSafeOutboundUrl,
}));
mock.module("@/lib/security/safe-fetch", () => ({
  safeFetch,
}));
mock.module("@/lib/utils/logger", () => ({
  logger: { warn: loggerWarn, error: loggerError },
}));

const { default: mcpProxyRoute } = await import("../mcp/proxy/[mcpId]/route");

const originalFetch = globalThis.fetch;

const user = { id: "user-1", organization_id: "org-user" };
const mcp = {
  id: "mcp-1",
  name: "Test MCP",
  description: "Test",
  tools: [],
  organization_id: "org-mcp",
  status: "live",
  is_public: true,
  pricing_type: "per_request",
  credits_per_request: "1",
  x402_price_usd: null,
  x402_enabled: false,
  transport_type: "http",
  endpoint_type: "container",
  container_id: "container-1",
  endpoint_path: "/mcp",
  external_endpoint: null,
};

function app() {
  const parent = new Hono();
  parent.route("/api/mcp/proxy/:mcpId", mcpProxyRoute);
  return parent;
}

function post(
  body = JSON.stringify({ method: "tools/call", params: { name: "search" } }),
) {
  return app().request("http://localhost/api/mcp/proxy/mcp-1", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body,
  });
}

function resetMocks() {
  for (const fn of [
    requireUserOrApiKeyWithOrg,
    getReferrer,
    reserveAndDeductCredits,
    refundCredits,
    getMcpById,
    recordUsageWithoutDeduction,
    getEndpointUrl,
    getContainerById,
    assertSafeOutboundUrl,
    safeFetch,
    loggerWarn,
    loggerError,
  ]) {
    fn.mockReset();
  }
}

function expectRefund(reason: string, extra: Record<string, unknown> = {}) {
  expect(refundCredits).toHaveBeenCalledTimes(1);
  expect(refundCredits.mock.calls[0]?.[0]).toMatchObject({
    organizationId: "org-user",
    amount: 0.01,
    metadata: { mcp_id: "mcp-1", reason, ...extra },
  });
}

beforeEach(() => {
  resetMocks();
  requireUserOrApiKeyWithOrg.mockImplementation(async () => user);
  getReferrer.mockImplementation(async () => null);
  reserveAndDeductCredits.mockImplementation(async () => ({
    success: true,
    newBalance: 9,
    transaction: { id: "reserve-1" },
  }));
  refundCredits.mockImplementation(async () => ({ success: true }));
  getMcpById.mockImplementation(async () => ({ ...mcp }));
  recordUsageWithoutDeduction.mockImplementation(async () => undefined);
  getEndpointUrl.mockImplementation(
    () => "https://example.test/api/mcp/proxy/mcp-1",
  );
  getContainerById.mockImplementation(async () => ({
    load_balancer_url: "https://container.test",
  }));
  assertSafeOutboundUrl.mockImplementation(async (url: string) => new URL(url));
  safeFetch.mockImplementation(async () => new Response("{}", { status: 200 }));
  globalThis.fetch = mock(
    async () => new Response("{}", { status: 200 }),
  ) as unknown as typeof fetch;
});

afterAll(() => {
  globalThis.fetch = originalFetch;
});

describe("MCP proxy post-debit refunds", () => {
  test("refunds when container lookup throws after debit", async () => {
    getContainerById.mockImplementation(async () => {
      throw new Error("db unavailable");
    });

    const response = await post();

    expect(response.status).toBe(502);
    expectRefund("container_lookup_failed");
    expect(recordUsageWithoutDeduction).not.toHaveBeenCalled();
  });

  test("refunds malformed JSON bodies parsed after debit", async () => {
    const response = await post("{not json");

    expect(response.status).toBe(400);
    expectRefund("invalid_json_body");
    expect(globalThis.fetch).not.toHaveBeenCalled();
    expect(recordUsageWithoutDeduction).not.toHaveBeenCalled();
  });

  test("refunds upstream non-ok responses once with status metadata", async () => {
    globalThis.fetch = mock(
      async () => new Response("bad", { status: 503 }),
    ) as unknown as typeof fetch;

    const response = await post();

    expect(response.status).toBe(503);
    expect(await response.text()).toBe("bad");
    expectRefund("mcp_call_failed", { status: 503 });
    expect(recordUsageWithoutDeduction).not.toHaveBeenCalled();
  });

  test("refunds when reading an ok upstream response body fails", async () => {
    globalThis.fetch = mock(
      async () =>
        ({
          ok: true,
          status: 200,
          statusText: "OK",
          headers: new Headers({ "content-type": "application/json" }),
          text: mock(async () => {
            throw new Error("body read failed");
          }),
        }) as unknown as Response,
    ) as unknown as typeof fetch;

    const response = await post();

    expect(response.status).toBe(502);
    expectRefund("mcp_response_read_failed", { status: 200 });
    expect(recordUsageWithoutDeduction).not.toHaveBeenCalled();
  });
});
