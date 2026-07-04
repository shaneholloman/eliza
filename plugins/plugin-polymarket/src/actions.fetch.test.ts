/**
 * Error-path tests for `fetchPolymarketJson` (#12275-J fail-closed sweep).
 *
 * Polymarket is a market/trading-readiness plugin, so a malformed or
 * unreadable response body must surface as a distinct, observable provider
 * failure — never a fabricated `null` "success" that reappears downstream as
 * an opaque null-deref (e.g. `status.publicReads.ready`). These tests pin the
 * OK-but-unparseable, error-with-body, and error-without-body boundaries.
 */
import { afterEach, describe, expect, it, vi } from "vitest";
import { fetchPolymarketJson } from "./actions";

function jsonResponse(body: unknown, init: { status?: number } = {}): Response {
  const status = init.status ?? 200;
  return new Response(JSON.stringify(body), {
    status,
    headers: { "content-type": "application/json" },
  });
}

function unparseableResponse(init: { status?: number } = {}): Response {
  const status = init.status ?? 200;
  // Not valid JSON: `Response.json()` rejects, exercising the fail-closed path.
  return new Response("<html>502 Bad Gateway</html>", {
    status,
    headers: { "content-type": "text/html" },
  });
}

function stubFetch(response: Response): void {
  vi.stubGlobal(
    "fetch",
    vi.fn(async () => response),
  );
}

afterEach(() => {
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

describe("fetchPolymarketJson fail-closed body handling", () => {
  it("returns the parsed payload on a well-formed 200 response", async () => {
    stubFetch(jsonResponse({ markets: [{ id: "m1" }], source: "gamma" }));
    const result = await fetchPolymarketJson<{
      markets: unknown[];
      source: string;
    }>("/api/polymarket/markets");
    expect(result).toEqual({ markets: [{ id: "m1" }], source: "gamma" });
  });

  it("throws — not returns null — when a 200 body is unparseable", async () => {
    // The original bug: `response.json().catch(() => null)` on an OK response
    // fell through to `return payload`, handing callers `null as T`. That
    // fabricated success then crashed downstream on the first property access.
    stubFetch(unparseableResponse({ status: 200 }));
    await expect(
      fetchPolymarketJson("/api/polymarket/status"),
    ).rejects.toThrow(/unreadable response body/i);
  });

  it("surfaces the API-provided error message on an error status with a JSON error body", async () => {
    stubFetch(jsonResponse({ error: "rate limited" }, { status: 429 }));
    await expect(
      fetchPolymarketJson("/api/polymarket/markets"),
    ).rejects.toThrow("rate limited");
  });

  it("surfaces a status-coded message on an error status with an unparseable body", async () => {
    stubFetch(unparseableResponse({ status: 503 }));
    await expect(
      fetchPolymarketJson("/api/polymarket/orderbook?token_id=abc"),
    ).rejects.toThrow(/failed with 503/i);
  });

  it("allowErrorStatus returns a parsed error-status body (disabled-trading readiness path)", async () => {
    // place_order relies on this: a 501 body with a structured disabled report
    // must be returned as-is, not thrown.
    stubFetch(
      jsonResponse(
        { enabled: false, reason: "trading disabled", requiredForTrading: [] },
        { status: 501 },
      ),
    );
    const result = await fetchPolymarketJson<{ enabled: boolean }>(
      "/api/polymarket/orders",
      { allowErrorStatus: true },
    );
    expect(result).toEqual({
      enabled: false,
      reason: "trading disabled",
      requiredForTrading: [],
    });
  });

  it("allowErrorStatus still fails closed when the error-status body is unparseable", async () => {
    // With allowErrorStatus, an unparseable body must NOT be returned as a
    // fabricated readiness object; it falls through to the status-coded throw
    // (the place_order handler then reports disabled-with-reason).
    stubFetch(unparseableResponse({ status: 502 }));
    await expect(
      fetchPolymarketJson("/api/polymarket/orders", {
        allowErrorStatus: true,
      }),
    ).rejects.toThrow(/failed with 502/i);
  });
});
