/**
 * Auth-gate + request-shaping unit tests for the inbox HTTP routes, with the
 * InboxService and queue-operation dispatch mocked out (see the real-runtime
 * suite for end-to-end route coverage). Deterministic — no live model or DB.
 */
import { beforeEach, describe, expect, it, vi } from "vitest";

const executeInboxQueueOperation = vi.fn();

vi.mock("../src/actions/inbox.ts", () => ({
  executeInboxQueueOperation,
}));

vi.mock("../src/inbox/service.ts", () => ({
  InboxService: class {
    constructor() {
      throw new Error("InboxService should not be constructed");
    }
  },
}));

function makeContext(overrides: Record<string, unknown> = {}) {
  return {
    body: undefined,
    params: {},
    query: {},
    headers: {},
    method: "GET",
    path: "/api/lifeops/inbox/triage",
    runtime: { agentId: "agent-inbox-test" },
    inProcess: false,
    isTrustedLocal: false,
    ...overrides,
  };
}

describe("inbox HTTP routes", () => {
  it("rejects authenticated non-local callers before inbox route handling", async () => {
    const { inboxRoutes } = await import("../src/routes/inbox-routes.ts");
    const route = inboxRoutes.find(
      (candidate) =>
        candidate.type === "GET" &&
        candidate.path === "/api/lifeops/inbox/triage",
    );
    expect(route?.routeHandler).toBeDefined();

    const result = await route?.routeHandler?.(makeContext());

    expect(result).toEqual({
      status: 403,
      body: { ok: false, error: "Inbox routes are owner-only" },
    });
  });
});

describe("inbox operation error mapping", () => {
  beforeEach(() => {
    executeInboxQueueOperation.mockReset();
  });

  async function runReply(): Promise<
    { status?: number; body?: { ok?: boolean; error?: string } } | undefined
  > {
    const { inboxRoutes } = await import("../src/routes/inbox-routes.ts");
    const route = inboxRoutes.find(
      (candidate) =>
        candidate.type === "POST" &&
        candidate.path === "/api/lifeops/inbox/:id/reply",
    );
    return route?.routeHandler?.(
      makeContext({
        method: "POST",
        path: "/api/lifeops/inbox/entry-1/reply",
        params: { id: "entry-1" },
        isTrustedLocal: true,
      }),
    ) as Promise<
      { status?: number; body?: { ok?: boolean; error?: string } } | undefined
    >;
  }

  it("maps a not-found entry to 404 (distinct from bad input)", async () => {
    executeInboxQueueOperation.mockRejectedValueOnce(
      new Error("inbox entry entry-1 was not found"),
    );
    const result = await runReply();
    expect(result?.status).toBe(404);
    expect(result?.body?.error).toMatch(/was not found/);
  });

  it("maps a malformed-input failure to 400", async () => {
    executeInboxQueueOperation.mockRejectedValueOnce(
      new Error("reply body is required"),
    );
    const result = await runReply();
    expect(result?.status).toBe(400);
  });

  it("surfaces a genuine operation failure as 500, not 400", async () => {
    // A repository/dispatch failure must reach the caller as a server error,
    // not be masked behind a client 400 the caller cannot act on.
    executeInboxQueueOperation.mockRejectedValueOnce(
      new Error("database connection lost"),
    );
    const result = await runReply();
    expect(result?.status).toBe(500);
    expect(result?.body?.error).toMatch(/database connection lost/);
  });
});
