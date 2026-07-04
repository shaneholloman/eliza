/**
 * #12087 item 12 — unit coverage for the boundary-role resolver registry (the
 * extension point the trunk auth helper consults instead of hardcoding a
 * product's role scheme). Covers registration order, idempotency-per-id,
 * unregister, throw-isolation, and the admin/route-scope authorization rule.
 */
import * as http from "node:http";
import { Socket } from "node:net";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import {
  type BoundaryRoleAccess,
  clearTokenRoleResolvers,
  hasTokenRoleResolver,
  isRegisteredTokenRoleAuthorized,
  registerTokenRoleResolver,
  resolveRegisteredTokenRoleAccess,
  type TokenRoleResolver,
} from "../../src/api/boundary-role-resolver";

function req(): http.IncomingMessage {
  const r = new http.IncomingMessage(new Socket());
  r.headers = { host: "agent.example" };
  return r;
}

function access(
  providerId: string,
  overrides: Partial<BoundaryRoleAccess> = {},
): BoundaryRoleAccess {
  return {
    providerId,
    worldRole: "GUEST",
    principal: "p",
    isAdmin: false,
    isRouteInScope: () => false,
    claims: {},
    ...overrides,
  };
}

function resolver(
  id: string,
  fn: TokenRoleResolver["resolve"],
): TokenRoleResolver {
  return { id, resolve: fn };
}

describe("boundary-role resolver registry", () => {
  beforeEach(() => clearTokenRoleResolvers());
  afterEach(() => clearTokenRoleResolvers());

  it("returns null when no resolver is registered", () => {
    expect(resolveRegisteredTokenRoleAccess(req())).toBeNull();
  });

  it("consults resolvers in registration order; first non-null wins", () => {
    registerTokenRoleResolver(resolver("a", () => access("a")));
    registerTokenRoleResolver(resolver("b", () => access("b")));
    expect(resolveRegisteredTokenRoleAccess(req())?.providerId).toBe("a");
  });

  it("defers past a resolver that returns null", () => {
    registerTokenRoleResolver(resolver("a", () => null));
    registerTokenRoleResolver(resolver("b", () => access("b")));
    expect(resolveRegisteredTokenRoleAccess(req())?.providerId).toBe("b");
  });

  it("is idempotent per id: re-registering the same id replaces, not stacks", () => {
    registerTokenRoleResolver(
      resolver("a", () => access("a", { principal: "v1" })),
    );
    registerTokenRoleResolver(
      resolver("a", () => access("a", { principal: "v2" })),
    );
    expect(resolveRegisteredTokenRoleAccess(req())?.principal).toBe("v2");
    expect(hasTokenRoleResolver("a")).toBe(true);
  });

  it("unregister removes only the matching instance", () => {
    const first = resolver("a", () => access("a"));
    const unregister = registerTokenRoleResolver(first);
    // A later registration of the same id owns the slot; the old unregister
    // must NOT remove the newer instance.
    registerTokenRoleResolver(
      resolver("a", () => access("a", { principal: "new" })),
    );
    unregister();
    expect(hasTokenRoleResolver("a")).toBe(true);
    expect(resolveRegisteredTokenRoleAccess(req())?.principal).toBe("new");
  });

  it("treats a throwing resolver as a non-match (fail-closed for that resolver)", () => {
    registerTokenRoleResolver(
      resolver("a", () => {
        throw new Error("boom");
      }),
    );
    registerTokenRoleResolver(resolver("b", () => access("b")));
    expect(resolveRegisteredTokenRoleAccess(req())?.providerId).toBe("b");
  });

  it("authorizes admin everywhere, non-admin only for in-scope routes", () => {
    registerTokenRoleResolver(
      resolver("admin", () =>
        access("admin", { isAdmin: true, isRouteInScope: () => false }),
      ),
    );
    expect(
      isRegisteredTokenRoleAuthorized(req(), "POST", "/api/anything"),
    ).toBe(true);

    clearTokenRoleResolvers();
    registerTokenRoleResolver(
      resolver("scoped", () =>
        access("scoped", {
          isAdmin: false,
          isRouteInScope: (m, p) => m === "GET" && p === "/ok",
        }),
      ),
    );
    expect(isRegisteredTokenRoleAuthorized(req(), "GET", "/ok")).toBe(true);
    expect(isRegisteredTokenRoleAuthorized(req(), "GET", "/nope")).toBe(false);
    expect(isRegisteredTokenRoleAuthorized(req(), "POST", "/ok")).toBe(false);
  });

  it("normalizes method to upper-case before the scope check", () => {
    registerTokenRoleResolver(
      resolver("scoped", () =>
        access("scoped", { isRouteInScope: (m) => m === "GET" }),
      ),
    );
    expect(isRegisteredTokenRoleAuthorized(req(), "get", "/x")).toBe(true);
  });
});
