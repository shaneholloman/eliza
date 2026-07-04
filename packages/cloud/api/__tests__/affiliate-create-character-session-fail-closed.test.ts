/**
 * Guard tests for #12787 (cloud API fallback-slop sweep, affiliate slice).
 *
 * `/api/affiliate/create-character` used to swallow a failed
 * `anonymousSessionsService.create` with a `logger.warn(... "continuing")` and
 * fall through to return `201 { success: true, sessionId }`. The anonymous
 * session row IS the spend gate: downstream inference resolves that `sessionId`
 * (auth-anonymous `reserveAnonymousMessageSlot` / `checkAnonymousLimit`) to
 * enforce the per-guest `messages_limit` that caps how much of the application
 * owner's `credit_balance` a single guest can burn. Swallowing the failure
 * handed the caller a `sessionId` backed by no row — fabricated success: the
 * redirect pointed at a dead session (every subsequent chat throws
 * "Session not found") while the response claimed the guest was provisioned.
 *
 * These tests drive the REAL Hono route handler. Only the deep service
 * boundaries are stubbed (auth, org lookup, user/character persistence, the
 * session writer). The first test forces the session writer to throw and pins
 * the fail-closed contract: the request surfaces a structured failure, NOT a
 * `success: true` body with a phantom session. The second test proves the
 * happy path is unaffected (201 + a session that was actually written).
 */

import { beforeEach, describe, expect, mock, test } from "bun:test";

process.env.DATABASE_URL ||= "pglite://memory";

const ORG_ID = "00000000-0000-4000-8000-0000000000aa";

const activeApiKey = {
  id: "key-1",
  organization_id: ORG_ID,
  is_active: true,
  expires_at: null as string | null,
};

// Toggled per-test to make the session writer throw or succeed.
let sessionCreateShouldThrow = false;
let sessionCreateCalls = 0;
let characterCreateCalls = 0;

mock.module("@/lib/services/api-keys", () => ({
  apiKeysService: {
    validateApiKey: async () => activeApiKey,
    incrementUsage: async () => undefined,
  },
}));

mock.module("@/lib/services/organizations", () => ({
  organizationsService: {
    getById: async () => ({ id: ORG_ID, name: "Owner Org" }),
  },
}));

mock.module("@/lib/services/users", () => ({
  usersService: {
    create: async () => ({ id: "anon-user-1" }),
  },
}));

mock.module("@/lib/services/anonymous-sessions", () => ({
  anonymousSessionsService: {
    create: async () => {
      sessionCreateCalls += 1;
      if (sessionCreateShouldThrow) {
        throw new Error("db down: anonymous_sessions insert failed");
      }
      return { id: "sess-1" };
    },
  },
}));

mock.module("@/lib/services/characters/characters", () => ({
  charactersService: {
    create: async () => {
      characterCreateCalls += 1;
      return { id: "char-1", name: "Test", avatar_url: null };
    },
  },
}));

// Import AFTER the mocks are registered so the route binds the stubs.
const { default: app } = await import("../affiliate/create-character/route");

// Minimal Worker env the handler reads (ANON_MESSAGE_LIMIT / redirect base).
const ENV = {
  ANON_MESSAGE_LIMIT: "5",
  NEXT_PUBLIC_APP_URL: "https://app.test",
} as unknown as Record<string, unknown>;

// Cloudflare ExecutionContext stub. The handler defers the best-effort API-key
// usage bump onto `c.executionCtx.waitUntil` (J7); Hono throws on `executionCtx`
// access when none is supplied, so provide a no-op that just awaits the promise.
const EXEC_CTX = {
  waitUntil: (_p: Promise<unknown>) => undefined,
  passThroughOnException: () => undefined,
  props: {},
} as unknown as ExecutionContext;

function post(body: unknown) {
  return app.request(
    "/",
    {
      method: "POST",
      headers: {
        authorization: "Bearer test-affiliate-key",
        "content-type": "application/json",
      },
      body: JSON.stringify(body),
    },
    ENV,
    EXEC_CTX,
  );
}

const validBody = {
  character: { name: "Guest Char", bio: "hi" },
  affiliateId: "aff-e2e",
};

describe("#12787 affiliate/create-character — fail closed on session provisioning", () => {
  beforeEach(() => {
    sessionCreateShouldThrow = false;
    sessionCreateCalls = 0;
    characterCreateCalls = 0;
  });

  test("session-create failure surfaces a structured error, never fabricated success", async () => {
    sessionCreateShouldThrow = true;

    const res = await post(validBody);

    // Must NOT be a 2xx success. The old swallow-and-continue returned 201.
    expect(res.status).toBeGreaterThanOrEqual(500);

    const json = (await res.json()) as {
      success?: boolean;
      sessionId?: string;
    };
    expect(json.success).not.toBe(true);
    // No phantom session token handed back.
    expect(json.sessionId).toBeUndefined();

    // We attempted the write and bailed before creating the character off a
    // dead session.
    expect(sessionCreateCalls).toBe(1);
    expect(characterCreateCalls).toBe(0);
  });

  test("happy path still returns 201 with a session that was actually written", async () => {
    const res = await post(validBody);

    expect(res.status).toBe(201);
    const json = (await res.json()) as {
      success?: boolean;
      sessionId?: string;
      characterId?: string;
    };
    expect(json.success).toBe(true);
    expect(typeof json.sessionId).toBe("string");
    expect(json.characterId).toBe("char-1");

    // The returned session token is backed by a real write.
    expect(sessionCreateCalls).toBe(1);
    expect(characterCreateCalls).toBe(1);
  });

  test("invalid JSON body fails closed with a 400, not a default-accepted body", async () => {
    const res = await app.request(
      "/",
      {
        method: "POST",
        headers: {
          authorization: "Bearer test-affiliate-key",
          "content-type": "application/json",
        },
        body: "{not json",
      },
      ENV,
      EXEC_CTX,
    );

    expect(res.status).toBe(400);
    const json = (await res.json()) as { success?: boolean };
    expect(json.success).not.toBe(true);
    expect(sessionCreateCalls).toBe(0);
    expect(characterCreateCalls).toBe(0);
  });
});
